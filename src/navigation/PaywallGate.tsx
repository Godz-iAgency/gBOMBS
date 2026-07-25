import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Platform,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PaywallScreen from '@/screens/paywall/PaywallScreen';
import { LOGO_WITH_BG } from '@/utils/gbombsImages';
import { useAuth } from '@/contexts/AuthContext';

/** How many times we poll the profile before giving up (2s apart). */
const MAX_TRIES = 5;

/**
 * Stage labels shown while we wait. These are driven by the REAL poll counter,
 * not a decorative timer — each tick of the polling loop advances one stage, so
 * the progress a user sees always reflects work actually happening. The last
 * stage is sticky: if the webhook is slow we sit on "Almost ready" rather than
 * showing a finished bar while still waiting.
 */
const STAGES = [
  'Confirming your payment',
  'Activating your subscription',
  'Setting up your account',
  'Almost ready',
];

/** One row in the stage checklist: done ✓ / in progress ◌ / pending ○. */
function StageRow({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'active' | 'pending';
}) {
  return (
    <View className="mb-3 flex-row items-center">
      <View className="mr-3 h-6 w-6 items-center justify-center">
        {state === 'done' ? (
          <Ionicons name="checkmark-circle" size={22} color="#5A9A3A" />
        ) : state === 'active' ? (
          <ActivityIndicator size="small" color="#5A9A3A" />
        ) : (
          <View className="h-4 w-4 rounded-full border-2 border-surface-border" />
        )}
      </View>
      <Text
        className={
          state === 'pending'
            ? 'text-content-muted text-base'
            : 'text-content text-base font-semibold'
        }
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Shown when a signed-in, onboarded user does NOT have an active subscription.
 *
 * Also smooths over the post-checkout race: on web, Stripe redirects the user
 * back to `/?checkout=success` the instant payment completes, but the webhook
 * that writes the subscription to our DB may land a second or two later. Without
 * this, the user would briefly see the paywall again after paying. So when we
 * detect the success param we show a staged "Finalizing…" screen and poll the
 * profile a few times — as soon as the subscription is recognized, AppNavigator
 * swaps this component out for the real app automatically.
 */
export default function PaywallGate() {
  const { refreshProfile } = useAuth();

  const [finalizing, setFinalizing] = useState<boolean>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('checkout');
  });
  // Which stage the checklist is on — advanced by the poll loop below.
  const [stage, setStage] = useState(0);

  const progress = useRef(new Animated.Value(0)).current;

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
      if (tries >= MAX_TRIES) {
        if (!cancelled) setFinalizing(false); // give up → show the paywall
        return;
      }
      // Advance the checklist, clamped so the final stage stays put while we
      // keep polling (never show "complete" before the webhook actually lands).
      if (!cancelled) setStage(Math.min(tries, STAGES.length - 1));
      setTimeout(tick, 2000);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [finalizing, refreshProfile]);

  // Animate the bar toward the current stage. useNativeDriver must be false —
  // width isn't a native-drivable property.
  useEffect(() => {
    Animated.timing(progress, {
      toValue: (stage + 1) / STAGES.length,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [stage, progress]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (finalizing) {
    return (
      <View className="flex-1 justify-center bg-surface px-8">
        <View className="items-center">
          <Image
            source={LOGO_WITH_BG}
            style={{ width: '100%', height: 80 }}
            resizeMode="contain"
          />
          <Text className="text-content mt-5 text-center text-xl font-extrabold">
            Finalizing your subscription
          </Text>
          <Text className="text-content-muted mt-1.5 text-center text-sm">
            Hang tight — this only takes a moment.
          </Text>
        </View>

        {/* Progress bar */}
        <View className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-surface-card">
          <Animated.View
            style={{ width: barWidth, backgroundColor: '#5A9A3A' }}
            className="h-full rounded-full"
          />
        </View>

        {/* Stage checklist */}
        <View className="mt-7">
          {STAGES.map((label, i) => (
            <StageRow
              key={label}
              label={label}
              state={i < stage ? 'done' : i === stage ? 'active' : 'pending'}
            />
          ))}
        </View>
      </View>
    );
  }

  return <PaywallScreen gated />;
}
