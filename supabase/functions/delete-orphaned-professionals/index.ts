// delete-orphaned-professionals
// ---------------------------------------------------------------------------
// Phase B lifecycle: permanently deletes pure-professional accounts that have
// been client-less for 48 hours. Called HOURLY by pg_cron
// (schedule_delete_orphaned_professionals.sql).
//
// A professional's account enters the queue when their last client revokes them
// (revoke_professional_connection sets users.pending_deletion_at = now()+48h,
// only for professionals with no personal paid subscription). This function:
//
//   • WARN: for queued accounts still inside the 48h window that haven't been
//     warned, push "no active clients — deleting in 48h" and mark deletion_warned.
//   • CANCEL: if the account has since gained an active/pending connection OR a
//     paid subscription, clear the clock (they're safe — accept_professional_invite
//     also clears it, this is a belt-and-suspenders re-check).
//   • DELETE: once past the window and STILL orphaned, delete the auth account.
//     public.users cascades on auth-user delete; professional_edits.professional_id
//     and professional_connections.professional_id are SET NULL, so the CLIENT's
//     history + revoked-connection rows survive (attribution via professional_name).
//
// Auth: verify_jwt off; requires the service-role key in the Authorization
// header (same gate as the other cron-driven functions).
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Active/pending connection count for a professional (0 = orphaned). */
async function activeConnectionCount(proId: string): Promise<number> {
  const { count } = await admin
    .from('professional_connections')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', proId)
    .in('status', ['pending', 'active']);
  return count ?? 0;
}

interface Candidate {
  id: string;
  pending_deletion_at: string;
  deletion_warned: boolean;
  subscription_id: string | null;
  subscription_status: string;
  push_token: string | null;
}

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: queued, error } = await admin
    .from('users')
    .select(
      'id, pending_deletion_at, deletion_warned, subscription_id, subscription_status, push_token'
    )
    .not('pending_deletion_at', 'is', null);
  if (error) return json({ error: error.message }, 500);

  const now = Date.now();
  const results: Record<string, string> = {};
  let deleted = 0;
  let warned = 0;
  let cancelled = 0;

  for (const u of (queued ?? []) as Candidate[]) {
    // Safety re-check: did they get rescued since the clock started?
    const hasPaid =
      !!u.subscription_id &&
      ['active', 'trialing'].includes(u.subscription_status);
    const stillOrphaned = (await activeConnectionCount(u.id)) === 0;

    if (hasPaid || !stillOrphaned) {
      await admin
        .from('users')
        .update({ pending_deletion_at: null, deletion_warned: false })
        .eq('id', u.id);
      results[u.id] = 'cancelled: reconnected or subscribed';
      cancelled += 1;
      continue;
    }

    const due = new Date(u.pending_deletion_at).getTime();

    if (now >= due) {
      // Past the grace window and still orphaned → permanent delete.
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) {
        results[u.id] = `delete failed: ${delErr.message}`;
        console.error(`delete failed for ${u.id}:`, delErr.message);
      } else {
        results[u.id] = 'deleted';
        deleted += 1;
      }
      continue;
    }

    // Inside the window — send the one-time heads-up if we haven't yet.
    if (!u.deletion_warned) {
      if (u.push_token) {
        try {
          await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([
              {
                to: u.push_token,
                sound: 'default',
                title: 'No active clients',
                body: 'You have no clients connected. Your professional account will be removed in 48 hours unless a client connects with you.',
                data: { type: 'professional_deletion_warning' },
                channelId: 'default',
              },
            ]),
          });
        } catch {
          /* push is best-effort */
        }
      }
      await admin
        .from('users')
        .update({ deletion_warned: true })
        .eq('id', u.id);
      results[u.id] = 'warned';
      warned += 1;
    } else {
      results[u.id] = 'waiting';
    }
  }

  return json({
    queued: queued?.length ?? 0,
    deleted,
    warned,
    cancelled,
    results,
  });
});
