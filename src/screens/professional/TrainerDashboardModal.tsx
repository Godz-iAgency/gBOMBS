import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getClientProfile,
  loadClientPlan,
  type ClientProfile,
} from '@/lib/professional';
import { loadReport, type ReportData } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { buildClientMealContext } from '@/lib/mealContext';
import { DIET_LABEL, GOAL_LABEL, STYLE_LABEL } from '@/utils/profileOptions';
import RecipeModal from '@/screens/mealplan/RecipeModal';
import DayAccordion from './DayAccordion';
import type { WeeklyMealPlan, MealSummary } from '@/services/gemini';
import type { DietMode, HealthGoal, CookingStyle } from '@/types/database.types';

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

  useEffect(() => {
    if (!visible) {
      setProfile(null);
      setReport(null);
      setStreak(null);
      setPlan(null);
      setLoading(true);
      setOpenDay(null);
      setSelectedMeal(null);
      return;
    }
    let active = true;
    (async () => {
      const [p, r, pl, s] = await Promise.all([
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
      ]);
      if (!active) return;
      setProfile(p);
      setReport(r);
      setPlan(pl);
      setStreak(s);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [visible, clientId]);

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
            {/* Goals */}
            <Text className="text-content-muted mb-2 px-1 text-xs font-semibold uppercase tracking-wide">
              Goals
            </Text>
            {profile && (
              <View className="rounded-2xl border border-surface-border bg-surface-card p-4">
                <GoalRow
                  label="Diet mode"
                  value={DIET_LABEL[profile.diet_mode as DietMode] ?? profile.diet_mode}
                />
                <View className="h-px bg-surface-border" />
                <GoalRow
                  label="Health goal"
                  value={
                    GOAL_LABEL[profile.health_goal as HealthGoal] ??
                    profile.health_goal
                  }
                />
                <View className="h-px bg-surface-border" />
                <GoalRow
                  label="Cooking style"
                  value={
                    STYLE_LABEL[profile.cooking_style as CookingStyle] ??
                    profile.cooking_style
                  }
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
          </ScrollView>
        )}

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

function GoalRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <Text className="text-content-muted text-sm">{label}</Text>
      <Text className="text-content text-sm font-semibold">{value}</Text>
    </View>
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
