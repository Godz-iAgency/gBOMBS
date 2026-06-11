import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';

export type Plan = 'starter' | 'premium';

/**
 * Result of asking the server for a checkout session.
 *  - `already_subscribed`: the user already has a trialing/active subscription;
 *    the caller should open the billing portal instead of starting a new one.
 *  - `checkout`: a Stripe Checkout URL is ready. `trialBlocked` is true when the
 *    7-day trial was withheld (this phone/email already used one) — the caller
 *    shows `message`, then proceeds to the (paid, no-trial) checkout.
 */
export type CheckoutResult =
  | { kind: 'already_subscribed' }
  | { kind: 'checkout'; url: string; trialBlocked: boolean; message?: string };

function currentOrigin(): string {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : 'https://gbombs.app'; // native return flow handled later
}

/** Send the user to a Stripe-hosted URL (checkout or billing portal). */
export async function openCheckoutUrl(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = url;
  } else {
    await Linking.openURL(url);
  }
}

/**
 * Ask the server to create a checkout session for `plan`. Does NOT redirect —
 * the caller inspects the result (to surface a trial-blocked notice or to route
 * an already-subscribed user to the portal) and then calls openCheckoutUrl.
 *
 * `phone` is required: it's stored on record and used to enforce one free trial
 * per person, even across account deletion and re-signup with a new email.
 */
export async function createCheckout(
  plan: Plan,
  phone: string
): Promise<CheckoutResult> {
  const { data, error } = await supabase.functions.invoke(
    'create-checkout-session',
    { body: { plan, phone, origin: currentOrigin() } }
  );

  if (error) throw new Error(error.message);

  const res = data as {
    url?: string;
    error?: string;
    already_subscribed?: boolean;
    trial_blocked?: boolean;
    message?: string;
  };

  if (res?.already_subscribed) {
    return { kind: 'already_subscribed' };
  }
  if (!res?.url) {
    throw new Error(res?.error ?? 'No checkout URL returned');
  }
  return {
    kind: 'checkout',
    url: res.url,
    trialBlocked: Boolean(res.trial_blocked),
    message: res.message,
  };
}

/**
 * Convenience: create a checkout session and immediately redirect. Use this only
 * for the simple path where you don't need to react to the result first.
 */
export async function startCheckout(plan: Plan, phone: string): Promise<void> {
  const res = await createCheckout(plan, phone);
  if (res.kind === 'checkout') await openCheckoutUrl(res.url);
}

/**
 * Open the Stripe Customer Portal so the user can upgrade, downgrade, update
 * their payment method, or cancel. Redirects (web) / opens the URL (native).
 */
export async function openBillingPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    'create-portal-session',
    { body: { origin: currentOrigin() } }
  );

  if (error) throw new Error(error.message);

  const url = (data as { url?: string; error?: string })?.url;
  if (!url) {
    throw new Error(
      (data as { error?: string })?.error ?? 'No portal URL returned'
    );
  }

  await openCheckoutUrl(url);
}
