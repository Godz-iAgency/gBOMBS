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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { loadDashboard, type DashboardData } from '@/lib/dashboard';
import { getPlanState, PLAN_BADGE_LABEL } from '@/lib/subscriptionPlan';
import { PlantGroupTiles } from '@/components/PlantGroups';
import PlantBenefitModal from '@/components/PlantBenefitModal';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';
import HomeProgressCard from './HomeProgressCard';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import CheckInScreen from './CheckInScreen';
import ReportsScreen from '@/screens/reports/ReportsScreen';
import ProfessionalUpdatesCard from './ProfessionalUpdatesCard';
import { useTabletLayout } from '@/hooks/useTabletLayout';

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

function QuickAction({
  icon,
  label,
  color,
  onPress,
  tablet = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  tablet?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="mx-1 flex-1 items-center rounded-2xl border py-4"
      style={{ borderColor: color + '66', backgroundColor: color + '14', ...(tablet ? { minHeight: 96, paddingVertical: 20 } : {}) }}
    >
      <Ionicons name={icon} size={tablet ? 28 : 22} color={color} />
      <Text className="text-content mt-2 text-xs font-semibold" style={tablet ? { fontSize: 14 } : undefined}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const navigation = useNavigation<Nav>();
  const { tablet, landscape, height } = useTabletLayout();
  const [viewportHeight, setViewportHeight] = useState(0);
  const tabletTileHeight = Math.max(96, Math.min(180, Math.round((viewportHeight || height) * (landscape ? 0.14 : 0.11))));
  const tabletChartHeight = Math.max(110, Math.min(220, Math.round((viewportHeight || height) * (landscape ? 0.24 : 0.11))));
  const tier = profile?.subscription_tier ?? 'standard';
  const planState = getPlanState(profile);
  const planBadge = PLAN_BADGE_LABEL[planState];
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';

  const [data, setData] = useState<DashboardData | null>(null);
  const [booting, setBooting] = useState(true);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [plantBenefit, setPlantBenefit] = useState<GBombsCategoryKey | null>(null);

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
  const todayScore = data?.todayScore ?? checkIn;
  const streak = data?.streak ?? 0;
  const weekDays = data?.daysLoggedThisWeek ?? 0;

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
        style={{ width: '100%', maxWidth: tablet ? undefined : 760, alignSelf: 'center' }}
        contentContainerStyle={tablet ? { padding: 16, paddingBottom: 24, flexGrow: 1 } : { padding: 20, paddingBottom: 40 }}
        onLayout={tablet ? (event) => setViewportHeight(event.nativeEvent.layout.height) : undefined}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting + plan badge (badge taps through to Profile) */}
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            {firstName ? (
              <>
                <Text
                  className="text-content font-extrabold"
                  style={{ fontSize: tablet ? 24 : 20 }}
                >
                  {greeting()},
                </Text>
                <Text
                  className="text-content -mt-1"
                  style={{ fontFamily: 'Caveat_700Bold', fontSize: tablet ? 42 : 34 }}
                >
                  {firstName}
                </Text>
              </>
            ) : (
              <Text
                className="text-content font-extrabold"
                style={{ fontSize: tablet ? 24 : 20 }}
              >
                {greeting()}
              </Text>
            )}
            <Text className="text-content-muted mt-1 text-sm">
              {todayLabel()}
            </Text>
          </View>
          {planState === 'premium' ? (
            // Premium reads as a luxe gold pill — brushed-gold gradient, a subtle
            // lighter rim, and a sparkle mark. The others stay understated.
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.85}
              className="ml-3 mt-1.5"
              style={{
                shadowColor: '#D4A84E',
                shadowOpacity: 0.12,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            >
              <LinearGradient
                colors={['#F8E39A', '#D9AE52', '#B7862E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: '#F2D98C',
                }}
              >
                <Ionicons name="sparkles" size={12} color="#3D2C00" />
                <Text
                  className="ml-1 text-xs font-extrabold"
                  style={{ color: '#3D2C00' }}
                >
                  {planBadge}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.85}
              className="ml-3 mt-1.5 flex-row items-center rounded-full border border-surface-border bg-surface-card px-3 py-1.5"
            >
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: '#5A9A3A' }}
              />
              <Text className="text-content ml-1.5 text-xs font-semibold">
                {planBadge}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={tablet ? { flexGrow: 1, flexDirection: landscape ? 'row' : 'column', gap: landscape ? 20 : 0, marginTop: landscape ? 24 : 0 } : undefined}>
        <View className="mt-6 rounded-2xl border p-5" style={{ borderColor: '#3C4D32', backgroundColor: '#11190E', ...(tablet ? { padding: 24, flexGrow: 1, flexBasis: landscape ? 0 : undefined, marginTop: landscape ? 0 : 24 } : {}) }}>
          <Text style={{ color: '#B9CEA9', fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>TODAY’S PLANT GROUPS</Text>
          <Text className="text-content mt-2 text-xl font-bold" style={tablet ? { fontSize: 24 } : undefined}>{todayScore ? `${todayScore.score} of 6 groups logged` : 'A little variety, every day'}</Text>
          <Text className="text-content-muted mt-2 mb-4 text-sm">{checkIn ? 'Review your meals, coaching and tip for tomorrow.' : todayScore ? 'Your plant groups are saved. Update your meals for fresh coaching.' : 'Log what you ate to see which plant groups you included.'}</Text>
          <View style={tablet ? { marginBottom: 18 } : undefined}>
            <PlantGroupTiles hit={todayScore?.categoriesHit ?? []} logged={!!todayScore} onSelect={setPlantBenefit} large={tablet} tileHeight={tablet ? tabletTileHeight : undefined} />
          </View>
          <TouchableOpacity onPress={() => setCheckInOpen(true)} accessibilityRole="button" activeOpacity={0.85}
            style={{ marginTop: tablet ? 'auto' : 18, paddingTop: tablet ? 12 : undefined, paddingBottom: tablet ? 12 : undefined, backgroundColor: '#3A6B2A', minHeight: tablet ? 56 : 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{checkIn ? 'Review today’s meals' : todayScore ? 'Update today’s meals' : "Log today's meals"}</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <HomeProgressCard trend={data?.trend ?? []} streak={streak} weekDays={weekDays} onPress={() => setReportsOpen(true)} tablet={tablet} chartHeight={tablet ? tabletChartHeight : 70}
          style={tablet ? { flexGrow: 1, flexBasis: landscape ? 0 : undefined, marginTop: landscape ? 0 : 16 } : undefined} />
        </View>

        {/* Professional Updates — chef/trainer changes, with 48h Undo
            (renders nothing when there are none) */}
        <ProfessionalUpdatesCard userId={user?.id ?? ''} tier={tier} />

        {/* Quick actions */}
        <View className="-mx-1 mt-4 flex-row">
          <QuickAction
            icon="checkmark-done-outline"
            label="Check in"
            color="#5A9A3A"
            onPress={() => setCheckInOpen(true)}
            tablet={tablet}
          />
          <QuickAction
            icon="calendar-outline"
            label="Meal plan"
            color="#D4A84E"
            onPress={() => navigation.navigate('MealPlan')}
            tablet={tablet}
          />
          <QuickAction
            icon="cart-outline"
            label="Grocery"
            color="#4A90D9"
            onPress={() => navigation.navigate('Grocery')}
            tablet={tablet}
          />
        </View>
      </ScrollView>

      <PlantBenefitModal category={plantBenefit} onClose={() => setPlantBenefit(null)} />

      <CheckInScreen
        visible={checkInOpen}
        userId={user?.id ?? ''}
        tier={tier}
        onClose={closeCheckIn}
      />

      <ReportsScreen
        visible={reportsOpen}
        userId={user?.id ?? ''}
        onClose={() => setReportsOpen(false)}
      />
    </SafeAreaView>
  );
}
