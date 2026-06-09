// create-checkout-session
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for a gBOMBS subscription (7-day trial,
// card required). Runs server-side so the Stripe secret key is never exposed
// to the app. The actual subscription record (tier/status) is written later by
// the stripe-webhook function once payment/trial is confirmed.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { plan, origin } = await req.json();

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return json({ error: `Unknown plan: ${plan}` }, 400);
    }
    if (!origin) {
      return json({ error: 'Missing origin' }, 400);
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

    // ---- Get or create the Stripe customer for this user ----
    const { data: existing } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Store the customer id now so repeat checkouts reuse the same customer.
      // Defaults on the row (tier/status) are placeholders; the webhook sets
      // the real values after checkout completes.
      await admin
        .from('subscriptions')
        .upsert(
          { user_id: user.id, stripe_customer_id: customerId, platform: 'web' },
          { onConflict: 'user_id' }
        );
    }

    // ---- Create the Checkout Session (7-day trial, card required) ----
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_user_id: user.id, plan },
      },
      client_reference_id: user.id,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
