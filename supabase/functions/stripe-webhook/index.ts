// stripe-webhook
// ---------------------------------------------------------------------------
// Receives Stripe events and keeps Supabase in sync with the real subscription
// state. This is the ONLY source of truth for tier/status — the client never
// writes subscription state directly.
//
// Handled events:
//   - checkout.session.completed     (trial started after checkout)
//   - customer.subscription.updated  (trial->active, plan change, past_due...)
//   - customer.subscription.deleted  (subscription ended/canceled)
//
// JWT verification is disabled for this function (config.toml) because Stripe
// does NOT send a Supabase JWT — authenticity is proven by the signed payload.
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  // Pinned older version so retrieved subscriptions keep top-level
  // current_period_start/end (newer API versions moved these onto items).
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// plan (from checkout metadata) -> DB tier. NOTE: 'premium' maps to the
// existing 'chef_premium' tier value because the CHECK constraint has not yet
// been migrated to 'wellness_pro'. Update both when that migration lands.
const PLAN_TO_TIER: Record<string, string> = {
  starter: 'standard',
  premium: 'chef_premium',
};

// Fallback: map by price id if metadata.plan is somehow missing.
const PRICE_TO_TIER: Record<string, string> = {
  [Deno.env.get('STRIPE_PRICE_ID_STARTER') ?? 'x']: 'standard',
  [Deno.env.get('STRIPE_PRICE_ID_PREMIUM') ?? 'y']: 'chef_premium',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Stripe status -> a value valid in BOTH the subscriptions and users CHECK
// constraints (users does not allow 'unpaid', so we fold it into 'past_due').
function normalizeStatus(s: string | null | undefined): string {
  switch (s) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    case 'incomplete':
      return 'incomplete';
    default:
      return 'incomplete';
  }
}

function toIso(unixSeconds: number | null | undefined): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

// Defensive period-date read: top-level (2024-06-20) with item-level fallback.
function periodDates(sub: any) {
  const item = sub.items?.data?.[0];
  return {
    current_period_start: toIso(
      sub.current_period_start ?? item?.current_period_start
    ),
    current_period_end: toIso(
      sub.current_period_end ?? item?.current_period_end
    ),
  };
}

/**
 * Fetches the full subscription from Stripe and writes its state to Supabase.
 * Used by every handled event so there is one consistent sync path.
 */
async function syncSubscription(
  subscriptionId: string,
  fallbackUserId?: string | null
) {
  const sub: any = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;

  // ---- Resolve the Supabase user ----
  let userId: string | null =
    sub.metadata?.supabase_user_id ?? fallbackUserId ?? null;

  if (!userId && customerId) {
    const { data } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    userId = data?.user_id ?? null;
  }

  if (!userId) {
    console.error('No Supabase user found for subscription', subscriptionId);
    return; // ack the event; nothing we can do without a user
  }

  // ---- Derive tier + status ----
  const status = normalizeStatus(sub.status);
  const priceItem = sub.items?.data?.[0];
  const priceId = priceItem?.price?.id;
  const planMeta = sub.metadata?.plan as string | undefined;

  let tier =
    (planMeta && PLAN_TO_TIER[planMeta]) ||
    (priceId && PRICE_TO_TIER[priceId]) ||
    'standard';

  if (status === 'canceled') tier = 'canceled';

  const monthlyAmount =
    typeof priceItem?.price?.unit_amount === 'number'
      ? priceItem.price.unit_amount / 100
      : null;
  const currency = priceItem?.price?.currency ?? sub.currency ?? 'usd';

  const periods = periodDates(sub);

  // ---- Write the subscriptions row (one per user) ----
  const { error: subErr } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      tier,
      status,
      current_period_start: periods.current_period_start,
      current_period_end: periods.current_period_end,
      trial_start: toIso(sub.trial_start),
      trial_end: toIso(sub.trial_end),
      canceled_at: toIso(sub.canceled_at),
      monthly_amount: monthlyAmount,
      currency,
      platform: 'web',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (subErr) throw new Error(`subscriptions upsert: ${subErr.message}`);

  // ---- Mirror onto the users row (what the app gates on) ----
  const { error: userErr } = await admin
    .from('users')
    .update({
      subscription_tier: tier,
      subscription_status: status,
      subscription_id: sub.id,
      customer_id: customerId,
      trial_ends_at: toIso(sub.trial_end),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (userErr) throw new Error(`users update: ${userErr.message}`);

  console.log(
    `Synced ${subscriptionId}: user=${userId} tier=${tier} status=${status}`
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return json({ error: 'Missing stripe-signature header' }, 400);
  }

  // Raw body is required for signature verification — do not parse first.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    // Async variant is required: Deno's SubtleCrypto is async-only.
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );
  } catch (e) {
    return json(
      { error: `Signature verification failed: ${(e as Error).message}` },
      400
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          await syncSubscription(
            String(session.subscription),
            session.client_reference_id
          );
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub.id);
        break;
      }
      default:
        // Ignore unsubscribed event types.
        break;
    }

    return json({ received: true });
  } catch (e) {
    console.error('Webhook handler error:', (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
