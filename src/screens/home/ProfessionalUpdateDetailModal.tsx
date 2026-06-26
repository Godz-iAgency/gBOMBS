import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  revertEdit,
  isRevertable,
  type ProfessionalEdit,
} from '@/lib/professional';
import { notify } from '@/utils/dialog';
import type { MealSummary } from '@/services/gemini';
import {
  FIELD_LABEL,
  goalValueLabel,
  relativeTime,
  firstName,
} from './professionalUpdateText';

/**
 * Detail view for one professional update. Shows exactly what changed instantly
 * (no waiting on AI), with a back button to the dashboard. Trainer changes get a
 * single "Undo" (no approve step: changes auto-apply, Undo is the 48-hour safety
 * net); a chef note gets a "View the recipe" link to open the meal it's on.
 */
export default function ProfessionalUpdateDetailModal({
  edit,
  meal,
  onViewRecipe,
  onClose,
  onReverted,
}: {
  edit: ProfessionalEdit | null;
  /** For a note: the meal it points at, if still in the current plan. */
  meal?: MealSummary | null;
  /** For a note: open the full recipe for `meal`. */
  onViewRecipe?: (meal: MealSummary) => void;
  onClose: () => void;
  onReverted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!edit) return null;

  const who = firstName(edit.professional_name);
  const canUndo = isRevertable(edit);

  async function handleUndo() {
    if (!edit) return;
    setBusy(true);
    try {
      await revertEdit(edit.id);
      onReverted();
      onClose();
    } catch (e) {
      notify('Could not undo', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header with back button */}
        <View className="flex-row items-center border-b border-surface-border px-4 py-3">
          <TouchableOpacity onPress={onClose} hitSlop={10} className="mr-3">
            <Ionicons name="chevron-back" size={26} color="#A8A29E" />
          </TouchableOpacity>
          <Text className="text-content text-lg font-extrabold">
            Update from {who}
          </Text>
        </View>

        <View className="flex-1 px-5 pt-6">
          {edit.edit_type === 'goal_edit' ? (
            <>
              <Text className="text-content text-xl font-extrabold">
                {who} updated your {FIELD_LABEL[edit.target_reference ?? ''] ?? 'goal'}
              </Text>
              <View className="mt-5 rounded-2xl border border-surface-border bg-surface-card p-4">
                <Text className="text-content-muted text-xs font-semibold uppercase tracking-wide">
                  From
                </Text>
                <Text className="text-content mt-1 text-base">
                  {goalValueLabel(edit.target_reference, edit.previous_value)}
                </Text>
                <View className="my-3 h-px bg-surface-border" />
                <Text className="text-content-muted text-xs font-semibold uppercase tracking-wide">
                  To
                </Text>
                <Text className="text-content mt-1 text-base font-bold">
                  {goalValueLabel(edit.target_reference, edit.new_value)}
                </Text>
              </View>
            </>
          ) : edit.edit_type === 'suggested_meal_adjustment' ? (
            <>
              <Text className="text-content text-xl font-extrabold">
                {who} queued a plan adjustment
              </Text>
              <Text className="text-content-muted mt-2 text-sm">
                This will be applied automatically the next time your plan is
                generated.
              </Text>
              <View className="mt-5 rounded-2xl border border-surface-border bg-surface-card p-4">
                <Text className="text-content text-base leading-6">
                  {edit.new_value}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text className="text-content text-xl font-extrabold">
                {who} left a note{meal ? ` on ${meal.name}` : ''}
              </Text>
              <View className="mt-5 rounded-2xl border border-surface-border bg-surface-card p-4">
                <Text className="text-content text-base leading-6">
                  {edit.new_value}
                </Text>
              </View>
              {meal && onViewRecipe ? (
                <TouchableOpacity
                  onPress={() => onViewRecipe(meal)}
                  activeOpacity={0.85}
                  className="mt-5 flex-row items-center justify-center rounded-xl bg-brand-green py-3.5"
                >
                  <Ionicons name="book-outline" size={18} color="#FFFFFF" />
                  <Text className="ml-2 text-base font-bold text-white">
                    View the recipe
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

          <Text className="text-content-muted mt-4 text-xs">
            {relativeTime(edit.created_at)}
          </Text>

          {/* Undo — the only action. Changes auto-apply; this is the safety net. */}
          {canUndo ? (
            <View className="mt-8">
              <TouchableOpacity
                onPress={handleUndo}
                disabled={busy}
                activeOpacity={0.85}
                className="flex-row items-center justify-center rounded-xl border border-brand-onion py-3.5"
              >
                {busy ? (
                  <ActivityIndicator color="#8B2252" />
                ) : (
                  <>
                    <Ionicons name="arrow-undo-outline" size={18} color="#8B2252" />
                    <Text className="ml-2 text-base font-bold text-brand-onion">
                      Undo this change
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text className="text-content-muted mt-3 text-center text-xs">
                Applied automatically. You can undo within 48 hours.
              </Text>
            </View>
          ) : (
            <Text className="text-content-muted mt-8 text-center text-xs">
              The 48-hour window to undo this change has passed.
            </Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
