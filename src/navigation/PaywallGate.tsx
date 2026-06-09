import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import PaywallScreen from '@/screens/paywall/PaywallScreen';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Shown when a signed-in, onboarded user does NOT have an active subscription.
 *
 * Also smooths over the post-checkout race: on web, Stripe redirects the user
 * back to `/?checkout=success` the instant payment completes, but the webhook
 * that writes the subscription to our DB may land a second or two later. Without
 * this, the user would briefly see the paywall again after paying. So when we
 * detect the success param we show a "Finalizing…" splash and poll the profile
 * a few times — as soon as the subscription is recognized, AppNavigator swaps
 * this component out for the real app automatically.
 */
export default function PaywallGate() {
  const { refreshProfile } = useAuth();

  const [finalizing, setFinalizing] = useState<boolean>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('checkout');
  });

  useEffect(() => {
    if (!finalizing) return;

    // Clean the ?checkout=... param from the URL right away.
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }

    let cancelled = false;
    let tries = 0;

    const tick = async () => {
      if (cancelled) return;
      await refreshProfile();
      tries += 1;
      // If access was granted, AppNavigator unmounts us (cleanup cancels).
      if (tries >= 5) {
        if (!cancelled) setFinalizing(false); // give up → show the paywall
        return;
      }
      setTimeout(tick, 2000);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [finalizing, refreshProfile]);

  if (finalizing) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <ActivityIndicator size="large" color="#2D6A4F" />
        <Text className="text-content mt-5 text-center text-base font-semibold">
          Finalizing your subscription…
        </Text>
        <Text className="text-content-muted mt-2 text-center text-sm">
          This only takes a moment.
        </Text>
      </View>
    );
  }

  return <PaywallScreen gated />;
}
