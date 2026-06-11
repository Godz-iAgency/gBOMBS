import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { openBillingPortal } from '@/lib/subscription';
import { LOGO_WITH_BG } from '@/utils/gbombsImages';

/**
 * Profile placeholder. Real content (settings, diet mode, goals, connected
 * professionals) is built in Phase 4. Keeps sign-out available for now, plus a
 * billing-portal entry for subscribers to upgrade / downgrade / cancel.
 */
export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);

  const hasSubscription = !!profile?.subscription_id;

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

        {hasSubscription && (
          <TouchableOpacity
            onPress={handlePortal}
            disabled={portalLoading}
            activeOpacity={0.85}
            className="mt-8 w-full max-w-xs rounded-xl bg-brand-green px-8 py-3"
          >
            {portalLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-center text-base font-bold text-white">
                Manage subscription
              </Text>
            )}
          </TouchableOpacity>
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
