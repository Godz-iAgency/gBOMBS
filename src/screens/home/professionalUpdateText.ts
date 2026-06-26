/**
 * Shared formatting for the client's "Professional Updates" surface — the Home
 * card and the detail view both describe a professional_edit the same way.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ProfessionalEdit } from '@/lib/professional';
import { DIET_LABEL, GOAL_LABEL, STYLE_LABEL } from '@/utils/profileOptions';
import type { DietMode, HealthGoal, CookingStyle } from '@/types/database.types';

/** Friendly name for a goal field. */
export const FIELD_LABEL: Record<string, string> = {
  diet_mode: 'Diet mode',
  health_goal: 'Health goal',
  cooking_style: 'Cooking style',
};

/** Human label for a goal value (handles each field's option set). */
export function goalValueLabel(
  field: string | null,
  value: string | null
): string {
  if (!value) return '—';
  if (field === 'diet_mode') return DIET_LABEL[value as DietMode] ?? value;
  if (field === 'health_goal') return GOAL_LABEL[value as HealthGoal] ?? value;
  if (field === 'cooking_style') {
    return STYLE_LABEL[value as CookingStyle] ?? value;
  }
  return value;
}

/** Short relative time, e.g. "just now", "2h ago", "3d ago". */
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** First name of the professional (fallback "Your pro"). */
export function firstName(full: string | null): string {
  return full?.trim().split(/\s+/)[0] ?? 'Your pro';
}

/** Icon + one-line summary for an edit row. */
export function describeEdit(edit: ProfessionalEdit): {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
} {
  const who = firstName(edit.professional_name);
  switch (edit.edit_type) {
    case 'goal_edit':
      return {
        icon: 'flag-outline',
        text: `${who} set your ${
          FIELD_LABEL[edit.target_reference ?? ''] ?? 'goal'
        } to ${goalValueLabel(edit.target_reference, edit.new_value)}`,
      };
    case 'suggested_meal_adjustment':
      return {
        icon: 'restaurant-outline',
        text: `${who} queued a plan adjustment`,
      };
    case 'note':
      return {
        icon: 'create-outline',
        text: `${who} left a note on a meal`,
      };
    default:
      return { icon: 'sparkles-outline', text: 'Update from your professional' };
  }
}
