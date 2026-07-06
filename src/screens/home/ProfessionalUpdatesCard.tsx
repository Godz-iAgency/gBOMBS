import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  listEditsForClient,
  type ProfessionalEdit,
} from '@/lib/professional';
import { loadCachedPlan } from '@/lib/mealPlanCache';
import { loadReadIds, markRead } from '@/lib/professionalUpdatesRead';
import type { WeeklyMealPlan, MealSummary } from '@/services/gemini';
import RecipeModal from '@/screens/mealplan/RecipeModal';
import ProfessionalUpdateDetailModal from './ProfessionalUpdateDetailModal';
import { describeEdit, relativeTime } from './professionalUpdateText';

/**
 * "Professional Updates" — the client's ONE place on Home to see chef/trainer
 * changes. Collapsed to a single row by default (just a header + an unread
 * count); tap to expand the list. Unread items show bright, already-seen ones
 * muted gray. Opening an item marks it read and auto-collapses on return.
 *
 * Only shows updates made for the CURRENT plan (created at/after the plan's
 * generation), so generating a fresh plan clears the slate. Renders nothing
 * when there are no updates, so it never adds friction.
 */
export default function ProfessionalUpdatesCard({
  userId,
  tier,
}: {
  userId: string;
  tier: string;
}) {
  const [edits, setEdits] = useState<ProfessionalEdit[] | null>(null);
  const [plan, setPlan] = useState<WeeklyMealPlan | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [detailEdit, setDetailEdit] = useState<ProfessionalEdit | null>(null);
  const [detailMeal, setDetailMeal] = useState<MealSummary | null>(null);
  const [noteMeal, setNoteMeal] = useState<MealSummary | null>(null);

  const reload = useCallback(() => {
    if (!userId) return;
    const planPromise = loadCachedPlan(userId).catch(() => null);
    Promise.all([
      listEditsForClient(userId).catch(() => [] as ProfessionalEdit[]),
      planPromise,
      loadReadIds(userId),
    ]).then(([all, pl, read]) => {
      setPlan(pl);
      setReadIds(read);
      // Only updates for the CURRENT plan — a new plan starts a clean slate.
      // Compare by parsed time: Postgres (+00:00) and JS (Z) ISO formats differ,
      // so a lexicographic string compare isn't reliable near the boundary.
      const sinceMs = pl?.generatedAt
        ? new Date(pl.generatedAt).getTime()
        : null;
      setEdits(
        all.filter(
          (e) =>
            e.status !== 'reverted' &&
            (sinceMs === null || new Date(e.created_at).getTime() >= sinceMs)
        )
      );
    });
  }, [userId]);

  // Collapse + refresh whenever Home regains focus.
  useFocusEffect(
    useCallback(() => {
      setExpanded(false);
      reload();
    }, [reload])
  );

  function findMeal(mealId: string | null): MealSummary | null {
    if (!mealId || !plan) return null;
    for (const day of plan.days) {
      const m = day.meals.find((meal) => meal.id === mealId);
      if (m) return m;
    }
    return null;
  }

  function openEdit(edit: ProfessionalEdit) {
    // Mark read immediately (persist + reflect in the list).
    if (!readIds.has(edit.id)) {
      markRead(userId, edit.id);
      setReadIds((prev) => new Set(prev).add(edit.id));
    }
    setDetailMeal(edit.edit_type === 'note' ? findMeal(edit.target_reference) : null);
    setDetailEdit(edit);
  }

  /** Returning from any detail/recipe collapses the list back to one row. */
  function closeAndCollapse(reset: () => void) {
    reset();
    setExpanded(false);
  }

  if (!edits || edits.length === 0) return null;

  const unreadCount = edits.filter((e) => !readIds.has(e.id)).length;

  return (
    <>
      <View
        className="mt-4 overflow-hidden rounded-2xl border"
        style={{ borderColor: '#D85A8E66', backgroundColor: '#D85A8E14' }}
      >
        {/* Header — tap to expand/collapse */}
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.8}
          className="flex-row items-center p-5"
        >
          <Ionicons name="people-circle-outline" size={18} color="#5A9A3A" />
          <Text className="text-content-muted ml-2 flex-1 text-xs font-semibold uppercase tracking-wide">
            Professional Updates
          </Text>
          <View
            className={`mr-2 rounded-full px-2 py-0.5 ${
              unreadCount > 0 ? 'bg-brand-green' : 'bg-surface-cardAlt'
            }`}
          >
            <Text
              className={`text-[10px] font-bold ${
                unreadCount > 0 ? 'text-white' : 'text-content-muted'
              }`}
            >
              {unreadCount > 0 ? `${unreadCount} new` : edits.length}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#6B7280"
          />
        </TouchableOpacity>

        {/* Expanded list */}
        {expanded &&
          edits.map((edit) => {
            const { icon, text } = describeEdit(edit);
            const unread = !readIds.has(edit.id);
            return (
              <TouchableOpacity
                key={edit.id}
                onPress={() => openEdit(edit)}
                activeOpacity={0.7}
                className="flex-row items-center border-t border-surface-border px-5 py-3"
              >
                <Ionicons
                  name={icon}
                  size={18}
                  color={unread ? '#F5F5F0' : '#6B7280'}
                />
                <View className="ml-3 flex-1">
                  <Text
                    className={`text-sm leading-5 ${
                      unread
                        ? 'text-content font-semibold'
                        : 'text-content-muted'
                    }`}
                  >
                    {text}
                  </Text>
                  <Text className="text-content-muted mt-0.5 text-[11px]">
                    {relativeTime(edit.created_at)}
                    {unread ? ' · new' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6B7280" />
              </TouchableOpacity>
            );
          })}
      </View>

      {/* Detail view — instant. Trainer changes get Undo; a note gets the note
          text + a "View the recipe" link. Always has a back button. */}
      <ProfessionalUpdateDetailModal
        edit={detailEdit}
        meal={detailMeal}
        onViewRecipe={(m) => {
          setDetailEdit(null);
          setNoteMeal(m);
        }}
        onClose={() => closeAndCollapse(() => setDetailEdit(null))}
        onReverted={reload}
      />

      {/* Chef note → the full meal recipe, note shown at the top */}
      {noteMeal && (
        <RecipeModal
          meal={noteMeal}
          userId={userId}
          tier={tier}
          note={{ clientId: userId, editable: false }}
          onClose={() => closeAndCollapse(() => setNoteMeal(null))}
        />
      )}
    </>
  );
}
