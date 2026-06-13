/**
 * Badge catalog — client-side metadata mirroring the `badges` master table.
 * ------------------------------------------------------------------
 * Keyed by `badge_key`, this drives the trophy case (so every badge — earned or
 * locked — renders even before any are unlocked) and supplies the celebratory
 * copy shown in the unlock modal. The DB `badges` table is still the source of
 * truth for the badge_id we write to `user_badges`; this catalog is the display
 * + UX layer.
 *
 * `earnable` marks which badges the current build can actually award. The four
 * streak/score badges unlock from the daily check-in today; the rest depend on
 * features still to be built (Instacart orders, meal swaps, pantry, recipe
 * views, social sharing) and show as "Coming soon" in the trophy case until then.
 */

export interface BadgeDef {
  key: string;
  name: string;
  description: string;
  /** Emoji icon (matches the DB seed). */
  icon: string;
  /** Warm 1–2 sentence message shown when the badge is unlocked. */
  unlockMessage: string;
  /** True if this build can award it; false = depends on an unbuilt feature. */
  earnable: boolean;
}

export const BADGE_CATALOG: BadgeDef[] = [
  // ---- Earnable now (daily check-in) ----
  {
    key: 'first_gbombs_day',
    name: 'First gBOMBS Day',
    description: 'Hit all 6 gBOMBS categories in a single day',
    icon: '🌱',
    unlockMessage:
      'Your very first perfect gBOMBS day — all six categories in one day. This is exactly what longevity eating looks like.',
    earnable: true,
  },
  {
    key: 'streak_7',
    name: '7 Day Streak',
    description: 'Logged your meals 7 days in a row',
    icon: '🔥',
    unlockMessage:
      'Seven days straight! You\'ve turned healthy eating into a habit — this is where real change starts.',
    earnable: true,
  },
  {
    key: 'perfect_week',
    name: 'Perfect Week',
    description: 'Hit all 6 categories every day for 7 days straight',
    icon: '⭐',
    unlockMessage:
      'A flawless week — all six gBOMBS, every single day. Elite consistency. Your body is thanking you.',
    earnable: true,
  },
  {
    key: 'streak_30',
    name: '30 Day Streak',
    description: 'Logged your meals 30 days in a row',
    icon: '🏆',
    unlockMessage:
      'Thirty days. This isn\'t a streak anymore — it\'s who you are now. Incredible discipline.',
    earnable: true,
  },

  // ---- Coming soon (unlock when the feature ships) ----
  {
    key: 'first_vegan_month',
    name: 'Plant-Based Month',
    description: 'Completed one full month of plant-based eating',
    icon: '🥦',
    unlockMessage: 'A full month of plant-based eating. Remarkable.',
    earnable: false,
  },
  {
    key: 'grocery_order_placed',
    name: 'First Order',
    description: 'Placed your first Instacart grocery order',
    icon: '🛒',
    unlockMessage: 'Groceries on the way — meal planning just got effortless.',
    earnable: false,
  },
  {
    key: 'meal_swapper',
    name: 'Meal Swapper',
    description: 'Swapped 5 meals in your weekly plan',
    icon: '🔄',
    unlockMessage: 'Five swaps in — you\'re making this plan truly yours.',
    earnable: false,
  },
  {
    key: 'pantry_pro',
    name: 'Pantry Pro',
    description: 'Added 20 items to your pantry tracker',
    icon: '🏠',
    unlockMessage: 'Your pantry is dialed in — smarter lists ahead.',
    earnable: false,
  },
  {
    key: 'nutrition_nerd',
    name: 'Nutrition Nerd',
    description: 'Viewed nutrition details on 10 different meals',
    icon: '🔬',
    unlockMessage: 'You love the details — that knowledge compounds.',
    earnable: false,
  },
  {
    key: 'social_sharer',
    name: 'Social Sharer',
    description: 'Shared your first gBOMBS score',
    icon: '📱',
    unlockMessage: 'Sharing the journey — inspiring others as you go.',
    earnable: false,
  },
];

/** Quick lookup by badge_key. */
export const BADGE_BY_KEY: Record<string, BadgeDef> = Object.fromEntries(
  BADGE_CATALOG.map((b) => [b.key, b])
);
