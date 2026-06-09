import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateWeeklyMealPlan,
  type WeeklyMealPlan,
  type GBombsCategory,
  type MealSummary,
} from '@/services/gemini';
import { buildUserMealContext } from '@/lib/mealContext';
import { loadCachedPlan, saveCachedPlan } from '@/lib/mealPlanCache';
import { GBOMBS_LETTERS, LETTER_BY_KEY } from '@/utils/gbombsImages';
import RecipeModal from './RecipeModal';

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT_LABEL: Record<string, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  smoothie: 'SMOOTHIE',
};

/** Row of small colored letter dots for the gBOMBS a meal hits. */
function CategoryDots({ cats }: { cats: GBombsCategory[] }) {
  if (cats.length === 0) {
    return <Text className="text-content-muted text-xs">—</Text>;
  }
  return (
    <View className="flex-row">
      {cats.map((c) => {
        const meta = LETTER_BY_KEY[c];
        return (
          <View
            key={c}
            className="mr-1 h-5 w-5 items-center justify-center rounded-full"
            style={{ backgroundColor: meta.glow }}
          >
            <Text className="text-[10px] font-bold text-black">
              {meta.letter}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

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

/** A single tappable meal card — opens the full recipe. */
function MealCard({ meal, onPress }: { meal: MealSummary; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="mb-3 rounded-2xl bg-surface-card p-4"
    >
      <Text className="text-content-muted mb-1 text-[11px] font-bold tracking-wider">
        {SLOT_LABEL[meal.slot] ?? meal.slot.toUpperCase()}
      </Text>
      <View className="flex-row items-center justify-between">
        <Text className="text-content flex-1 text-lg font-bold">{meal.name}</Text>
        <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
      </View>
      {meal.description ? (
        <Text className="text-content-muted mt-1 text-sm">
          {meal.description}
        </Text>
      ) : null}
      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Ionicons name="time-outline" size={14} color="#A8A29E" />
          <Text className="text-content-muted ml-1 text-xs">
            {meal.prepMinutes} min
          </Text>
        </View>
        <CategoryDots cats={meal.gbombs} />
      </View>
    </TouchableOpacity>
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
          <TouchableOpacity
            onPress={handleGenerate}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface-card"
          >
            <Ionicons name="refresh" size={20} color="#5A9A3A" />
          </TouchableOpacity>
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
          <MealCard key={m.id} meal={m} onPress={() => setRecipeMeal(m)} />
        ))}
      </ScrollView>

      <RecipeModal
        meal={recipeMeal}
        userId={user?.id ?? ''}
        tier={tier}
        onClose={() => setRecipeMeal(null)}
      />
    </SafeAreaView>
  );
}
