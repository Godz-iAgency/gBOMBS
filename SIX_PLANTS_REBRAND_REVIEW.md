# Six Plants rebrand — local review

Prepared on 2026-10-03 on branch `rebrand/six-plants`. The user authorized a commit and push to this branch for review. No master push or merge, database commands, manual deployments or dashboard changes were made.

## Changes

- Replaced customer-facing old branding in onboarding, Home/check-in, meal planning, recipe labels, Coach, reports, account, plans, invitations and badges.
- Added `src/utils/brand.ts` for the name, display name and tagline. Browser titles stay Six Plants after navigation; added HTML description and Open Graph text without an image or domain change.
- Reworded AI prompts and Coach instructions using Six Plants and whole-food, plant-based language. Preserved models, providers, retries, response schemas, categories and nutritional rules.
- Removed grocery retailer buttons, handlers, state, styles, client library, Edge Function source/config and environment-template keys. Grocery entry points now use list icons.
- Kept grocery generation, ingredients/quantities, grouping, check-offs, progress and persistence. The chef view offers Copy grocery list on web and Share grocery list on native; the plain text preserves quantities, groups and check-off state.
- Kept Location onboarding and persistence; subtitle now says: "Enter your state, city, and ZIP code to continue."
- Removed the unused order badge from the client catalog/fresh-install seed. The new migration updates badge wording and archives its legacy master row without deleting existing awards. Achievement totals count only badges in the visible catalog.
- Removed three unused old full-logo PNGs and the unused old landing video. Kept `gbombs-recipe.mp4` for explicit deletion approval.
- Removed one obsolete Instacart-function comparison from a USDA code comment; nutrition behavior is unchanged.

## Preserved

App configuration identity, package name, `gbombs://`, domain defaults, internal identifiers, database columns/types, applied migrations, auth/routing behavior, Stripe subscriptions, caching, approved brand assets and landing video/layout. Calories/nutrition and Unsplash changes remain Phase 2.

## Validation

- `npx tsc --noEmit`: passed.
- `npx expo export -p web`: passed after the browser-title change.
- Source literal scan: no customer-facing old product name, retailer names or Fuhrman/Nutritarian attribution remains. Internal contracts, database fields and comments can retain technical names.
- Checklist formatter: grouping, quantities, checked/unchecked states, empty lists and no mutation verified.
- Protected files/assets checked against HEAD: unchanged.
- Modified reminder/autopilot Edge Function sources parse cleanly; remote execution and deployment were not tested.
- Isolated Chrome checks with intercepted external requests: landing, signup/login, Home, checklist toggles/persistence, day selection, cached recipes, Coach, achievements, reports and complete onboarding passed without page or console errors.
- Landing verified at 390×844: muted, non-looping 360×640 video ends on its final frame; buttons leave the leaf mark visible. Login also checked at desktop width.
- Chef copy, meal removal/persistence and generated-plan/list response checks: passed with intercepted fixture responses and zero page/console errors.
- No production test account or data rows were created. Live authentication/AI integration checks require the requested owned email domain and one labelled throwaway account. Mocked checks do not prove live service behavior.
- Native Share behavior, Android adaptive-icon appearance and native splash behavior are unverified. `splash-icon.png` exists but the current Expo config does not explicitly reference it. Identity/config remain unchanged.

## Manual release steps — user only

The frontend changes are prepared for branch review. The user controls production release; no master push or merge was performed.

From this repository, inspect migration history first:

```powershell
supabase migration list --linked
```

Only if `20261003000000_six_plants_brand_copy.sql` is the sole pending migration, apply the reviewed text-only migration:

```powershell
supabase migration up --linked
```

If other migrations are pending, review them before running that command. This command applies all pending linked-project migrations; do not run the complete schema seed against production.

Release the two changed function sources and remove the retired retailer function when ready:

```powershell
supabase functions deploy autopilot-generate --project-ref oknnbvtjcjpfzzgfhxza
supabase functions deploy send-daily-reminders --project-ref oknnbvtjcjpfzzgfhxza
supabase functions delete create-instacart-list --project-ref oknnbvtjcjpfzzgfhxza
```

CLI behavior is documented in the [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-functions-delete) and [migration reference](https://supabase.com/docs/reference/cli/supabase-migration-up). These commands were not executed. Kroger production removal was already completed and requires no repeat action here.

Pre-existing grocery-cache limitation: removing a meal preserves the plan timestamp, so a list that was already generated may require the existing refresh button after meal removal. This business logic was left unchanged for the scoped rebrand.

Existing cached recipes/Coach conversations can retain historical wording. No user caches, production data or live secrets were purged. Until the migration/functions/frontend are released, production can still show the previous text.
