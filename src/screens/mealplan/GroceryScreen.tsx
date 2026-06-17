import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  generateGroceryList,
  type GroceryList,
  type GroceryItem,
  type GBombsCategory,
  type WeeklyMealPlan,
} from '@/services/gemini';
import { buildUserMealContext } from '@/lib/mealContext';
import { loadCachedGrocery, saveCachedGrocery } from '@/lib/groceryCache';
import {
  groceryListToLineItems,
  createInstacartList,
  openInstacart,
} from '@/lib/instacart';
import { LETTER_BY_KEY } from '@/utils/gbombsImages';

// Safe area top padding — avoids react-native-safe-area-context on web
// (its inset style arrays can trigger a CSSStyleDeclaration indexed-property
// error in react-native-web 0.21 + React 19).
const TOP_PAD = Platform.OS === 'web' ? 48 : 44;

/** Small gBOMBS category badge next to an item. */
function CategoryBadge({ cat }: { cat: GBombsCategory }) {
  const meta = LETTER_BY_KEY[cat];
  if (!meta) return null;
  return (
    <View
      style={{
        marginLeft: 8,
        height: 20,
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: meta.glow,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#000' }}>
        {meta.letter}
      </Text>
    </View>
  );
}

/** One checkable row. Quantity + item stay in a single Text node (no nesting). */
function ItemRow({
  item,
  onToggle,
}: {
  item: GroceryItem;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.itemRow}>
      <Ionicons
        name={item.checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={item.checked ? '#5A9A3A' : '#A8A29E'}
      />
      <Text
        style={[styles.itemText, item.checked && styles.itemTextChecked]}
      >
        {item.quantity ? `${item.quantity}   ` : ''}{item.item}
      </Text>
      {item.category ? <CategoryBadge cat={item.category} /> : null}
    </TouchableOpacity>
  );
}

export default function GroceryScreen({
  visible,
  plan,
  userId,
  tier,
  onClose,
}: {
  visible: boolean;
  plan: WeeklyMealPlan | null;
  userId: string;
  tier: string;
  /** Omitted when embedded as a tab (no overlay to dismiss → no X button). */
  onClose?: () => void;
}) {
  const [list, setList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);

  const generate = useCallback(async () => {
    if (!plan || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = await buildUserMealContext(userId);
      const next = await generateGroceryList(plan, ctx, tier);
      setList(next);
      await saveCachedGrocery(userId, next);
    } catch (e) {
      setError(
        (e as Error).message ||
          'Could not build your grocery list. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [plan, userId, tier]);

  // On open: reuse a fresh cached list, otherwise generate. A list built from
  // an older plan (planGeneratedAt mismatch) counts as stale → regenerate.
  useEffect(() => {
    if (!visible || !plan || !userId) return;
    let active = true;
    (async () => {
      const cached = await loadCachedGrocery(userId);
      if (!active) return;
      if (cached && cached.planGeneratedAt === plan.generatedAt) {
        setList(cached);
      } else {
        setList(null);
        generate();
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, plan?.generatedAt, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleItem = useCallback(
    (sectionIdx: number, itemIdx: number) => {
      setList((prev) => {
        if (!prev) return prev;
        const next: GroceryList = {
          ...prev,
          sections: prev.sections.map((s, si) =>
            si !== sectionIdx
              ? s
              : {
                  ...s,
                  items: s.items.map((it, ii) =>
                    ii !== itemIdx ? it : { ...it, checked: !it.checked }
                  ),
                }
          ),
        };
        saveCachedGrocery(userId, next); // fire-and-forget persistence
        return next;
      });
    },
    [userId]
  );

  // Build an Instacart shopping-list page from the current list and open it.
  const handleInstacart = useCallback(async () => {
    if (!list) return;
    const items = groceryListToLineItems(list);
    if (items.length === 0) {
      Alert.alert('Nothing to order', 'Your grocery list is empty.');
      return;
    }
    setOrdering(true);
    try {
      const url = await createInstacartList(items);
      await openInstacart(url);
    } catch (e) {
      Alert.alert('Instacart', (e as Error).message);
    } finally {
      setOrdering(false);
    }
  }, [list]);

  if (!visible || !plan) return null;

  const totalItems = list
    ? list.sections.reduce((n, s) => n + s.items.length, 0)
    : 0;
  const checkedItems = list
    ? list.sections.reduce(
        (n, s) => n + s.items.filter((it) => it.checked).length,
        0
      )
    : 0;

  return (
    <View style={styles.overlay}>
      {/* Manual safe-area top pad — avoids SafeAreaView array-style bug on web */}
      <View style={{ height: TOP_PAD, backgroundColor: '#0A0A0A' }} />

      {/* Header */}
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#F5F5F0" />
          </TouchableOpacity>
        ) : (
          <View style={styles.closeBtn} />
        )}
        <Text style={styles.headerTitle}>Grocery List</Text>
        <TouchableOpacity
          onPress={generate}
          style={styles.closeBtn}
          disabled={loading}
        >
          <Ionicons name="refresh" size={20} color="#5A9A3A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#5A9A3A" />
          <Text style={styles.loadingText}>Building your shopping list…</Text>
          <Text style={styles.loadingSub}>
            Consolidating ingredients across all 7 days.
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color="#A8A29E" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={generate} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : list ? (
        <>
          {/* Progress */}
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {checkedItems} / {totalItems} items
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {list.sections.map((section, si) => (
              <View key={section.title}>
                <Text style={styles.sectionHeader}>{section.title}</Text>
                {section.items.map((item, ii) => (
                  <ItemRow
                    key={`${item.item}-${ii}`}
                    item={item}
                    onToggle={() => toggleItem(si, ii)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>

          {/* Send the list to Instacart (pre-filled cart on a hosted page). */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleInstacart}
              disabled={ordering || totalItems === 0}
              activeOpacity={0.85}
              style={[
                styles.instacartBtn,
                (ordering || totalItems === 0) && styles.instacartBtnDisabled,
              ]}
            >
              {ordering ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="cart" size={18} color="#FFFFFF" />
                  <Text style={styles.instacartText}>Shop with Instacart</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0A0A',
    zIndex: 50,
    elevation: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#F5F5F0',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#161616',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#F5F5F0',
    marginTop: 16,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingSub: {
    color: '#A8A29E',
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    color: '#f87171',
  },
  retryBtn: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#5A9A3A',
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryBtnText: {
    fontWeight: 'bold',
    color: '#000',
  },
  progressRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  progressText: {
    color: '#A8A29E',
    fontSize: 13,
    fontWeight: '600',
  },
  scroll: {
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sectionHeader: {
    color: '#5A9A3A',
    marginTop: 20,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
    paddingVertical: 12,
  },
  itemText: {
    color: '#F5F5F0',
    flex: 1,
    fontSize: 14,
    marginLeft: 12,
  },
  itemTextChecked: {
    color: '#A8A29E',
    textDecorationLine: 'line-through',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#2D2D2D',
    backgroundColor: '#0A0A0A',
  },
  instacartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#0AAD0A', // Instacart green
    paddingVertical: 14,
  },
  instacartBtnDisabled: {
    opacity: 0.5,
  },
  instacartText: {
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
