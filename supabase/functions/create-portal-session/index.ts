// create-portal-session
// ---------------------------------------------------------------------------
// Returns a Stripe Customer Portal URL for the signed-in user. The portal is
// where upgrades, downgrades, payment-method updates, and cancellations happen
// — Stripe hosts the UI and handles proration (upgrades charge the difference
// immediately; downgrades take effect at period end, per the portal config set
// in the Stripe Dashboard). The stripe-webhook function syncs whatever changes
// result back into Supabase, so there is no billing logic to write here.
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

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
    const { origin } = await req.json().catch(() => ({ origin: undefined }));
    const returnUrl = origin ?? 'https://gbombs.app';

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

    // ---- Find the user's Stripe customer ----
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const customerId = sub?.stripe_customer_id;
    if (!customerId) {
      return json({ error: 'No billing account found for this user.' }, 400);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
