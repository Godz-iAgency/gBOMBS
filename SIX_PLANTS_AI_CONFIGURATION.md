# Six Plants private AI deployment

Prepared October 3, 2026. This change is local and has not been deployed.

The browser now sends authenticated requests to the Supabase `ai-generate` function. Gemini and the existing Groq fallback credentials remain in Supabase secrets. There is no direct browser fallback. Model selection and subscriptions are verified on the server. The main model remains `gemini-3.5-flash-lite`; Coach retains `gemini-3.1-flash-lite` as its backup, and generation retains the existing Groq fallback and retry order.

## Required rollout order

Complete the backend steps BEFORE publishing this frontend to master. Publishing the frontend alone will leave AI features unavailable until the function and migration are ready.

1. Create a fresh Gemini key in your existing Google project. The previously public key must eventually be revoked, including any key visible in screenshots or earlier browser bundles. Rotate Groq too if its public-prefixed key was configured. Leave the Gemini key without HTTP-referrer restrictions because requests now come from the server; restrict its API access to the Generative Language API. Keep quotas appropriate to the project.
2. From the repository folder, copy the safe template:

   ```powershell
   Copy-Item -LiteralPath supabase/functions/ai-generate/secrets.example -Destination supabase/.env.ai.local
   ```

   Edit the ignored `supabase/.env.ai.local` file locally. Replace the Gemini placeholder with the fresh key. If using the existing Groq fallback, replace its placeholder too; otherwise remove the `GROQ_API_KEY` line. Never upload a placeholder. Keep the model values in this template. Do not paste keys into chat or commands. Do not upload the app's entire `.env` file.

3. Review pending migrations, then apply them yourself:

   ```powershell
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   ```

   The new security migration is `supabase/migrations/20261003010000_private_ai_gateway.sql`. The dry run may also list earlier unapplied migrations; review those before running the second command. Alternatively apply this new migration file in the Supabase SQL editor yourself and reconcile its migration history with your normal workflow.

4. Upload the private secrets and deploy the new function:

   ```powershell
   npx supabase secrets set --env-file supabase/.env.ai.local --project-ref oknnbvtjcjpfzzgfhxza
   npx supabase functions deploy ai-generate --project-ref oknnbvtjcjpfzzgfhxza
   ```

   `verify_jwt = false` permits browser CORS preflight; EVERY POST still verifies the actual user with Supabase Auth, rejects anonymous Auth users, and checks server-owned subscription records. It does not allow anonymous AI calls. The project service-role key is supplied by Supabase automatically; never copy it into a browser variable.

5. Remove `EXPO_PUBLIC_GEMINI_API_KEY` and `EXPO_PUBLIC_GROQ_API_KEY` from Vercel Production/Preview. The public Gemini/Groq model overrides are also obsolete; the server template now controls them. Keep `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, which are intended for the client. These new AI credentials belong in Supabase, not Vercel.
6. Once the backend is ready, commit and push this frontend to master when authorized. Rebuild/redeploy Vercel with its cache cleared. Reload the app and verify one Coach response with your authorized test account. Check the browser's Network panel: AI calls must go to `/functions/v1/ai-generate`, without requests to Google or Groq. A Supabase user session token on that request is expected; a provider key is not.
7. Revoke the old exposed Gemini/Groq keys after the new deployment is working. Old browser bundles and caches cannot be made private retroactively. Anyone running an old bundle must reload. Updating `GEMINI_API_KEY` also updates the existing Autopilot function's server secret; its model and logic are unchanged.

## Server protections

- Only real signed-in users are accepted. The caller cannot submit another user id, subscription tier, provider URL, or model.
- Paid/trial access requires a real Stripe subscription in the server-owned `subscriptions` table. User-editable profile labels are not trusted. Connected professionals retain access through an active Premium client.
- Coach: 20 replies/day Starter, 50 Premium. Separate generation budget: 100 requests/day Starter, 200 Premium. Signed-in onboarding food validation remains available with a 20/day limit and a 150-token output cap. Provider retries remain within one reservation.
- Daily allowances renew at midnight UTC. Coach shows the renewal time in the device's local time. Usage is shared across browsers and devices; clearing history/storage does not reset it. Failed generation releases the daily reservation.
- Up to 10 requests per minute and 3 simultaneous requests per user. Postgres advisory locks serialize reservations across workers. Crashed pending reservations expire after 180 seconds. Requests have a 64 KiB body cap, task-specific output-token caps, and bounded upstream timeouts.
- Usage metadata contains user id, bucket, status and timestamps only. No prompts, chat text, replies, API keys or session tokens are stored in the new table. Old records for an active user are removed after 30 days when that user makes another request. Inactive users' metadata remains until cleanup/account deletion.
- Row Level Security plus grants prevent anonymous/authenticated clients from reading or modifying usage records or executing quota functions. Only the private server client can do so. Database/auth failures block AI calls.
- Browser origins default to `https://gbombs.app` and `https://www.gbombs.app`. For Vercel previews or local development, explicitly add their exact origins to `AI_ALLOWED_ORIGINS`; do not use `*`. Native apps without an Origin header still require valid user authentication. Add the new Six Plants domain here when it is ready.
- Provider response bodies, raw errors and credential-bearing URLs are never returned to the UI or logged by the gateway. Readable error messages preserve retry affordances.

## Local verification

```powershell
node scripts/test-ai-gateway.cjs
node scripts/test-ai-authorization.cjs
node scripts/check-ai-gateway.cjs
npx tsc --noEmit
npx expo export -p web
node scripts/check-private-ai-bundle.cjs
```

The tests use fake credentials and mocked dependencies; they never call the production database or an AI provider. The gateway's core and Deno entrypoint are typechecked against the existing installed Supabase SDK without adding dependencies. Actual SQL application, PostgreSQL concurrency checks, deployed Deno execution, provider response generation and live project quota require the owner-run backend rollout above. Do not interpret the offline checks as a successful production deployment.

Completed locally: 43 gateway/routing checks, 24 entrypoint authorization checks, app and gateway typechecks, production web export, and actual-value credential scanning of all 76 exported files. No checked private credential was found in the export. Mocked browser checks covered 320/370/390/1280-pixel layouts, Coach allowances/history/storage clearing, exhausted allowances and Premium limits. Separate browser checks exercised Coach, meal plans, recipe generation and grocery refresh on both tiers, verified saved model metadata, and checked readable failure messages. No production backend or content-generation request was sent.

## Google free-tier limits

The selected Flash-Lite model supports a free tier, but a fixed 500 requests/day was not confirmed for this project. Active quotas are project/model-specific and should be checked in AI Studio. The new app allowances are per-user protections; they do not increase or replace Google's shared project quota.

Official references: [Expo public environment variables](https://docs.expo.dev/guides/environment-variables/), [Supabase function authorization](https://supabase.com/docs/guides/functions/auth), [Supabase function secrets](https://supabase.com/docs/guides/functions/secrets), [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
