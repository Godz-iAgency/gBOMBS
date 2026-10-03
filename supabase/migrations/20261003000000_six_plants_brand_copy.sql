-- Six Plants display copy only. Apply manually; existing identifiers and awards stay intact.
BEGIN;

UPDATE public.badges
SET badge_name = 'First Six Plants Day',
    badge_description = 'Hit all six plant groups in a single day'
WHERE badge_key = 'first_gbombs_day';

UPDATE public.badges
SET badge_description = 'Hit all six plant groups every day for a full week'
WHERE badge_key = 'perfect_week';

UPDATE public.badges
SET badge_description = 'Shared your first Six Plants score'
WHERE badge_key = 'social_sharer';

-- Removed from the client catalog and fresh-install seed. Preserve this legacy
-- master row because existing user_badges may reference its UUID.
UPDATE public.badges
SET badge_name = 'Archived Grocery Badge',
    badge_description = 'This badge is retired.',
    badge_icon = '📋'
WHERE badge_key = 'grocery_order_placed';

COMMIT;
