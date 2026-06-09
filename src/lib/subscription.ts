import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';

export type Plan = 'starter' | 'premium';

/**
 * Kicks off Stripe Checkout for the given plan. Calls the server-side
 * `create-checkout-session` Edge Function (which holds the Stripe secret key),
 * then sends the user to Stripe's hosted checkout page.
 *
 * Web: redirects the current tab. Native: opens the URL (full native deep-link
 * return flow is wired in a later task).
 */
export async function startCheckout(plan: Plan): Promise<void> {
  const origin =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://gbombs.app'; // native return flow handled later

  const { data, error } = await supabase.functions.invoke(
    'create-checkout-session',
    { body: { plan, origin } }
  );

  if (error) throw new Error(error.message);

  const url = (data as { url?: string; error?: string })?.url;
  if (!url) {
    throw new Error((data as { error?: string })?.error ?? 'No checkout URL returned');
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = url;
  } else {
    await Linking.openURL(url);
  }
}
