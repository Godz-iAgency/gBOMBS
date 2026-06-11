import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { loadDashboard, type DashboardData } from '@/lib/dashboard';
import { GBOMBS_LETTERS } from '@/utils/gbombsImages';
import type { GBombsCategory } from '@/services/gemini';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import CheckInScreen from './CheckInScreen';

type Nav = BottomTabNavigationProp<MainTabParamList>;

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  const d = new Date();
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/** Whole days until `iso` (clamped at 0) — for the trial countdown. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

const TIER_LABELS: Record<string, string> = {
  standard: 'gBOMBS Starter',
  wellness_pro: 'gBOMBS Premium',
  trial: 'Free trial',
  canceled: 'Canceled',
};

/** The six gBOMBS letters, lit when hit — same look as the meal plan bar. */
function BadgeRow({ hit }: { hit: GBombsCategory[] }) {
  return (
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
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="mx-1 flex-1 items-center rounded-2xl bg-surface-card py-4"
    >
      <Ionicons name={icon} size={22} color="#5A9A3A" />
      <Text className="text-content mt-2 text-xs font-semibold">{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const navigation = useNavigation<Nav>();
  const tier = profile?.subscription_tier ?? 'standard';
  const status = profile?.subscription_status ?? '';

  const [data, setData] = useState<DashboardData | null>(null);
  const [booting, setBooting] = useState(true);
  const [checkInOpen, setCheckInOpen] = useState(false);

  // Refresh every time the tab gains focus — a check-in logged moments ago or
  // a plan generated on the Meal Plan tab should show here immediately.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user?.id) {
        setBooting(false);
        return;
      }
      loadDashboard(user.id).then((next) => {
        if (active) {
          setData(next);
          setBooting(false);
        }
      });
      return () => {
        active = false;
      };
    }, [user?.id])
  );

  // The check-in overlay lives inside this screen, so closing it doesn't
  // refire the focus effect — reload here to pick up a just-scored day.
  const closeCheckIn = useCallback(() => {
    setCheckInOpen(false);
    if (user?.id) loadDashboard(user.id).then(setData);
  }, [user?.id]);

  const checkIn = data?.checkIn ?? null;
  const plan = data?.plan ?? null;
  const streak = data?.streak ?? 0;
  const weekDays = data?.daysLoggedThisWeek ?? 0;

  const tierLabel = TIER_LABELS[tier] ?? tier;
  const trialDays =
    status === 'trialing' && data?.trialEndsAt
      ? daysUntil(data.trialEndsAt)
      : null;
  const statusDot =
    status === 'active' || status === 'trialing'
      ? '#5A9A3A'
      : status === 'past_due'
        ? '#F97316'
        : '#6B7280';

  if (booting) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#5A9A3A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <Text className="text-content text-3xl font-extrabold">
          {greeting()}
        </Text>
        <Text className="text-content-muted mt-1 text-sm">{todayLabel()}</Text>

        {/* Today's gBOMBS — hero card, opens the check-in overlay */}
        <TouchableOpacity
          onPress={() => setCheckInOpen(true)}
          activeOpacity={0.9}
          className="mt-6 rounded-2xl bg-surface-card p-5"
        >
          <Text className="text-content-muted text-xs font-semibold uppercase tracking-wide">
            Today's gBOMBS
          </Text>

          {checkIn ? (
            <>
              <View className="mt-3 flex-row items-center justify-between">
                <BadgeRow hit={checkIn.categoriesHit} />
                <Text className="text-content text-2xl font-extrabold">
                  {checkIn.score}/6{checkIn.score === 6 ? ' 🔥' : ''}
                </Text>
              </View>
              <Text className="text-content-muted mt-3 text-xs">
                Tap to see your coaching and tomorrow's tip →
              </Text>
            </>
          ) : (
            <>
              <View className="mt-3">
                <BadgeRow hit={[]} />
              </View>
              <Text className="text-content mt-4 text-base font-bold">
                You haven't logged today
              </Text>
              <Text className="text-content-muted mt-1 text-sm">
                Tell me what you ate and I'll score your gBOMBS coverage.
              </Text>
              <View className="mt-4 rounded-xl bg-brand-green py-3">
                <Text className="text-center text-sm font-bold text-white">
                  Log today's meals
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Streak + week progress */}
        <View className="-mx-1 mt-4 flex-row">
          <View className="mx-1 flex-1 rounded-2xl bg-surface-card p-4">
            <Text className="text-content text-3xl font-extrabold">
              {streak} 🔥
            </Text>
            <Text className="text-content-muted mt-1 text-xs font-semibold">
              Day streak
            </Text>
            <Text className="text-content-muted mt-1 text-xs">
              {streak === 0
                ? 'Log today to start one.'
                : 'Keep it going — log every day.'}
            </Text>
          </View>
          <View className="mx-1 flex-1 rounded-2xl bg-surface-card p-4">
            <Text className="text-content text-3xl font-extrabold">
              {weekDays}/7
            </Text>
            <Text className="text-content-muted mt-1 text-xs font-semibold">
              Days logged this week
            </Text>
            <Text className="text-content-muted mt-1 text-xs">
              {weekDays >= 7 ? 'Perfect week! ⭐' : 'Resets every Monday.'}
            </Text>
          </View>
        </View>

        {/* This week's plan */}
        <TouchableOpacity
          onPress={() => navigation.navigate('MealPlan')}
          activeOpacity={0.9}
          className="mt-4 rounded-2xl bg-surface-card p-5"
        >
          <Text className="text-content-muted text-xs font-semibold uppercase tracking-wide">
            This Week's Plan
          </Text>

          {plan ? (
            <>
              <View className="mt-3 flex-row items-center justify-between">
                <BadgeRow hit={plan.weeklyScore.categoriesHit} />
                <Text className="text-content text-2xl font-extrabold">
                  {plan.weeklyScore.score}/6
                </Text>
              </View>
              <Text className="text-content-muted mt-3 text-xs">
                Tap to view this week's meals →
              </Text>
            </>
          ) : (
            <>
              <Text className="text-content mt-3 text-base font-bold">
                No meal plan yet
              </Text>
              <Text className="text-content-muted mt-1 text-sm">
                Generate an AI week built around your gBOMBS.
              </Text>
              <View className="mt-4 rounded-xl bg-brand-green py-3">
                <Text className="text-center text-sm font-bold text-white">
                  Plan my week
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Quick actions */}
        <View className="-mx-1 mt-4 flex-row">
          <QuickAction
            icon="checkmark-done"
            label="Check in"
            onPress={() => setCheckInOpen(true)}
          />
          <QuickAction
            icon="calendar"
            label="Meal plan"
            onPress={() => navigation.navigate('MealPlan')}
          />
          <QuickAction
            icon="cart"
            label="Grocery"
            onPress={() => navigation.navigate('Grocery')}
          />
        </View>

        {/* Subscription pill */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.85}
          className="mt-6 flex-row items-center justify-between rounded-2xl border border-surface-border bg-surface-card px-4 py-3"
        >
          <View className="flex-row items-center">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: statusDot }}
            />
            <Text className="text-content ml-2 text-sm font-semibold">
              {tierLabel}
            </Text>
          </View>
          <Text className="text-content-muted text-xs">
            {trialDays !== null
              ? trialDays === 0
                ? 'Trial ends today'
                : `${trialDays} ${trialDays === 1 ? 'day' : 'days'} left in trial`
              : 'Manage →'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <CheckInScreen
        visible={checkInOpen}
        userId={user?.id ?? ''}
        tier={tier}
        onClose={closeCheckIn}
      />
    </SafeAreaView>
  );
}
