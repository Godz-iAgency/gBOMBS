// create-checkout-session
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for a gBOMBS subscription. Runs server-side
// so the Stripe secret key is never exposed to the app. The actual subscription
// record (tier/status) is written later by the stripe-webhook function once
// payment/trial is confirmed.
//
// This function enforces three things the app cannot enforce safely on its own:
//   1. DOUBLE-SUBSCRIBE GUARD — a user who already has a trialing/active Stripe
//      subscription is NOT sent to a second checkout; we tell the client to open
//      the billing portal instead.
//   2. ONE FREE TRIAL PER PERSON — the 7-day trial is only attached when this
//      person (by normalized phone OR email) has never started a trial before.
//      Re-subscribing after cancellation, or signing up again with a new email
//      on the same phone, gets a paid checkout with NO trial.
//   3. PHONE ON RECORD — the phone is stored on the Stripe customer, on the
//      users row, and in the trial_fingerprints table for abuse tracking.
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

// Map the app's plan name -> the real Stripe price id (kept server-side so the
// client can never request an arbitrary price).
const PRICE_IDS: Record<string, string | undefined> = {
  starter: Deno.env.get('STRIPE_PRICE_ID_STARTER'),
  premium: Deno.env.get('STRIPE_PRICE_ID_PREMIUM'),
};

const TRIAL_BLOCKED_MESSAGE =
  'A free trial was already used with this phone number or email. ' +
  "You'll be taken to checkout to start your subscription right away.";

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

/**
 * Normalize a phone to digits-only with a US country code so the same number
 * always produces the same fingerprint regardless of formatting.
 *   "+1 (555) 123-4567" -> "15551234567"
 *   "555-123-4567"      -> "15551234567"
 * Returns null when there aren't enough digits to be a real number.
 */
function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  if (digits.length >= 8) return digits; // already country-coded / intl
  return null;
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * Has this person ever started a free trial? Checked by phone first, then email,
 * so a new email on a known phone is still recognized.
 */
async function hasUsedTrial(
  admin: Admin,
  phoneNorm: string | null,
  emailNorm: string
): Promise<boolean> {
  if (phoneNorm) {
    const { data } = await admin
      .from('trial_fingerprints')
      .select('id')
      .eq('phone_normalized', phoneNorm)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  if (emailNorm) {
    const { data } = await admin
      .from('trial_fingerprints')
      .select('id')
      .eq('email_normalized', emailNorm)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { plan, origin, phone } = await req.json();

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return json({ error: `Unknown plan: ${plan}` }, 400);
    }
    if (!origin) {
      return json({ error: 'Missing origin' }, 400);
    }

    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) {
      return json({ error: 'A valid phone number is required.' }, 400);
    }

    // ---- Identify the signed-in user from their JWT ----
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

    const emailNorm = normalizeEmail(user.email);

    // ---- Existing subscription row (customer + current state) ----
    const { data: existing } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    // ---- 1. Double-subscribe guard ----
    // A real Stripe subscription that is still live (trialing, active, or
    // past_due) means there is nothing new to buy — route them to the billing
    // portal to manage it / fix payment instead of creating a second one. Only
    // canceled (or incomplete/expired) subs fall through to a fresh checkout.
    if (
      existing?.stripe_subscription_id &&
      ['trialing', 'active', 'past_due'].includes(existing.status)
    ) {
      return json({ already_subscribed: true });
    }

    // ---- Get or create the Stripe customer, keeping phone current ----
    let customerId = existing?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        phone: phoneNorm,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Store the customer id now so repeat checkouts reuse the same customer.
      await admin
        .from('subscriptions')
        .upsert(
          { user_id: user.id, stripe_customer_id: customerId, platform: 'web' },
          { onConflict: 'user_id' }
        );
    } else {
      // Keep the phone on the existing customer current.
      await stripe.customers.update(customerId, { phone: phoneNorm });
    }

    // ---- 2. One-free-trial-per-person check ----
    const trialUsed = await hasUsedTrial(admin, phoneNorm, emailNorm);
    const grantTrial = !trialUsed;

    // ---- Create the Checkout Session (trial only if eligible) ----
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
      { metadata: { supabase_user_id: user.id, plan } };
    if (grantTrial) {
      subscriptionData.trial_period_days = 7;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      client_reference_id: user.id,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      allow_promotion_codes: true,
    });

    // ---- 3. Record the phone + (if a trial was granted) the fingerprint ----
    // Best-effort: a failure here must not block a paying customer's checkout.
    admin
      .from('users')
      .update({ phone_number: phoneNorm, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {}, () => {});

    if (grantTrial) {
      try {
        await admin.from('trial_fingerprints').insert({
          email_normalized: emailNorm,
          phone_normalized: phoneNorm,
          last_user_id: user.id,
        });
      } catch (_e) {
        // Unique-violation race or transient error — ignore. The trial was
        // already granted by Stripe; worst case the fingerprint isn't recorded.
      }
    }

    return json({
      url: session.url,
      trial_blocked: !grantTrial,
      message: grantTrial ? undefined : TRIAL_BLOCKED_MESSAGE,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
