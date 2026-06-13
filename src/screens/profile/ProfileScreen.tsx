import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { openBillingPortal } from '@/lib/subscription';
import { fetchTrialEnd } from '@/lib/dashboard';
import {
  getPlanState,
  PLAN_TITLE,
  PLAN_CTA_LABEL,
} from '@/lib/subscriptionPlan';
import { LOGO_WITH_BG } from '@/utils/gbombsImages';

/** Whole days until `iso` (clamped at 0) — for the trial countdown. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Profile. Real settings (diet mode, goals, connected professionals) arrive in
 * Phase 4. For now it's the single home for subscription management: the plan
 * status + the only path to upgrade / cancel (via the Stripe portal). Keeping
 * that off Home is deliberate — cancel should take a couple of taps, not one.
 */
export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  const plan = getPlanState(profile);

  // Re-sync the plan every time the tab gains focus — when the user returns
  // from the Stripe portal (upgrade/downgrade/cancel), the badge + block here
  // should reflect the change without a manual app restart.
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  // Pull the trial end date only when it's relevant (trial state), for the
  // "X days left" subtitle. Best-effort — a failure just hides the countdown.
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

  const trialDays = trialEndsAt ? daysUntil(trialEndsAt) : null;
  const subtitle =
    plan === 'trial'
      ? trialDays === null
        ? 'Trial in progress'
        : trialDays === 0
          ? 'Trial ends today'
          : `${trialDays} ${trialDays === 1 ? 'day' : 'days'} left`
      : 'Your current plan';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <Image
          source={LOGO_WITH_BG}
          style={{ width: '100%', height: 110 }}
          resizeMode="contain"
        />
        <Text className="text-content mt-3 text-lg font-semibold">
          You're signed in
        </Text>
        <Text className="text-content-muted mt-1 text-sm">{user?.email}</Text>

        {/* Subscription block — plan status + the only upgrade/cancel path. */}
        {profile && (
          <View className="mt-8 w-full max-w-xs rounded-2xl border border-surface-border bg-surface-card p-5">
            <Text className="text-content-muted text-xs font-semibold uppercase tracking-wide">
              Subscription
            </Text>
            <View className="mt-2 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-content text-lg font-extrabold">
                  {PLAN_TITLE[plan]}
                </Text>
                <Text className="text-content-muted mt-0.5 text-xs">
                  {subtitle}
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
        )}

        <TouchableOpacity
          onPress={signOut}
          activeOpacity={0.85}
          className="mt-4 rounded-xl border border-surface-border bg-surface-card px-8 py-3"
        >
          <Text className="text-base font-semibold text-content">Sign out</Text>
        </TouchableOpacity>

        <Text className="text-content-muted mt-12 text-center text-xs">
          Full profile (settings, goals, connected pros) arrives in Phase 4.
        </Text>
      </View>
    </SafeAreaView>
  );
}
