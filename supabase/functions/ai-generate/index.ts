import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createGateway } from './core.ts';
import type { Bucket, GatewayDependencies, Reservation, Usage } from './core.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Verify with Auth, rather than decoding an untrusted JWT. No service key is
// accepted as a user's identity, and no request-supplied user id is used.
const deps: GatewayDependencies = {
  async authenticate(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user || data.user.is_anonymous ? null : data.user.id;
  },
  async entitlement(userId) {
    const { data, error } = await admin.from('subscriptions').select('tier,status,stripe_subscription_id').eq('user_id', userId).maybeSingle();
    if (error) throw new Error('Subscription lookup failed');
    const paid = (sub: typeof data) => Boolean(sub?.stripe_subscription_id && ['active', 'trialing'].includes(sub.status) && ['standard', 'wellness_pro'].includes(sub.tier));
    if (paid(data)) return data!.tier as 'standard' | 'wellness_pro';
    // Pure professionals retain their existing client-workspace access.
    const { data: connections, error: connectionError } = await admin.from('professional_connections').select('client_id').eq('professional_id', userId).eq('status', 'active');
    if (connectionError) throw new Error('Connection lookup failed');
    if (!connections?.length) return null;
    const { data: clients, error: clientError } = await admin.from('subscriptions').select('tier,status,stripe_subscription_id').in('user_id', connections.map((c) => c.client_id)).eq('tier', 'wellness_pro');
    if (clientError) throw new Error('Client access lookup failed');
    return clients?.some(paid) ? 'wellness_pro' : null;
  },
  async usage(userId: string, bucket: Bucket, limit: number) {
    const { data, error } = await admin.rpc('get_ai_usage', { p_user_id: userId, p_bucket: bucket, p_limit: limit });
    if (error || !data) throw new Error('Usage lookup failed');
    return data as Usage;
  },
  async reserve(userId: string, bucket: Bucket, limit: number) {
    const { data, error } = await admin.rpc('reserve_ai_request', { p_user_id: userId, p_bucket: bucket, p_limit: limit });
    if (error || !data) throw new Error('Reservation failed');
    return data as Reservation;
  },
  async finish(requestId, success) {
    const { error } = await admin.rpc('finish_ai_request', { p_request_id: requestId, p_success: success });
    if (error) throw new Error('Usage write failed');
  },
  env: (name) => Deno.env.get(name),
  fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
Deno.serve(createGateway(deps));
