-- Rename the subscription tier value chef_premium -> wellness_pro.
-- Affects both users.subscription_tier and subscriptions.tier (each has its own
-- CHECK constraint). Existing rows are migrated before the new constraint is
-- applied so nothing violates the check mid-migration.

BEGIN;

-- 1. Drop the existing tier CHECK constraints.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_tier_check;
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

-- 2. Migrate existing data.
UPDATE public.users
  SET subscription_tier = 'wellness_pro'
  WHERE subscription_tier = 'chef_premium';
UPDATE public.subscriptions
  SET tier = 'wellness_pro'
  WHERE tier = 'chef_premium';

-- 3. Re-add the CHECK constraints with the renamed value.
ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_tier_check
  CHECK (subscription_tier IN ('trial', 'standard', 'wellness_pro', 'canceled'));
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('trial', 'standard', 'wellness_pro', 'canceled'));

COMMIT;
