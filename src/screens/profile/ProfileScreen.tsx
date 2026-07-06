import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
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
  AUTOPILOT_DAYS,
  AUTOPILOT_DAY_LABEL,
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
import ReportsScreen from '@/screens/reports/ReportsScreen';
import ProfessionalAccessModal from '@/screens/professional/ProfessionalAccessModal';
import AcceptInviteModal from '@/screens/professional/AcceptInviteModal';
import ClientListModal from '@/screens/professional/ClientListModal';
import { hasActiveClients } from '@/lib/professional';

/** Whole days until `iso` (clamped at 0) — for the trial countdown. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

type ModalKind =
  | 'diet'
  | 'goal'
  | 'cooking'
  | 'autopilotDay'
  | 'favorites'
  | 'avoid'
  | 'badges'
  | 'reports'
  | 'proAccess'
  | 'acceptInvite'
  | 'clients'
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

/** Personal | Professional segmented switch (dual-role accounts only). */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: boolean;
  onChange: (pro: boolean) => void;
}) {
  return (
    <View className="mb-3 flex-row rounded-xl bg-surface-card p-1">
      {[
        { pro: false, label: 'Personal' },
        { pro: true, label: 'Professional' },
      ].map(({ pro, label }) => {
        const selected = mode === pro;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => onChange(pro)}
            activeOpacity={0.85}
            className={`flex-1 rounded-lg py-2 ${
              selected ? 'bg-brand-green' : ''
            }`}
          >
            <Text
              className={`text-center text-sm font-bold ${
                selected ? 'text-white' : 'text-content-muted'
              }`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  // Dual-role users (a normal member who is ALSO someone's chef/trainer) flip
  // this to reach their client-facing surface. Defaults to Personal; the toggle
  // that controls it only renders when `isPro` is true.
  const [proMode, setProMode] = useState(false);

  const plan = getPlanState(profile);
  // Inviting a chef/trainer is a Premium feature. Match the server rule
  // (create_professional_invite): Premium tier, currently active or trialing.
  const premium =
    profile?.subscription_tier === 'wellness_pro' &&
    ['active', 'trialing'].includes(profile?.subscription_status ?? '');

  const reload = useCallback(async () => {
    if (!user?.id) return;
    const next = await loadProfileSettings(user.id);
    setSettings(next);
    // Auto-detect the professional side: only surface the Personal/Professional
    // toggle when this account is actually connected to someone as their
    // chef/trainer. If they stop being a professional, drop back to Personal.
    hasActiveClients(user.id).then((v) => {
      setIsPro(v);
      if (!v) setProMode(false);
    });
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

  // "Professional access" (invite your own chef/trainer). Premium opens the
  // invite flow; everyone else is routed to upgrade first.
  function handleProfessionalAccess() {
    if (premium) {
      setModal('proAccess');
      return;
    }
    Alert.alert(
      'Premium feature',
      'Connecting a Personal Chef or Trainer/Nutritionist is part of gBOMBS Premium. Upgrade to invite your professionals.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: handlePortal },
      ]
    );
  }

  // Save handler for the single-select plan modal (diet / goal / cooking / day).
  const savePlan = useCallback(
    async (key: string) => {
      if (!user?.id) return;
      if (modal === 'diet') {
        await updateUserField(user.id, { diet_mode: key as DietMode });
      } else if (modal === 'goal') {
        await updateUserField(user.id, { health_goal: key as HealthGoal });
      } else if (modal === 'cooking') {
        await updateUserField(user.id, { cooking_style: key as CookingStyle });
      } else if (modal === 'autopilotDay') {
        await updateUserField(user.id, { autopilot_day: Number(key) });
      }
      await reload();
    },
    [user?.id, modal, reload]
  );

  // Autopilot opt-in/out. Enabling defaults the day to TODAY's weekday (so a
  // Friday enable means "every Friday") unless a day was already chosen.
  const toggleAutopilot = useCallback(
    async (on: boolean) => {
      if (!user?.id || !settings) return;
      // Optimistic flip so the switch answers instantly.
      setSettings({ ...settings, autopilotEnabled: on });
      try {
        await updateUserField(
          user.id,
          on
            ? {
                autopilot_enabled: true,
                autopilot_day: settings.autopilotDay ?? new Date().getDay(),
              }
            : { autopilot_enabled: false }
        );
      } catch (e) {
        Alert.alert('Could not save', (e as Error).message);
      }
      await reload();
    },
    [user?.id, settings, reload]
  );

  // Which option set + current value the plan modal is showing.
  const planModal =
    modal === 'diet'
      ? { title: 'Diet mode', options: DIET_MODES, current: settings?.dietMode }
      : modal === 'goal'
        ? { title: 'Health goal', options: HEALTH_GOALS, current: settings?.healthGoal }
        : modal === 'cooking'
          ? { title: 'Cooking style', options: COOKING_STYLES, current: settings?.cookingStyle }
          : modal === 'autopilotDay'
            ? {
                title: 'Regeneration day',
                options: AUTOPILOT_DAYS,
                current: String(settings?.autopilotDay ?? new Date().getDay()),
              }
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
        <View
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: '#5A9A3A66', backgroundColor: '#5A9A3A14' }}
        >
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

        {/* AUTOPILOT — weekly hands-off regeneration (Step 11.8). Off by
            default; enabling anchors the day to today until they change it. */}
        <SectionLabel>Autopilot</SectionLabel>
        <View
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: '#4A90D966', backgroundColor: '#4A90D914' }}
        >
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <View className="flex-1 flex-row items-center">
              <Ionicons name="sync-outline" size={20} color="#5A9A3A" />
              <View className="ml-3 flex-1 pr-3">
                <Text className="text-content text-base">
                  Auto-generate weekly
                </Text>
                <Text className="text-content-muted mt-0.5 text-xs leading-4">
                  A fresh plan + grocery list every week, automatically — in
                  the evening, your local time.
                </Text>
              </View>
            </View>
            <Switch
              value={settings.autopilotEnabled}
              onValueChange={toggleAutopilot}
              trackColor={{ false: '#2D2D2D', true: '#5A9A3A' }}
              thumbColor="#F5F5F0"
            />
          </View>
          {settings.autopilotEnabled && (
            <>
              <View className="h-px bg-surface-border" />
              <SettingRow
                icon="calendar-outline"
                label="Regenerates every"
                value={
                  AUTOPILOT_DAY_LABEL[
                    String(settings.autopilotDay ?? new Date().getDay())
                  ] ?? '—'
                }
                onPress={() => setModal('autopilotDay')}
              />
            </>
          )}
        </View>

        {/* FOOD PREFERENCES */}
        <SectionLabel>Food Preferences</SectionLabel>
        <View
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: '#D85A8E66', backgroundColor: '#D85A8E14' }}
        >
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
        <View
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: '#D4A84E66', backgroundColor: '#D4A84E14' }}
        >
          <SettingRow
            icon="trophy-outline"
            label="Badges & streaks"
            value="View"
            onPress={() => setModal('badges')}
          />
          <View className="h-px bg-surface-border" />
          <SettingRow
            icon="bar-chart-outline"
            label="Progress reports"
            value="View"
            onPress={() => setModal('reports')}
          />
        </View>

        {/* PROFESSIONAL */}
        <SectionLabel>Professional</SectionLabel>

        {/* The Personal/Professional switch only exists for accounts that are
            actually someone's chef/trainer. Regular members never see it. */}
        {isPro && <ModeToggle mode={proMode} onChange={setProMode} />}

        <View
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: '#8A7BD866', backgroundColor: '#8A7BD814' }}
        >
          {isPro && proMode ? (
            // PROFESSIONAL mode — the client-facing surface.
            <>
              <SettingRow
                icon="briefcase-outline"
                label="My clients"
                value="View"
                onPress={() => setModal('clients')}
              />
              <View className="h-px bg-surface-border" />
              <SettingRow
                icon="qr-code-outline"
                label="Connect to a client"
                value="Enter code"
                onPress={() => setModal('acceptInvite')}
              />
            </>
          ) : (
            // PERSONAL mode — invite your own chef/trainer (Premium).
            <>
              <SettingRow
                icon="people-outline"
                label="Professional access"
                value={premium ? 'Chef & trainer' : 'Premium'}
                onPress={handleProfessionalAccess}
              />
              {/* TODO(Phase B): TEMPORARY testing entry — remove once deep-link
                  accept (gbombs://connect?code=…) is wired. Lets a fresh account
                  accept its first invite to become a professional, since the
                  real "Connect to a client" only shows in Professional mode and
                  Professional mode only appears after you already have a client. */}
              <View className="h-px bg-surface-border" />
              <SettingRow
                icon="qr-code-outline"
                label="Connect to a client (test)"
                value="Enter code"
                onPress={() => setModal('acceptInvite')}
              />
            </>
          )}
        </View>

        {/* SUBSCRIPTION */}
        <SectionLabel>Subscription</SectionLabel>
        <View
          className="rounded-2xl border p-5"
          style={{ borderColor: '#5A9A3A66', backgroundColor: '#5A9A3A14' }}
        >
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
          className="mt-7 self-center rounded-xl border px-8 py-3"
          style={{ borderColor: '#D85A8E66', backgroundColor: '#D85A8E14' }}
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
      <ReportsScreen
        visible={modal === 'reports'}
        userId={user?.id ?? ''}
        onClose={() => setModal(null)}
      />

      {/* Professional dashboards (Step 11) */}
      <ProfessionalAccessModal
        visible={modal === 'proAccess'}
        onClose={() => setModal(null)}
      />
      <AcceptInviteModal
        visible={modal === 'acceptInvite'}
        onClose={() => setModal(null)}
        onConnected={() => {
          // A new client connection may have just made us a professional.
          if (user?.id) hasActiveClients(user.id).then(setIsPro);
        }}
      />
      <ClientListModal
        visible={modal === 'clients'}
        onClose={() => setModal(null)}
      />
    </SafeAreaView>
  );
}
