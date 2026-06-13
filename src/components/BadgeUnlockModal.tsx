import { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import type { BadgeDef } from '@/lib/badgeCatalog';

/**
 * Celebration overlay shown the moment a check-in earns one or more badges.
 * The badge icon springs in for a delight beat; copy comes from the catalog so
 * the modal appears instantly (no AI round-trip). Handles multiple badges earned
 * at once (e.g. a first perfect day that also completes a 7-day streak).
 *
 * The two animated elements use inline styles (not className) so the animation
 * is independent of NativeWind's handling of Animated components.
 */
export default function BadgeUnlockModal({
  badges,
  onClose,
}: {
  badges: BadgeDef[];
  onClose: () => void;
}) {
  const visible = badges.length > 0;
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, scale, fade]);

  if (!visible) return null;

  const multiple = badges.length > 1;
  const hero = badges[0];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/80 px-8">
        <Animated.View style={{ opacity: fade, width: '100%' }}>
          <View className="w-full items-center rounded-3xl bg-surface-card px-6 py-8">
            <Text className="text-brand-green text-xs font-bold uppercase tracking-widest">
              {multiple ? `${badges.length} Badges Unlocked` : 'Badge Unlocked'}
            </Text>

            {/* Hero icon springs in */}
            <Animated.Text
              style={{ fontSize: 64, marginVertical: 20, transform: [{ scale }] }}
            >
              {hero.icon}
            </Animated.Text>

            <Text className="text-content text-2xl font-extrabold">
              {hero.name}
            </Text>
            <Text className="text-content-muted mt-3 text-center text-sm leading-5">
              {hero.unlockMessage}
            </Text>

            {/* Any additional badges earned in the same check-in */}
            {multiple ? (
              <View className="mt-6 w-full">
                {badges.slice(1).map((b) => (
                  <View
                    key={b.key}
                    className="mt-2 flex-row items-center rounded-2xl bg-surface px-4 py-3"
                  >
                    <Text className="text-3xl">{b.icon}</Text>
                    <View className="ml-3 flex-1">
                      <Text className="text-content text-sm font-bold">
                        {b.name}
                      </Text>
                      <Text className="text-content-muted text-xs">
                        {b.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              className="mt-8 w-full rounded-xl bg-brand-green py-3.5"
            >
              <Text className="text-center text-base font-bold text-white">
                {multiple ? 'Awesome!' : 'Keep it going'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
