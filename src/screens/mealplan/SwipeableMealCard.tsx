import { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MealSummary, GBombsCategory } from '@/services/gemini';
import { LETTER_BY_KEY } from '@/utils/gbombsImages';

const SLOT_LABEL: Record<string, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  smoothie: 'SMOOTHIE',
};

// Two equal-width actions (Swap, Delete) sit behind the card.
const ACTION_WIDTH = 80;
const ACTIONS_TOTAL = ACTION_WIDTH * 2;
// Drag past this much of the open width to snap open on release.
const OPEN_THRESHOLD = ACTIONS_TOTAL * 0.4;

/** Row of small colored letter dots for the gBOMBS a meal hits. */
function CategoryDots({ cats }: { cats: GBombsCategory[] }) {
  if (cats.length === 0) {
    return <Text style={styles.dash}>—</Text>;
  }
  return (
    <View style={styles.dotsRow}>
      {cats.map((c) => {
        const meta = LETTER_BY_KEY[c];
        return (
          <View key={c} style={[styles.dot, { backgroundColor: meta.glow }]}>
            <Text style={styles.dotText}>{meta.letter}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A meal card that reveals Swap + Delete actions on a left swipe.
 * ------------------------------------------------------------------
 * The card is an Animated.View driven by a PanResponder; the action buttons
 * sit behind it and are uncovered as the card translates left. Tapping the
 * card body opens the recipe when closed, or snaps shut when already open.
 * Uses useNativeDriver:false so translateX animates on react-native-web too.
 */
export default function SwipeableMealCard({
  meal,
  swapping = false,
  onPress,
  onSwap,
  onDelete,
}: {
  meal: MealSummary;
  swapping?: boolean;
  onPress: () => void;
  onSwap: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const snapTo = (to: number) => {
    openRef.current = to !== 0;
    Animated.spring(translateX, {
      toValue: to,
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const pan = useRef(
    PanResponder.create({
      // Only claim horizontal drags so vertical list scrolling still works.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -ACTIONS_TOTAL : 0;
        let next = base + g.dx;
        if (next > 0) next = 0;
        if (next < -ACTIONS_TOTAL) next = -ACTIONS_TOTAL;
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -ACTIONS_TOTAL : 0;
        const next = base + g.dx;
        snapTo(next < -OPEN_THRESHOLD ? -ACTIONS_TOTAL : 0);
      },
    })
  ).current;

  const handlePress = () => {
    if (swapping) return; // ignore taps while a swap is in flight
    if (openRef.current) {
      snapTo(0); // first tap on an open card just closes it
    } else {
      onPress();
    }
  };

  const fireAction = (fn: () => void) => {
    snapTo(0);
    fn();
  };

  return (
    <View style={styles.wrap}>
      {/* Actions revealed behind the card */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, styles.swap]}
          activeOpacity={0.85}
          onPress={() => fireAction(onSwap)}
        >
          <Ionicons name="swap-horizontal" size={22} color="#000" />
          <Text style={styles.actionText}>Swap</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.delete]}
          activeOpacity={0.85}
          onPress={() => fireAction(onDelete)}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={[styles.actionText, styles.actionTextLight]}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* The card slides over the actions */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...pan.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePress}
          style={styles.card}
        >
          <Text style={styles.slot}>
            {SLOT_LABEL[meal.slot] ?? meal.slot.toUpperCase()}
          </Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{meal.name}</Text>
            <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
          </View>
          {meal.description ? (
            <Text style={styles.desc}>{meal.description}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={14} color="#A8A29E" />
              <Text style={styles.time}>{meal.prepMinutes} min</Text>
            </View>
            <CategoryDots cats={meal.gbombs} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Dim overlay + spinner while the AI swaps this meal. Sits above the
          card AND the actions so it blocks all interaction mid-swap. */}
      {swapping ? (
        <View style={styles.swapOverlay}>
          <ActivityIndicator color="#5A9A3A" />
          <Text style={styles.swapText}>Finding a fresh meal…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swap: { backgroundColor: '#5A9A3A' },
  delete: { backgroundColor: '#B91C1C' },
  actionText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 4,
  },
  actionTextLight: { color: '#fff' },
  card: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
  },
  swapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(10,10,10,0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapText: {
    color: '#F5F5F0',
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  slot: {
    color: '#A8A29E',
    marginBottom: 4,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#F5F5F0',
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
  },
  desc: {
    color: '#A8A29E',
    marginTop: 4,
    fontSize: 14,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
    color: '#A8A29E',
    marginLeft: 4,
    fontSize: 12,
  },
  dash: {
    color: '#A8A29E',
    fontSize: 12,
  },
  dotsRow: {
    flexDirection: 'row',
  },
  dot: {
    marginLeft: 4,
    height: 20,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dotText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000',
  },
});
