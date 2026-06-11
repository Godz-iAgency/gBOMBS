import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateWeeklyMealPlan,
  computeWeeklyScore,
  swapMeal,
  type WeeklyMealPlan,
  type GBombsCategory,
  type MealSummary,
} from '@/services/gemini';
import { buildUserMealContext } from '@/lib/mealContext';
import { loadCachedPlan, saveCachedPlan } from '@/lib/mealPlanCache';
import { GBOMBS_LETTERS } from '@/utils/gbombsImages';
import RecipeModal from './RecipeModal';
import GroceryScreen from './GroceryScreen';
import SwipeableMealCard from './SwipeableMealCard';

/** Cross-platform alert — react-native-web's Alert is a no-op, so fall back. */
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Weekly coverage bar: all six letters, lit if hit this week. */
function WeeklyScoreBar({
  hit,
  score,
}: {
  hit: GBombsCategory[];
  score: number;
}) {
  return (
    <View className="mb-4 rounded-2xl bg-surface-card p-4">
      <Text className="text-content-muted mb-2 text-xs font-semibold uppercase tracking-wide">
        Weekly gBOMBS Score
      </Text>
      <View className="flex-row items-center justify-between">
        <View className="flex-row">
          {GBOMBS_LETTERS.map((meta) => {
            const isHit = hit.includes(meta.key as GBombsCategory);
            return (
              <View
                key={meta.key}
                className="mr-1.5 h-8 w-8 items-center justify-center rounded-full border"
                style={{
                  backgroundColor: isHit ? meta.glow : 'transparent',
                  borderColor: isHit ? meta.glow : '#2D2D2D',
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: isHit ? '#000' : '#A8A29E' }}
                >
                  {meta.letter}
                </Text>
              </View>
            );
          })}
        </View>
        <Text className="text-content text-sm font-bold">{score}/6 {score >= 5 ? '🔥' : ''}</Text>
      </View>
    </View>
  );
}

export default function MealPlanScreen() {
  const { user, profile } = useAuth();
  const tier = profile?.subscription_tier ?? 'standard';

  const [plan, setPlan] = useState<WeeklyMealPlan | null>(null);
  const [booting, setBooting] = useState(true); // loading cache
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [recipeMeal, setRecipeMeal] = useState<MealSummary | null>(null);
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [swappingId, setSwappingId] = useState<string | null>(null);

  // Load any cached plan on mount / user change.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) {
        setBooting(false);
        return;
      }
      const cached = await loadCachedPlan(user.id);
      if (active) {
        setPlan(cached);
        setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleGenerate = useCallback(async () => {
    if (!user?.id) return;
    setGenerating(true);
    setError(null);
    try {
      const ctx = await buildUserMealContext(user.id);
      const next = await generateWeeklyMealPlan(ctx, tier);
      setPlan(next);
      setSelectedDay(0);
      await saveCachedPlan(user.id, next);
    } catch (e) {
      setError(
        (e as Error).message ||
          'Could not generate your meal plan. Please try again.'
      );
    } finally {
      setGenerating(false);
    }
  }, [user?.id, tier]);

  // Remove one meal from the selected day, recompute the weekly score, persist.
  const handleDeleteMeal = useCallback(
    (mealId: string) => {
      setPlan((prev) => {
        if (!prev) return prev;
        const days = prev.days.map((d, i) =>
          i !== selectedDay
            ? d
            : { ...d, meals: d.meals.filter((m) => m.id !== mealId) }
        );
        const next: WeeklyMealPlan = {
          ...prev,
          days,
          weeklyScore: computeWeeklyScore(days),
        };
        if (user?.id) saveCachedPlan(user.id, next); // fire-and-forget
        return next;
      });
    },
    [selectedDay, user?.id]
  );

  // Swap one meal for a fresh AI-generated one in the same slot (Prompt 5),
  // then recompute the weekly score and persist. Errors surface via notify.
  const handleSwapMeal = useCallback(
    async (meal: MealSummary) => {
      if (!user?.id || !plan) return;
      setSwappingId(meal.id);
      try {
        const ctx = await buildUserMealContext(user.id);
        const replacement = await swapMeal(plan, selectedDay, meal, ctx, tier);
        setPlan((prev) => {
          if (!prev) return prev;
          const days = prev.days.map((d, i) =>
            i !== selectedDay
              ? d
              : {
                  ...d,
                  meals: d.meals.map((m) =>
                    m.id === meal.id ? replacement : m
                  ),
                }
          );
          const next: WeeklyMealPlan = {
            ...prev,
            days,
            weeklyScore: computeWeeklyScore(days),
          };
          if (user?.id) saveCachedPlan(user.id, next); // fire-and-forget
          return next;
        });
      } catch (e) {
        notify(
          'Swap failed',
          (e as Error).message ||
            'Could not swap this meal. Please try again.'
        );
      } finally {
        setSwappingId(null);
      }
    },
    [user?.id, tier, selectedDay, plan]
  );

  // ---- Loading cache ----
  if (booting) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#5A9A3A" />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Generating ----
  if (generating) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator size="large" color="#5A9A3A" />
          <Text className="text-content mt-5 text-lg font-bold">
            Crafting your week…
          </Text>
          <Text className="text-content-muted mt-2 text-center text-sm">
            Building an original Nutritarian plan around your gBOMBS, goals, and
            tastes.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Empty state ----
  if (!plan) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="calendar-outline" size={56} color="#5A9A3A" />
          <Text className="text-content mt-4 text-2xl font-bold">
            Your Meal Plan
          </Text>
          <Text className="text-content-muted mt-2 text-center text-sm">
            Generate a personalized 7-day Nutritarian plan built around your
            gBOMBS superfoods.
          </Text>
          {error ? (
            <Text className="mt-4 text-center text-sm text-red-400">{error}</Text>
          ) : null}
          <TouchableOpacity
            onPress={handleGenerate}
            className="mt-8 w-full items-center rounded-2xl bg-[#5A9A3A] py-4"
          >
            <Text className="text-base font-bold text-black">
              Generate My Week
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Loaded plan ----
  const day = plan.days[selectedDay] ?? plan.days[0];

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-content text-3xl font-extrabold">Your Week</Text>
          <View className="flex-row">
            <TouchableOpacity
              onPress={() => setGroceryOpen(true)}
              className="mr-2 h-11 w-11 items-center justify-center rounded-full bg-surface-card"
            >
              <Ionicons name="cart-outline" size={20} color="#5A9A3A" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleGenerate}
              className="h-11 w-11 items-center justify-center rounded-full bg-surface-card"
            >
              <Ionicons name="refresh" size={20} color="#5A9A3A" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Weekly score */}
        <WeeklyScoreBar
          hit={plan.weeklyScore.categoriesHit}
          score={plan.weeklyScore.score}
        />

        {/* Day tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4 -mx-1"
          contentContainerStyle={{ paddingHorizontal: 4 }}
        >
          {plan.days.map((d, i) => {
            const isActive = i === selectedDay;
            return (
              <TouchableOpacity
                key={d.day}
                onPress={() => setSelectedDay(i)}
                className="mr-2 rounded-full px-4 py-2"
                style={{
                  backgroundColor: isActive ? '#5A9A3A' : '#161616',
                }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: isActive ? '#000' : '#A8A29E' }}
                >
                  {SHORT_DAYS[i] ?? d.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Selected day meals */}
        <Text className="text-content-muted mb-3 text-sm font-semibold">
          {day.label}
        </Text>
        {day.meals.map((m) => (
          <SwipeableMealCard
            key={m.id}
            meal={m}
            swapping={swappingId === m.id}
            onPress={() => setRecipeMeal(m)}
            onSwap={() => handleSwapMeal(m)}
            onDelete={() => handleDeleteMeal(m.id)}
          />
        ))}
      </ScrollView>

      <RecipeModal
        meal={recipeMeal}
        userId={user?.id ?? ''}
        tier={tier}
        onClose={() => setRecipeMeal(null)}
      />

      <GroceryScreen
        visible={groceryOpen}
        plan={plan}
        userId={user?.id ?? ''}
        tier={tier}
        onClose={() => setGroceryOpen(false)}
      />
    </SafeAreaView>
  );
}
