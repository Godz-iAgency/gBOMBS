// send-daily-reminders
// ---------------------------------------------------------------------------
// Sends the "you haven't logged today" push reminder. Designed to be called
// HOURLY by pg_cron. For each opted-in user with a push token, it computes the
// user's LOCAL time from their stored IANA timezone and only reminds those for
// whom it's currently REMINDER_HOUR (7pm) and who have not logged today (in
// their local calendar day). Delivery goes through Expo's free push service.
//
// Auth: verify_jwt is disabled (config.toml) because pg_cron is not a logged-in
// user. Instead we require the service-role key in the Authorization header, so
// only callers that already hold that secret (i.e. the cron job) can trigger a
// send. Never expose the service-role key to the client.
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

const REMINDER_HOUR = 19; // 7pm local time
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The current local hour (0–23) and YYYY-MM-DD date for an IANA timezone. */
function localParts(tz: string): { hour: number; date: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = parseInt(get('hour'), 10);
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { hour: Number.isNaN(hour) ? -1 : hour, date };
}

interface ExpoMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
}

Deno.serve(async (req) => {
  // ---- Gate: only the cron (holding the service-role key) may call this ----
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ---- Candidate users: opted in + have a token ----
  const { data: users, error } = await admin
    .from('users')
    .select('id, push_token, timezone, notifications_enabled')
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null);

  if (error) return json({ error: error.message }, 500);

  const messages: ExpoMessage[] = [];

  for (const u of users ?? []) {
    const tz = u.timezone || 'America/New_York';
    const { hour, date } = localParts(tz);
    if (hour !== REMINDER_HOUR) continue; // not 7pm for this user yet

    // Already logged today (their local date)? Then no reminder needed.
    const { data: logged } = await admin
      .from('daily_scores')
      .select('id')
      .eq('user_id', u.id)
      .eq('score_date', date)
      .maybeSingle();
    if (logged) continue;

    messages.push({
      to: u.push_token as string,
      sound: 'default',
      title: '🌱 Keep your streak alive',
      body: "You haven't logged your gBOMBS today. Tap to check in before midnight.",
      data: { type: 'daily_reminder' },
      channelId: 'default',
    });
  }

  // ---- Send to Expo in chunks of 100 (their per-request limit) ----
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
    if (res.ok) sent += chunk.length;
    else console.error('Expo push failed:', res.status, await res.text());
  }

  return json({ checked: users?.length ?? 0, reminded: sent });
});
