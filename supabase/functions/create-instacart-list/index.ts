// create-instacart-list
// ---------------------------------------------------------------------------
// Turns a gBOMBS grocery list into an Instacart "shopping list page" and returns
// its shareable URL. Opening that URL lets the user pick a store, see every item
// pre-added to their cart, and check out on Instacart.
//
// Built on the Instacart Developer Platform (IDP) "Create shopping list page"
// endpoint (POST /idp/v1/products/products_link). The IDP API key is a secret
// held only here — it is never shipped to the app. The endpoint base defaults to
// the IDP DEV server; set INSTACART_API_BASE to the prod base to go live:
//   dev  : https://connect.dev.instacart.tools   (default)
//   prod : https://connect.instacart.com
//
// Auth: verify_jwt is off (config.toml); we validate the caller's Supabase JWT
// here so only signed-in users can spend our Instacart key.
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INSTACART_API_KEY = Deno.env.get('INSTACART_API_KEY') ?? '';
const INSTACART_API_BASE =
  Deno.env.get('INSTACART_API_BASE') ?? 'https://connect.dev.instacart.tools';
const PRODUCTS_LINK_PATH = '/idp/v1/products/products_link';

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

interface IncomingItem {
  name?: string;
  display_text?: string;
  quantity?: number;
  unit?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!INSTACART_API_KEY) {
      return json(
        {
          error:
            'Instacart ordering is not set up yet. (Missing INSTACART_API_KEY.)',
        },
        503
      );
    }

    // ---- Require a signed-in user (don't let anonymous calls spend our key) ----
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

    // ---- Build the IDP request from the posted grocery items ----
    const body = await req.json().catch(() => ({}));
    const title: string =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : 'My gBOMBS Grocery List';
    const linkbackUrl: string | undefined =
      typeof body.linkbackUrl === 'string' ? body.linkbackUrl : undefined;

    const rawItems: IncomingItem[] = Array.isArray(body.items) ? body.items : [];
    const line_items = rawItems
      .map((it) => {
        const name = (it.name ?? '').toString().trim();
        if (!name) return null;
        const li: Record<string, unknown> = { name };
        if (it.display_text) {
          li.display_text = String(it.display_text).slice(0, 120);
        }
        if (typeof it.quantity === 'number' && it.quantity > 0) {
          li.quantity = it.quantity;
        }
        if (it.unit) li.unit = String(it.unit);
        return li;
      })
      .filter((x): x is Record<string, unknown> => x !== null);

    if (line_items.length === 0) {
      return json({ error: 'No grocery items to send.' }, 400);
    }

    const payload: Record<string, unknown> = {
      title,
      link_type: 'shopping_list',
      expires_in: 30,
      line_items,
    };
    if (linkbackUrl) {
      payload.landing_page_configuration = {
        partner_linkback_url: linkbackUrl,
      };
    }

    // ---- Call Instacart and return its shopping-list URL ----
    const res = await fetch(`${INSTACART_API_BASE}${PRODUCTS_LINK_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INSTACART_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('Instacart IDP error:', res.status, text);
      return json(
        { error: `Instacart rejected the request (${res.status}).` },
        502
      );
    }

    let url: string | undefined;
    try {
      url = JSON.parse(text)?.products_link_url;
    } catch {
      /* non-JSON body — handled below */
    }
    if (!url) {
      return json({ error: 'Instacart did not return a link.' }, 502);
    }

    return json({ url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
