import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getClientProfile,
  loadClientPlan,
  loadClientGrocery,
  type ClientProfile,
} from '@/lib/professional';
import { notify } from '@/utils/dialog';
import {
  groceryListToLineItems,
  createInstacartList,
  openInstacart,
} from '@/lib/instacart';
import { DIET_LABEL, GOAL_LABEL, STYLE_LABEL } from '@/utils/profileOptions';
import type {
  WeeklyMealPlan,
  GroceryList,
  DayPlan,
  GBombsCategory,
} from '@/services/gemini';
import type { DietMode, HealthGoal, CookingStyle } from '@/types/database.types';

/** gBOMBS category → its dot color (mirrors tailwind.config gbombs.*). */
const GB_COLOR: Record<GBombsCategory, string> = {
  greens: '#3A6B2A',
  beans: '#6B4423',
  onion: '#8B2252',
  mushroom: '#9B7232',
  berries: '#3D2F7A',
  seeds: '#9B8C3A',
};

const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  smoothie: 'Smoothie',
  dessert: 'Dessert',
};

/**
 * Chef Dashboard — the KITCHEN view for one connected client.
 * ------------------------------------------------------------------
 * The chef executes the plan: the full week with prep timing per day, the
 * client's diet constraints, and the consolidated grocery list with a
 * "Send to Instacart" action they can fire on the client's behalf. (Recipe
 * notes + the trainer-update banner arrive with the write layer in Step 11.6.)
 */
export default function ChefDashboardModal({
  visible,
  clientId,
  clientName,
  onClose,
}: {
  visible: boolean;
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [plan, setPlan] = useState<WeeklyMealPlan | null>(null);
  const [grocery, setGrocery] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [instacartBusy, setInstacartBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setProfile(null);
      setPlan(null);
      setGrocery(null);
      setLoading(true);
      return;
    }
    let active = true;
    (async () => {
      const [p, pl, g] = await Promise.all([
        getClientProfile(clientId).catch(() => null),
        loadClientPlan(clientId).catch(() => null),
        loadClientGrocery(clientId).catch(() => null),
      ]);
      if (!active) return;
      setProfile(p);
      setPlan(pl);
      setGrocery(g);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [visible, clientId]);

  async function handleInstacart() {
    if (!grocery) return;
    setInstacartBusy(true);
    try {
      const items = groceryListToLineItems(grocery);
      const url = await createInstacartList(
        items,
        `${clientName}'s gBOMBS Grocery List`
      );
      await openInstacart(url);
    } catch (e) {
      notify('Instacart', (e as Error).message);
    } finally {
      setInstacartBusy(false);
    }
  }

  const groceryCount =
    grocery?.sections.reduce((n, s) => n + s.items.length, 0) ?? 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center border-b border-surface-border px-4 py-3">
          <TouchableOpacity onPress={onClose} hitSlop={10} className="mr-3">
            <Ionicons name="chevron-back" size={26} color="#A8A29E" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-content text-lg font-extrabold" numberOfLines={1}>
              {clientName}
            </Text>
            <View className="flex-row items-center">
              <Ionicons name="restaurant" size={12} color="#5A9A3A" />
              <Text className="text-content-muted ml-1 text-xs">
                Personal Chef — kitchen view
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#5A9A3A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Client constraints */}
            {profile && (
              <View className="flex-row flex-wrap">
                <Chip
                  icon="leaf-outline"
                  text={DIET_LABEL[profile.diet_mode as DietMode] ?? profile.diet_mode}
                />
                <Chip
                  icon="flag-outline"
                  text={
                    GOAL_LABEL[profile.health_goal as HealthGoal] ??
                    profile.health_goal
                  }
                />
                <Chip
                  icon="time-outline"
                  text={
                    STYLE_LABEL[profile.cooking_style as CookingStyle] ??
                    profile.cooking_style
                  }
                />
              </View>
            )}

            {/* Grocery + Instacart */}
            <Text className="text-content-muted mb-2 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
              Grocery list
            </Text>
            <View className="rounded-2xl border border-surface-border bg-surface-card p-4">
              {groceryCount > 0 ? (
                <>
                  <Text className="text-content text-sm">
                    {groceryCount} items across {grocery!.sections.length}{' '}
                    sections.
                  </Text>
                  <TouchableOpacity
                    onPress={handleInstacart}
                    disabled={instacartBusy}
                    activeOpacity={0.85}
                    className="mt-3 flex-row items-center justify-center rounded-xl bg-brand-green py-3"
                  >
                    {instacartBusy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="cart-outline" size={18} color="#FFFFFF" />
                        <Text className="ml-2 text-sm font-bold text-white">
                          Send to Instacart
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <Text className="text-content-muted text-sm">
                  No grocery list yet — generated once {clientName.split(' ')[0]}{' '}
                  builds their plan.
                </Text>
              )}
            </View>

            {/* Weekly plan */}
            <Text className="text-content-muted mb-2 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
              This week's plan
            </Text>
            {plan && plan.days.length > 0 ? (
              plan.days.map((day) => <DayCard key={day.day} day={day} />)
            ) : (
              <View className="rounded-2xl border border-surface-border bg-surface-card p-4">
                <Text className="text-content-muted text-sm">
                  {clientName.split(' ')[0]} hasn't generated a meal plan yet.
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Chip({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View className="mb-2 mr-2 flex-row items-center rounded-full border border-surface-border bg-surface-card px-3 py-1.5">
      <Ionicons name={icon} size={13} color="#5A9A3A" />
      <Text className="text-content ml-1.5 text-xs font-semibold">{text}</Text>
    </View>
  );
}

function DayCard({ day }: { day: DayPlan }) {
  const totalPrep = day.meals.reduce((n, m) => n + (m.prepMinutes || 0), 0);
  return (
    <View className="mb-3 rounded-2xl border border-surface-border bg-surface-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-content text-base font-bold">{day.label}</Text>
        {totalPrep > 0 && (
          <View className="flex-row items-center">
            <Ionicons name="time-outline" size={13} color="#A8A29E" />
            <Text className="text-content-muted ml-1 text-xs">
              {totalPrep} min prep
            </Text>
          </View>
        )}
      </View>

      {day.meals.map((meal, i) => (
        <View
          key={meal.id ?? `${day.day}-${i}`}
          className="mt-3 border-t border-surface-border pt-3"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-content-muted text-[11px] font-semibold uppercase tracking-wide">
              {SLOT_LABEL[meal.slot] ?? meal.slot}
            </Text>
            {meal.prepMinutes > 0 && (
              <Text className="text-content-muted text-[11px]">
                {meal.prepMinutes} min
              </Text>
            )}
          </View>
          <Text className="text-content mt-0.5 text-sm font-semibold">
            {meal.name}
          </Text>
          {!!meal.description && (
            <Text className="text-content-muted mt-0.5 text-xs leading-4">
              {meal.description}
            </Text>
          )}
          {meal.gbombs?.length > 0 && (
            <View className="mt-1.5 flex-row items-center">
              {meal.gbombs.map((c) => (
                <View
                  key={c}
                  className="mr-1 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: GB_COLOR[c] }}
                />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
