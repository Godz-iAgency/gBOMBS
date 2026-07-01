/**
 * Professional dashboards data layer (Step 11).
 * ------------------------------------------------------------------
 * Everything the chef / trainer-nutritionist features touch on the data side.
 * The CLIENT controls two fixed slots (chef + trainer_nutritionist); a
 * PROFESSIONAL accepts a QR invite and reads the connected client's plan,
 * grocery list, and (trainer only) scores.
 *
 * All WRITES that change connection state go through security-definer RPCs (see
 * the migrations) so slot limits + Premium gating + attribution stay
 * server-side; this module is the thin typed client over them, plus the reads
 * the screens render. Reads rely on RLS — a professional only ever sees rows
 * for clients they're actively connected to.
 */

import { supabase } from './supabase';
import type { WeeklyMealPlan, GroceryList } from '@/services/gemini';
import type {
  ProfessionalRole,
  ConnectionStatus,
  ProfessionalEditType,
  ProfessionalEditStatus,
  ClientSummaryRow,
} from '@/types/database.types';

export type { ProfessionalRole, ClientSummaryRow };

/** Human label + slot copy for each role (single source of truth for UI). */
export const ROLE_META: Record<
  ProfessionalRole,
  { label: string; blurb: string; icon: string }
> = {
  chef: {
    label: 'Personal Chef',
    blurb: 'Cooks your plan — sees recipes, prep timing & your grocery list.',
    icon: 'restaurant',
  },
  trainer_nutritionist: {
    label: 'Trainer / Nutritionist',
    blurb: 'Tunes your plan & goals — also sees your scores and streaks.',
    icon: 'fitness',
  },
};

export const ALL_ROLES: ProfessionalRole[] = ['chef', 'trainer_nutritionist'];

// ---- Shapes the screens consume -------------------------------------------

export interface ProfessionalConnection {
  id: string;
  client_id: string;
  professional_id: string | null;
  role: ProfessionalRole;
  status: ConnectionStatus;
  invite_code: string | null;
  professional_name: string | null;
  invite_created_at: string;
  invite_expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface ClientProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  diet_mode: string;
  health_goal: string;
  cooking_style: string;
}

export interface ProfessionalEdit {
  id: string;
  connection_id: string | null;
  client_id: string;
  professional_id: string;
  professional_role: ProfessionalRole;
  professional_name: string | null;
  edit_type: ProfessionalEditType;
  target_reference: string | null;
  previous_value: string | null;
  new_value: string | null;
  status: ProfessionalEditStatus;
  created_at: string;
  applied_at: string | null;
  reverted_at: string | null;
}

export interface AcceptInviteResult {
  connection_id: string;
  client_id: string;
  role: ProfessionalRole;
}

/** Surface the Postgres RAISE message (which is user-readable) to the caller. */
function rpcError(message: string | undefined): Error {
  return new Error(message?.trim() || 'Something went wrong. Please try again.');
}

// ===========================================================================
// CLIENT SIDE — managing your two slots
// ===========================================================================

/** Both non-revoked slots for a client (pending + active), ordered by role. */
export async function listMyConnections(
  clientId: string
): Promise<ProfessionalConnection[]> {
  const { data, error } = await supabase
    .from('professional_connections')
    .select('*')
    .eq('client_id', clientId)
    .in('status', ['pending', 'active'])
    .order('role', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfessionalConnection[];
}

/**
 * Create an invite for one slot. Returns the invite CODE (encode it in a QR).
 * Throws a readable message if the slot is taken or Premium isn't active.
 */
export async function createInvite(role: ProfessionalRole): Promise<string> {
  const { data, error } = await supabase.rpc('create_professional_invite', {
    p_role: role,
  });
  if (error) throw rpcError(error.message);
  return data as string;
}

/** Revoke a slot (client only). Frees it for re-invite. */
export async function revokeConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_professional_connection', {
    p_connection_id: connectionId,
  });
  if (error) throw rpcError(error.message);
}

// ===========================================================================
// PROFESSIONAL SIDE — accepting invites & reading clients
// ===========================================================================

/** Accept a scanned/typed invite code. Links the caller and activates the slot. */
export async function acceptInvite(code: string): Promise<AcceptInviteResult> {
  const { data, error } = await supabase.rpc('accept_professional_invite', {
    p_code: code.trim(),
  });
  if (error) throw rpcError(error.message);
  return data as unknown as AcceptInviteResult;
}

/** Every active client of the current professional (one round-trip). */
export async function listMyClients(): Promise<ClientSummaryRow[]> {
  const { data, error } = await supabase.rpc('list_my_clients');
  if (error) throw error;
  return (data ?? []) as ClientSummaryRow[];
}

/**
 * Cheap "am I a professional?" check for the auto-detect entry point — true if
 * the user has at least one active client. (No client names fetched.)
 */
export async function hasActiveClients(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('professional_connections')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', userId)
    .eq('status', 'active');
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Column-safe client profile (NO billing fields — enforced by the RPC). */
export async function getClientProfile(
  clientId: string
): Promise<ClientProfile | null> {
  const { data, error } = await supabase.rpc('get_client_profile', {
    p_client_id: clientId,
  });
  if (error) throw rpcError(error.message);
  return (data as unknown as ClientProfile) ?? null;
}

/** A connected client's current meal plan (RLS-gated to active connections). */
export async function loadClientPlan(
  clientId: string
): Promise<WeeklyMealPlan | null> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('plan')
    .eq('user_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return (data?.plan as WeeklyMealPlan) ?? null;
}

/** A connected client's current grocery list (RLS-gated to active connections). */
export async function loadClientGrocery(
  clientId: string
): Promise<GroceryList | null> {
  const { data, error } = await supabase
    .from('grocery_lists')
    .select('list')
    .eq('user_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return (data?.list as GroceryList) ?? null;
}

// ===========================================================================
// EDITS / NOTES — reads (writes land with their RPCs in the dashboard steps)
// ===========================================================================

/**
 * Recent professional edits on a client, newest first. RLS scopes the result:
 *   • the client sees every edit made on them (their "Professional Updates"),
 *   • a professional sees only the edits they authored.
 * Same query serves both — the policy decides what comes back.
 */
export async function listEditsForClient(
  clientId: string,
  limit = 50
): Promise<ProfessionalEdit[]> {
  const { data, error } = await supabase
    .from('professional_edits')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProfessionalEdit[];
}

/** The current chef note on one meal (latest applied), or null. RLS-scoped:
 *  the client reads notes on them; the chef reads notes they authored. */
export async function loadMealNote(
  clientId: string,
  mealId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('professional_edits')
    .select('new_value')
    .eq('client_id', clientId)
    .eq('target_reference', mealId)
    .eq('edit_type', 'note')
    .eq('status', 'applied')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.new_value as string | null) ?? null;
}

// ===========================================================================
// WRITES — professional actions (all via security-definer RPCs).
// ===========================================================================

/** Chef: attach/update a note on one meal (empty string clears it). */
export async function addChefNote(
  clientId: string,
  mealId: string,
  note: string
): Promise<void> {
  const { error } = await supabase.rpc('add_chef_note', {
    p_client_id: clientId,
    p_meal_id: mealId,
    p_note: note,
  });
  if (error) throw rpcError(error.message);
}

/** Trainer: change one plan field on the client (immediate; client can undo). */
export async function editClientGoal(
  clientId: string,
  field: 'diet_mode' | 'health_goal' | 'cooking_style',
  value: string
): Promise<void> {
  const { error } = await supabase.rpc('edit_client_goal', {
    p_client_id: clientId,
    p_field: field,
    p_value: value,
  });
  if (error) throw rpcError(error.message);
}

/** Trainer: queue a plan adjustment consumed at the next generation. */
export async function queueMealAdjustment(
  clientId: string,
  note: string
): Promise<void> {
  const { error } = await supabase.rpc('queue_meal_adjustment', {
    p_client_id: clientId,
    p_note: note,
  });
  if (error) throw rpcError(error.message);
}

/** Client: undo a professional change within the 48-hour window. */
export async function revertEdit(editId: string): Promise<void> {
  const { error } = await supabase.rpc('revert_professional_edit', {
    p_edit_id: editId,
  });
  if (error) throw rpcError(error.message);
}

/** One queued trainer adjustment awaiting the next plan generation. */
export interface PendingAdjustment {
  id: string;
  note: string;
}

/** The client's own queued trainer adjustments (pending next cycle), oldest
 *  first so they read naturally in the prompt. RLS-scoped to the caller. */
export async function loadPendingAdjustments(
  clientId: string
): Promise<PendingAdjustment[]> {
  const { data, error } = await supabase
    .from('professional_edits')
    .select('id, new_value')
    .eq('client_id', clientId)
    .eq('edit_type', 'suggested_meal_adjustment')
    .eq('status', 'pending_next_cycle')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({ id: r.id as string, note: (r.new_value as string) ?? '' }))
    .filter((a) => a.note.trim().length > 0);
}

/** Mark queued adjustments as applied after they've been folded into a new plan.
 *  Best-effort: a failure here must never lose the freshly generated plan. */
export async function consumeAdjustments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.rpc('consume_professional_adjustments', {
    p_ids: ids,
  });
  if (error) throw rpcError(error.message);
}

/** Is this edit still undoable by the client? (revertable type, applied/queued,
 *  inside the 48h window). Mirrors the server rule for the Undo button. */
export function isRevertable(edit: ProfessionalEdit): boolean {
  if (edit.status === 'reverted') return false;
  if (
    edit.edit_type !== 'goal_edit' &&
    edit.edit_type !== 'suggested_meal_adjustment'
  ) {
    return false;
  }
  const ageMs = Date.now() - new Date(edit.created_at).getTime();
  return ageMs < 48 * 60 * 60 * 1000;
}
