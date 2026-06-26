import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getClientProfile,
  loadClientPlan,
  editClientGoal,
  queueMealAdjustment,
  listEditsForClient,
  type ClientProfile,
  type ProfessionalEdit,
} from '@/lib/professional';
import { loadReport, type ReportData } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { buildClientMealContext } from '@/lib/mealContext';
import { notify } from '@/utils/dialog';
import {
  DIET_MODES,
  HEALTH_GOALS,
  COOKING_STYLES,
  DIET_LABEL,
  GOAL_LABEL,
  STYLE_LABEL,
  type PlanOption,
} from '@/utils/profileOptions';
import RecipeModal from '@/screens/mealplan/RecipeModal';
import EditPlanModal from '@/screens/profile/EditPlanModal';
import DayAccordion from './DayAccordion';
import type { WeeklyMealPlan, MealSummary } from '@/services/gemini';
import type { DietMode, HealthGoal, CookingStyle } from '@/types/database.types';

type GoalField = 'diet_mode' | 'health_goal' | 'cooking_style';

interface StreakRow {
  current_daily_streak: number;
  longest_daily_streak: number;
  total_perfect_days: number;
}

/**
 * Trainer / Nutritionist Dashboard — the HEALTH view for one connected client.
 * ------------------------------------------------------------------
 * The trainer sees what the chef can't: adherence. The client's goals, their
 * 7-day gBOMBS score trend, current streak, and a plan overview. (Editing goals
 * + queuing meal-plan adjustments arrive with the write layer in Step 11.6.)
 */
export default function TrainerDashboardModal({
  visible,
  clientId,
  clientName,
  onClose,
}: {
  visible: boolean;
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [streak, setStreak] = useState<StreakRow | null>(null);
  const [plan, setPlan] = useState<WeeklyMealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  // Plan accordion: one day open at a time; selected meal opens its recipe.
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<MealSummary | null>(null);
  // Write actions: goal picker + queued meal adjustments.
  const [editField, setEditField] = useState<GoalField | null>(null);
  const [edits, setEdits] = useState<ProfessionalEdit[]>([]);
  const [adjustText, setAdjustText] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  async function refreshEdits() {
    try {
      setEdits(await listEditsForClient(clientId));
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    if (!visible) {
      setProfile(null);
      setReport(null);
      setStreak(null);
      setPlan(null);
      setLoading(true);
      setOpenDay(null);
      setSelectedMeal(null);
      setEditField(null);
      setEdits([]);
      setAdjustText('');
      return;
    }
    let active = true;
    (async () => {
      const [p, r, pl, s, e] = await Promise.all([
        getClientProfile(clientId).catch(() => null),
        loadReport(clientId, 7).catch(() => null),
        loadClientPlan(clientId).catch(() => null),
        (async (): Promise<StreakRow | null> => {
          try {
            const { data } = await supabase
              .from('streaks')
              .select(
                'current_daily_streak, longest_daily_streak, total_perfect_days'
              )
              .eq('user_id', clientId)
              .maybeSingle();
            return (data as StreakRow | null) ?? null;
          } catch {
            return null;
          }
        })(),
        listEditsForClient(clientId).catch(() => [] as ProfessionalEdit[]),
      ]);
      if (!active) return;
      setProfile(p);
      setReport(r);
      setPlan(pl);
      setStreak(s);
      setEdits(e);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [visible, clientId]);

  // Which option set + current value the goal picker is showing.
  const goalPicker: {
    title: string;
    options: PlanOption<string>[];
    current: string;
  } | null =
    editField === 'diet_mode'
      ? { title: 'Diet mode', options: DIET_MODES, current: profile?.diet_mode ?? '' }
      : editField === 'health_goal'
        ? { title: 'Health goal', options: HEALTH_GOALS, current: profile?.health_goal ?? '' }
        : editField === 'cooking_style'
          ? { title: 'Cooking style', options: COOKING_STYLES, current: profile?.cooking_style ?? '' }
          : null;

  async function saveGoal(key: string) {
    if (!editField) return;
    await editClientGoal(clientId, editField, key);
    const p = await getClientProfile(clientId).catch(() => null);
    if (p) setProfile(p);
    refreshEdits();
  }

  async function handleQueueAdjustment() {
    const text = adjustText.trim();
    if (!text) return;
    setAdjustBusy(true);
    try {
      await queueMealAdjustment(clientId, text);
      setAdjustText('');
      await refreshEdits();
      notify('Queued', 'Your adjustment will apply to the next plan.');
    } catch (e) {
      notify('Could not queue', (e as Error).message);
    } finally {
      setAdjustBusy(false);
    }
  }

  const pendingAdjustments = edits.filter(
    (e) =>
      e.edit_type === 'suggested_meal_adjustment' &&
      e.status === 'pending_next_cycle'
  );

  const plannedMeals =
    plan?.days.reduce((n, d) => n + d.meals.length, 0) ?? 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center border-b border-surface-border px-4 py-3">
          <TouchableOpacity onPress={onClose} hitSlop={10} className="mr-3">
            <Ionicons name="chevron-back" size={26} color="#A8A29E" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-content text-lg font-extrabold" numberOfLines={1}>
              {clientName}
            </Text>
            <View className="flex-row items-center">
              <Ionicons name="fitness" size={12} color="#5A9A3A" />
              <Text className="text-content-muted ml-1 text-xs">
                Trainer / Nutritionist
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#5A9A3A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Goals — tappable; the trainer can change any of the three. */}
            <Text className="text-content-muted mb-2 px-1 text-xs font-semibold uppercase tracking-wide">
              Goals · tap to adjust
            </Text>
            {profile && (
              <View className="overflow-hidden rounded-2xl border border-surface-border bg-surface-card">
                <GoalRow
                  label="Diet mode"
                  value={DIET_LABEL[profile.diet_mode as DietMode] ?? profile.diet_mode}
                  onPress={() => setEditField('diet_mode')}
                />
                <View className="h-px bg-surface-border" />
                <GoalRow
                  label="Health goal"
                  value={
                    GOAL_LABEL[profile.health_goal as HealthGoal] ??
                    profile.health_goal
                  }
                  onPress={() => setEditField('health_goal')}
                />
                <View className="h-px bg-surface-border" />
                <GoalRow
                  label="Cooking style"
                  value={
                    STYLE_LABEL[profile.cooking_style as CookingStyle] ??
                    profile.cooking_style
                  }
                  onPress={() => setEditField('cooking_style')}
                />
              </View>
            )}

            {/* Adherence */}
            <Text className="text-content-muted mb-2 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
              Adherence — last 7 days
            </Text>
            <View className="rounded-2xl border border-surface-border bg-surface-card p-4">
              <View className="flex-row justify-between">
                <Stat label="Avg score" value={report ? `${report.avgScore}/6` : '—'} />
                <Stat
                  label="Day streak"
                  value={streak ? `${streak.current_daily_streak}` : '0'}
                />
                <Stat
                  label="Perfect days"
                  value={streak ? `${streak.total_perfect_days}` : '0'}
                />
              </View>

              {report && report.daysLogged > 0 ? (
                <View className="mt-4 flex-row items-end justify-between" style={{ height: 72 }}>
                  {report.trend.map((pt) => {
                    const h = pt.score === null ? 0 : (pt.score / 6) * 60;
                    return (
                      <View key={pt.date} className="flex-1 items-center">
                        <View
                          style={{
                            height: Math.max(h, 3),
                            width: 14,
                            borderRadius: 4,
                            backgroundColor: pt.score === null ? '#2D2D2D' : '#5A9A3A',
                          }}
                        />
                        <Text className="text-content-muted mt-1 text-[10px]">
                          {pt.date.slice(8)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text className="text-content-muted mt-3 text-sm">
                  {clientName.split(' ')[0]} hasn't logged any check-ins yet.
                </Text>
              )}
            </View>

            {/* Plan overview + accordion */}
            <Text className="text-content-muted mb-2 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
              Current plan
            </Text>
            {plan && plan.days.length > 0 ? (
              <>
                <View className="mb-3 rounded-2xl border border-surface-border bg-surface-card p-4">
                  <Text className="text-content text-sm">
                    {plannedMeals} meals planned across {plan.days.length} days ·
                    weekly gBOMBS {plan.weeklyScore.score}/
                    {plan.weeklyScore.total}.
                  </Text>
                </View>
                {plan.days.map((day) => (
                  <DayAccordion
                    key={day.day}
                    day={day}
                    open={openDay === day.day}
                    onToggle={() =>
                      setOpenDay((cur) => (cur === day.day ? null : day.day))
                    }
                    onSelectMeal={setSelectedMeal}
                  />
                ))}
              </>
            ) : (
              <View className="rounded-2xl border border-surface-border bg-surface-card p-4">
                <Text className="text-content-muted text-sm">
                  No meal plan generated yet.
                </Text>
              </View>
            )}

            {/* Meal-plan adjustments — queued for the next generation */}
            <Text className="text-content-muted mb-2 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
              Adjustments for next plan
            </Text>
            <View className="rounded-2xl border border-surface-border bg-surface-card p-4">
              {pendingAdjustments.length > 0 && (
                <View className="mb-3">
                  {pendingAdjustments.map((a) => (
                    <View key={a.id} className="mb-2 flex-row items-start">
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color="#9B8C3A"
                        style={{ marginTop: 2 }}
                      />
                      <Text className="text-content ml-2 flex-1 text-sm">
                        {a.new_value}
                      </Text>
                    </View>
                  ))}
                  <Text className="text-content-muted mt-1 text-[11px]">
                    Applied automatically when the next plan is generated.
                  </Text>
                </View>
              )}
              <TextInput
                value={adjustText}
                onChangeText={setAdjustText}
                placeholder="e.g. More high-protein lunches; cut dinner prep under 20 min."
                placeholderTextColor="#6B7280"
                multiline
                className="text-content rounded-xl border border-surface-border bg-surface px-3 py-3 text-sm"
                style={{ minHeight: 70, textAlignVertical: 'top' }}
              />
              <TouchableOpacity
                onPress={handleQueueAdjustment}
                disabled={!adjustText.trim() || adjustBusy}
                activeOpacity={0.85}
                className={`mt-3 items-center rounded-xl py-3 ${
                  adjustText.trim() && !adjustBusy
                    ? 'bg-brand-green'
                    : 'bg-surface-cardAlt'
                }`}
              >
                {adjustBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    className={`text-sm font-bold ${
                      adjustText.trim() ? 'text-white' : 'text-content-muted'
                    }`}
                  >
                    Queue adjustment
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* Goal picker (reuses the client's plan picker) */}
        <EditPlanModal
          visible={!!goalPicker}
          title={goalPicker?.title ?? ''}
          subtitle={`Updates ${clientName.split(' ')[0]}'s plan. They can undo within 48h.`}
          options={goalPicker?.options ?? []}
          current={goalPicker?.current ?? ''}
          onSelect={saveGoal}
          onClose={() => setEditField(null)}
        />

        {/* Full-recipe overlay (generated against the client's diet, cached
            per client). Rendered at modal level for full-screen positioning. */}
        {selectedMeal && (
          <RecipeModal
            meal={selectedMeal}
            userId={clientId}
            tier="wellness_pro"
            buildContext={() => buildClientMealContext(clientId)}
            onClose={() => setSelectedMeal(null)}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function GoalRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center justify-between px-4 py-3.5"
    >
      <Text className="text-content-muted text-sm">{label}</Text>
      <View className="flex-row items-center">
        <Text className="text-content text-sm font-semibold">{value}</Text>
        <Ionicons
          name="chevron-forward"
          size={16}
          color="#6B7280"
          style={{ marginLeft: 6 }}
        />
      </View>
    </TouchableOpacity>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-content text-xl font-extrabold">{value}</Text>
      <Text className="text-content-muted mt-0.5 text-[11px]">{label}</Text>
    </View>
  );
}
