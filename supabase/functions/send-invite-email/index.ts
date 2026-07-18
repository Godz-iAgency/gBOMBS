// send-invite-email
// ---------------------------------------------------------------------------
// Phase B Chunk 3: emails a professional (chef / trainer-nutritionist) their
// client's invite so they can connect without scanning a QR in person.
//
// This is purely a NEW DELIVERY CHANNEL for an invite the client already
// generated — it does NOT create invites. The client taps "Generate invite"
// (create_professional_invite RPC, Premium-gated, per-slot) which produces the
// pending connection + code; this function just mails that existing code.
//
// Security: the caller must be the SIGNED-IN CLIENT who owns a PENDING
// connection bearing this code. We validate that with the service-role client
// before sending, so nobody can drive our Resend account to spam arbitrary
// addresses with arbitrary codes.
//
// The email leads with the bare CODE (works everywhere — the pro types it into
// "Connect to a Client") and offers the gbombs://connect?code= deep link as a
// convenience for anyone reading it on a phone that already has the app.
//
// Auth: verify_jwt off; the user's JWT is validated inside (so the CORS
// preflight isn't blocked when called from the web app).
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_URL = 'https://api.resend.com/emails';

// The "From" address. Resend requires a VERIFIED DOMAIN to send to arbitrary
// recipients; until gbombs.app is verified in Resend, the built-in test sender
// (onboarding@resend.dev) works but ONLY delivers to the Resend account owner's
// own email. Override with INVITE_FROM_EMAIL once a domain is verified.
const FROM_EMAIL =
  Deno.env.get('INVITE_FROM_EMAIL') ?? 'gBOMBS <onboarding@resend.dev>';

// Used to build the deep link + a human-facing fallback URL in the email.
const APP_SCHEME = 'gbombs';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://gbombs.app';

const ROLE_LABEL: Record<string, string> = {
  chef: 'Personal Chef',
  trainer_nutritionist: 'Trainer / Nutritionist',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Basic, forgiving email shape check (real validation is Resend's job). */
function looksLikeEmail(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

/** Escape user-supplied text before it goes into the HTML body. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(opts: {
  clientName: string;
  roleLabel: string;
  code: string;
  deepLink: string;
  fallbackUrl: string;
}): string {
  const { clientName, roleLabel, code, deepLink, fallbackUrl } = opts;
  return `
  <div style="margin:0;padding:0;background:#0A0A0A;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:26px;font-weight:800;color:#5A9A3A;letter-spacing:1px;">gBOMBS</span>
      </div>
      <div style="background:#1A1A1A;border:1px solid #2D2D2D;border-radius:16px;padding:28px 24px;">
        <h1 style="margin:0 0 12px;color:#F5F5F0;font-size:20px;font-weight:800;">
          ${esc(clientName)} invited you
        </h1>
        <p style="margin:0 0 20px;color:#B8B8B0;font-size:15px;line-height:22px;">
          You've been invited to connect as their <strong style="color:#F5F5F0;">${esc(
            roleLabel
          )}</strong> on gBOMBS — the whole-food plant-based meal planning app.
          Connecting is free for you; your client keeps full control of access.
        </p>

        <p style="margin:0 0 8px;color:#B8B8B0;font-size:13px;">Your invite code</p>
        <div style="background:#0A0A0A;border:1px solid #5A9A3A;border-radius:12px;padding:16px;text-align:center;margin-bottom:20px;">
          <span style="color:#F5F5F0;font-size:26px;font-weight:800;letter-spacing:6px;">${esc(
            code
          )}</span>
        </div>

        <a href="${esc(deepLink)}"
           style="display:block;background:#5A9A3A;color:#FFFFFF;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:14px;border-radius:12px;margin-bottom:16px;">
          Open gBOMBS &amp; connect
        </a>

        <p style="margin:0;color:#8A8A82;font-size:13px;line-height:20px;">
          On your phone with the app installed, the button above drops you
          straight into the connect screen. Otherwise, open gBOMBS, tap
          <strong style="color:#B8B8B0;">Connect to a client</strong>, and enter
          the code above.
        </p>
      </div>

      <p style="text-align:center;margin:20px 0 0;color:#5A5A52;font-size:12px;">
        Didn't expect this? You can safely ignore this email — no account is
        created until you connect. &nbsp;·&nbsp;
        <a href="${esc(fallbackUrl)}" style="color:#5A5A52;">gBOMBS</a>
      </p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, role, email } = await req
      .json()
      .catch(() => ({}) as Record<string, unknown>);

    if (typeof code !== 'string' || !code.trim()) {
      return json({ error: 'Missing invite code.' }, 400);
    }
    if (!looksLikeEmail(email)) {
      return json({ error: 'Enter a valid email address.' }, 400);
    }

    // ---- Identify the signed-in client from their JWT ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);
    if (userError || !user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    // ---- SECURITY: the caller must own a PENDING connection with this code ----
    const { data: conn, error: connError } = await admin
      .from('professional_connections')
      .select('id, role, status, client_id')
      .eq('invite_code', code.trim())
      .eq('client_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (connError) return json({ error: connError.message }, 500);
    if (!conn) {
      // Not their code, already accepted, or revoked — don't send anything.
      return json({ error: 'That invite is no longer available.' }, 403);
    }

    // ---- Personalize with the client's name ----
    const { data: profile } = await admin
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    const clientName =
      (profile?.full_name as string | null)?.trim() || 'Your client';
    const roleLabel = ROLE_LABEL[conn.role as string] ?? 'professional';

    const deepLink = `${APP_SCHEME}://connect?code=${encodeURIComponent(
      code.trim()
    )}`;
    const fallbackUrl = `${PUBLIC_SITE_URL}/connect?code=${encodeURIComponent(
      code.trim()
    )}`;

    // ---- Send via Resend ----
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email.trim()],
        subject: `${clientName} invited you to gBOMBS as their ${roleLabel}`,
        html: buildHtml({
          clientName,
          roleLabel,
          code: code.trim(),
          deepLink,
          fallbackUrl,
        }),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Resend send failed:', res.status, detail);
      return json(
        { error: 'Could not send the email. Please try again.' },
        502
      );
    }

    return json({ sent: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
