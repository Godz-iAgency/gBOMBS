/**
 * Subscription access gate.
 * ------------------------------------------------------------------
 * The app uses a CARD-REQUIRED trial: a brand-new user is created with the
 * DB-default `subscription_status = 'trialing'` (and `trial_ends_at`), but with
 * NO real Stripe subscription. That free default must NOT unlock the app.
 *
 * Access is granted only when a real Stripe subscription exists
 * (`subscription_id` populated by the webhook) AND its status is currently
 * active or trialing.
 */
type AccessProfile = {
  subscription_status: string;
  subscription_id: string | null;
} | null;

const ALLOWED_STATUSES = ['active', 'trialing'];

export function hasActiveSubscription(profile: AccessProfile): boolean {
  if (!profile) return false;
  if (!profile.subscription_id) return false; // free DB-default trial → blocked
  return ALLOWED_STATUSES.includes(profile.subscription_status);
}
