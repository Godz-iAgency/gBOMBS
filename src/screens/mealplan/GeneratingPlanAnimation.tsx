import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Full-week generation loading state — a stepped checklist + easing progress bar
 * so a ~15–30s AI call reads as "working through real steps," not a frozen
 * spinner. Each step lights up in turn (spinner → green check); the last step
 * holds until generation finishes and this unmounts. Web-safe: react-native
 * Animated runs on react-native-web (width uses useNativeDriver:false).
 */

const STEPS = [
  'Reading your goals & gBOMBS',
  'Planning your week',
  'Balancing greens, beans & berries',
  'Writing your 35 meals',
  'Finishing touches',
];

// When each step becomes the ACTIVE one (ms into the run). Brisk early so even
// a fast (~10s) generation walks through several; the last step holds until the
// real work completes, so it never shows "done" prematurely.
const STEP_AT_MS = [0, 2500, 6000, 10000, 15000];
const TOTAL_MS = 20000;

export default function GeneratingPlanAnimation() {
  const [step, setStep] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: TOTAL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Advance the active step on the schedule above.
    const timers = STEP_AT_MS.slice(1).map((at, i) =>
      setTimeout(() => setStep(i + 1), at)
    );
    return () => timers.forEach(clearTimeout);
  }, [progress, pulse]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['6%', '95%'],
  });
  const iconScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}
      >
        <Ionicons name="restaurant" size={34} color="#5A9A3A" />
      </Animated.View>

      <Text style={styles.title}>Crafting your week…</Text>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: barWidth }]} />
      </View>

      <View style={styles.steps}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <View key={label} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={13} color="#000" />
                ) : active ? (
                  <View style={styles.stepDotPulse} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.stepText,
                  (done || active) && styles.stepTextOn,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconWrap: {
    height: 72,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  title: {
    color: '#F5F5F0',
    marginTop: 20,
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressTrack: {
    marginTop: 18,
    height: 6,
    width: 240,
    borderRadius: 3,
    backgroundColor: '#1F1F1F',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5A9A3A',
  },
  steps: {
    marginTop: 28,
    alignSelf: 'stretch',
    paddingHorizontal: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  stepDot: {
    height: 22,
    width: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: '#5A9A3A',
    borderColor: '#5A9A3A',
  },
  stepDotActive: {
    borderColor: '#5A9A3A',
  },
  stepDotPulse: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: '#5A9A3A',
  },
  stepText: {
    color: '#6B7280',
    marginLeft: 12,
    fontSize: 14,
  },
  stepTextOn: {
    color: '#F5F5F0',
    fontWeight: '600',
  },
});
