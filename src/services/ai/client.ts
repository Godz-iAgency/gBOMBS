import { supabase } from '@/lib/supabase';

export interface AiUsage {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}
interface AiResponse { text?: string; modelUsed?: string; usage?: AiUsage; code?: string }

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Please sign in again to continue.',
  subscription_required: 'An active subscription is needed to use this feature.',
  daily_limit: 'You have reached your daily allowance. Please try again after it renews.',
  rate_limit: 'Please wait a minute before trying again.',
  busy: 'Another request is still running. Please try again shortly.',
  invalid_request: 'This request is too large or incomplete. Please shorten it and try again.',
  not_configured: 'The AI service is not available right now.',
  provider_unavailable: 'The AI service is busy right now. Please try again shortly.',
};
export class AiServiceError extends Error {
  constructor(public code: string, public usage?: AiUsage) {
    super(ERROR_MESSAGES[code] ?? 'The AI service is unavailable. Please try again.');
    this.name = 'AiServiceError';
  }
}

// Only display metadata is cached. The server enforces every allowance.
let lastCoachUsage: { userId: string; usage: AiUsage } | undefined;
export function cachedCoachUsage(userId: string): AiUsage | undefined {
  return lastCoachUsage?.userId === userId ? lastCoachUsage.usage : undefined;
}
export function isAiGatewayConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

export async function invokeAi(body: Record<string, unknown>): Promise<AiResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new AiServiceError('unauthorized');
  const { data, error } = await supabase.functions.invoke<AiResponse>('ai-generate', {
    body, headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    // Never surface transport/provider error bodies or URLs to the UI.
    let result: AiResponse | undefined;
    if (error.context instanceof Response) {
      result = await error.context.json().catch(() => undefined);
    }
    if (result?.usage && (body.operation === 'coach' || body.operation === 'usage')) {
      lastCoachUsage = { userId: session.user.id, usage: result.usage };
    }
    throw new AiServiceError(result?.code ?? 'unavailable', result?.usage);
  }
  if (!data) throw new AiServiceError('unavailable');
  if (data.usage && (body.operation === 'coach' || body.operation === 'usage')) {
    lastCoachUsage = { userId: session.user.id, usage: data.usage };
  }
  return data;
}
export async function fetchCoachUsage(): Promise<AiUsage> {
  const result = await invokeAi({ operation: 'usage' });
  if (!result.usage) throw new AiServiceError('unavailable');
  return result.usage;
}
