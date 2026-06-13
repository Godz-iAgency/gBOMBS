import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from './supabase';

// Lets the auth session finish cleanly if the browser is dismissed (web no-op
// on native, but required by expo-auth-session's contract).
WebBrowser.maybeCompleteAuthSession();

/**
 * Convert the deep-link URL Google sends us back into a live Supabase session.
 * Supports both the PKCE response (`?code=…`) — which is what supabase-js uses
 * by default — and the implicit response (`#access_token=…`) as a fallback.
 */
async function createSessionFromUrl(url: string): Promise<void> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token, code } = params;

  // PKCE: exchange the one-time code (paired with the verifier we stored at the
  // start of the flow) for a session.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  // Implicit: the tokens came straight back in the URL fragment.
  if (access_token) {
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
    return;
  }

  throw new Error('Google did not return a session. Please try again.');
}

/**
 * Google OAuth for both web and native.
 *
 * - Web: classic full-page redirect; the session is picked up by the client's
 *   `detectSessionInUrl` when the browser returns to the origin.
 * - Native: ask Supabase for the Google URL without auto-redirecting, open it in
 *   an in-app auth browser, then complete the session from the `gbombs://`
 *   deep link Google sends back.
 *
 * Returns `{ cancelled: true }` if the user backs out of the browser so callers
 * can stay silent instead of showing an error.
 */
export async function signInWithGoogle(): Promise<{ cancelled: boolean }> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return { cancelled: false }; // browser redirects away before this matters
  }

  // Native — force the custom scheme so we always get `gbombs://` (a bare
  // makeRedirectUri() can resolve to an exp+… proxy URL inside a dev client).
  // This exact value must be listed under Supabase → Auth → URL Configuration.
  const redirectTo = makeRedirectUri({ scheme: 'gbombs' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'success') {
    await createSessionFromUrl(result.url);
    return { cancelled: false };
  }

  // 'cancel' (user tapped done) or 'dismiss' (swiped away) — not an error.
  return { cancelled: true };
}
