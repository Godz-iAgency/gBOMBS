import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { openBillingPortal } from '@/lib/subscription';
import { fetchTrialEnd } from '@/lib/dashboard';
import {
  getPlanState,
  PLAN_TITLE,
  PLAN_CTA_LABEL,
} from '@/lib/subscriptionPlan';
import {
  loadProfileSettings,
  updateUserField,
  type ProfileSettings,
} from '@/lib/profile';
import {
  DIET_MODES,
  HEALTH_GOALS,
  COOKING_STYLES,
  DIET_LABEL,
  GOAL_LABEL,
  STYLE_LABEL,
  type PlanOption,
} from '@/utils/profileOptions';
import type {
  DietMode,
  HealthGoal,
  CookingStyle,
} from '@/types/database.types';
import { LOGO_WITH_BG } from '@/utils/gbombsImages';
import EditPlanModal from './EditPlanModal';
import EditFavoritesModal from './EditFavoritesModal';
import EditAvoidModal from './EditAvoidModal';
import BadgeTrophyModal from './BadgeTrophyModal';

/** Whole days until `iso` (clamped at 0) — for the trial countdown. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

type ModalKind =
  | 'diet'
  | 'goal'
  | 'cooking'
  | 'favorites'
  | 'avoid'
  | 'badges'
  | null;

/** A tappable settings row: icon + label on the left, value + chevron right. */
function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center justify-between px-4 py-3.5"
    >
      <View className="flex-row items-center">
        <Ionicons name={icon} size={20} color="#5A9A3A" />
        <Text className="text-content ml-3 text-base">{label}</Text>
      </View>
      <View className="ml-3 flex-1 flex-row items-center justify-end">
        <Text
          className="text-content-muted text-sm"
          numberOfLines={1}
        >
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#6B7280" />
      </View>
    </TouchableOpacity>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-content-muted mb-2 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
      {children}
    </Text>
  );
}

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  const plan = getPlanState(profile);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    const next = await loadProfileSettings(user.id);
    setSettings(next);
  }, [user?.id]);

  // Re-sync settings + subscription each time the tab gains focus.
  useFocusEffect(
    useCallback(() => {
      reload();
      refreshProfile();
    }, [reload, refreshProfile])
  );

  // Trial countdown (only relevant in the trial state).
  useEffect(() => {
    if (plan !== 'trial' || !user?.id) return;
    let active = true;
    fetchTrialEnd(user.id).then((iso) => {
      if (active) setTrialEndsAt(iso);
    });
    return () => {
      active = false;
    };
  }, [plan, user?.id]);

  async function handlePortal() {
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch (e) {
      Alert.alert('Could not open billing', (e as Error).message);
    } finally {
      setPortalLoading(false);
    }
  }

  // Save handler for the single-select plan modal (diet / goal / cooking).
  const savePlan = useCallback(
    async (key: string) => {
      if (!user?.id) return;
      if (modal === 'diet') {
        await updateUserField(user.id, { diet_mode: key as DietMode });
      } else if (modal === 'goal') {
        await updateUserField(user.id, { health_goal: key as HealthGoal });
      } else if (modal === 'cooking') {
        await updateUserField(user.id, { cooking_style: key as CookingStyle });
      }
      await reload();
    },
    [user?.id, modal, reload]
  );

  // Which option set + current value the plan modal is showing.
  const planModal =
    modal === 'diet'
      ? { title: 'Diet mode', options: DIET_MODES, current: settings?.dietMode }
      : modal === 'goal'
        ? { title: 'Health goal', options: HEALTH_GOALS, current: settings?.healthGoal }
        : modal === 'cooking'
          ? { title: 'Cooking style', options: COOKING_STYLES, current: settings?.cookingStyle }
          : null;

  const trialDays = trialEndsAt ? daysUntil(trialEndsAt) : null;
  const subTitle =
    plan === 'trial'
      ? trialDays === null
        ? 'Trial in progress'
        : trialDays === 0
          ? 'Trial ends today'
          : `${trialDays} ${trialDays === 1 ? 'day' : 'days'} left`
      : 'Your current plan';

  if (!settings) {
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
        {/* Account header */}
        <Image
          source={LOGO_WITH_BG}
          style={{ width: '100%', height: 90 }}
          resizeMode="contain"
        />
        <Text className="text-content-muted mt-2 text-center text-sm">
          {user?.email}
        </Text>

        {/* MY PLAN */}
        <SectionLabel>My Plan</SectionLabel>
        <View className="overflow-hidden rounded-2xl bg-surface-card">
          <SettingRow
            icon="leaf-outline"
            label="Diet mode"
            value={DIET_LABEL[settings.dietMode]}
            onPress={() => setModal('diet')}
          />
          <View className="h-px bg-surface-border" />
          <SettingRow
            icon="flag-outline"
            label="Health goal"
            value={GOAL_LABEL[settings.healthGoal]}
            onPress={() => setModal('goal')}
          />
          <View className="h-px bg-surface-border" />
          <SettingRow
            icon="restaurant-outline"
            label="Cooking style"
            value={STYLE_LABEL[settings.cookingStyle]}
            onPress={() => setModal('cooking')}
          />
        </View>

        {/* FOOD PREFERENCES */}
        <SectionLabel>Food Preferences</SectionLabel>
        <View className="overflow-hidden rounded-2xl bg-surface-card">
          <SettingRow
            icon="heart-outline"
            label="Favorite foods"
            value={
              settings.favoriteCount
                ? `${settings.favoriteCount} selected`
                : 'None yet'
            }
            onPress={() => setModal('favorites')}
          />
          <View className="h-px bg-surface-border" />
          <SettingRow
            icon="close-circle-outline"
            label="Foods to avoid"
            value={settings.avoidCount ? `${settings.avoidCount}` : 'None'}
            onPress={() => setModal('avoid')}
          />
        </View>

        {/* ACHIEVEMENTS */}
        <SectionLabel>Achievements</SectionLabel>
        <View className="overflow-hidden rounded-2xl bg-surface-card">
          <SettingRow
            icon="trophy-outline"
            label="Badges & streaks"
            value="View"
            onPress={() => setModal('badges')}
          />
        </View>

        {/* SUBSCRIPTION */}
        <SectionLabel>Subscription</SectionLabel>
        <View className="rounded-2xl border border-surface-border bg-surface-card p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-content text-lg font-extrabold">
                {PLAN_TITLE[plan]}
              </Text>
              <Text className="text-content-muted mt-0.5 text-xs">
                {subTitle}
              </Text>
            </View>
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: '#5A9A3A' }}
            />
          </View>
          <TouchableOpacity
            onPress={handlePortal}
            disabled={portalLoading}
            activeOpacity={0.85}
            className="mt-4 rounded-xl bg-brand-green py-3"
          >
            {portalLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-center text-base font-bold text-white">
                {PLAN_CTA_LABEL[plan]}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={signOut}
          activeOpacity={0.85}
          className="mt-7 self-center rounded-xl border border-surface-border bg-surface-card px-8 py-3"
        >
          <Text className="text-content text-base font-semibold">Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Editors */}
      <EditPlanModal
        visible={!!planModal}
        title={planModal?.title ?? ''}
        options={(planModal?.options ?? []) as PlanOption<string>[]}
        current={planModal?.current ?? ''}
        onSelect={savePlan}
        onClose={() => setModal(null)}
      />
      <EditFavoritesModal
        visible={modal === 'favorites'}
        userId={user?.id ?? ''}
        dietMode={settings.dietMode}
        onClose={() => setModal(null)}
        onSaved={reload}
      />
      <EditAvoidModal
        visible={modal === 'avoid'}
        userId={user?.id ?? ''}
        onClose={() => setModal(null)}
        onSaved={reload}
      />
      <BadgeTrophyModal
        visible={modal === 'badges'}
        userId={user?.id ?? ''}
        onClose={() => setModal(null)}
      />
    </SafeAreaView>
  );
}
