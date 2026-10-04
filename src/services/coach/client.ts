import { invokeAi, isAiGatewayConfigured } from '@/services/ai/client';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export const isCoachConfigured = isAiGatewayConfigured;
export class CoachNotConfiguredError extends Error {
  constructor() {
    super('The Coach is not available right now.');
    this.name = 'CoachNotConfiguredError';
  }
}
interface ChatOptions { temperature?: number; maxTokens?: number }

/** Provider credentials, model selection, retries and fallback live on the server. */
export async function coachChat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (!isCoachConfigured()) throw new CoachNotConfiguredError();
  const result = await invokeAi({ operation: 'coach', messages, options: opts });
  return result.text ?? '';
}
