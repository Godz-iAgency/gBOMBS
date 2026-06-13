/**
 * Subscription plan state — the single source of truth for how a member's plan
 * is labeled across the app (Home badge + Profile block).
 * ------------------------------------------------------------------
 * The app is card-required (see lib/access.ts): anyone who reaches the main tabs
 * has a real Stripe subscription that is either `trialing` or `active`. So there
 * are exactly three states a member can be in:
 *
 *   - trial    → in their 7-day Stripe trial (card on file, not yet charged)
 *   - standard → active, Starter tier
 *   - premium  → active, Premium tier
 *
 * Cancel/upgrade lives ONLY on the Profile tab (behind the Stripe portal), never
 * on Home — that friction is intentional.
 */

export type PlanState = 'trial' | 'standard' | 'premium';

type PlanProfile = {
  subscription_tier?: string | null;
  subscription_status?: string | null;
} | null | undefined;

/** Resolve the member's plan state. Trialing wins over tier — a trialing
 *  Premium member still reads as "Free trial" until the trial converts. */
export function getPlanState(profile: PlanProfile): PlanState {
  if (profile?.subscription_status === 'trialing') return 'trial';
  if (profile?.subscription_tier === 'wellness_pro') return 'premium';
  return 'standard';
}

/** Short label for the Home header badge. */
export const PLAN_BADGE_LABEL: Record<PlanState, string> = {
  trial: 'Free trial',
  standard: 'Standard',
  premium: 'Premium',
};

/** Full plan name for the Profile subscription block. */
export const PLAN_TITLE: Record<PlanState, string> = {
  trial: 'Free trial',
  standard: 'gBOMBS Starter',
  premium: 'gBOMBS Premium',
};

/** Profile CTA label per state. Trial/Premium → portal; Standard → upgrade. */
export const PLAN_CTA_LABEL: Record<PlanState, string> = {
  trial: 'Manage subscription',
  standard: 'Upgrade to Premium',
  premium: 'Manage subscription',
};
