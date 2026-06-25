import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DayPlan, MealSummary, GBombsCategory } from '@/services/gemini';

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
 * One day in a week accordion (shared by the Chef + Trainer dashboards).
 * A tappable header that expands to the day's meals; each meal row is itself
 * tappable to open its full recipe. The parent owns open/selected state so the
 * recipe overlay can render at modal level (full-screen positioning).
 */
export default function DayAccordion({
  day,
  open,
  onToggle,
  onSelectMeal,
}: {
  day: DayPlan;
  open: boolean;
  onToggle: () => void;
  onSelectMeal: (meal: MealSummary) => void;
}) {
  const totalPrep = day.meals.reduce((n, m) => n + (m.prepMinutes || 0), 0);
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-surface-border bg-surface-card">
      {/* Header row */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.8}
        className="flex-row items-center justify-between p-4"
      >
        <Text className="text-content text-base font-bold">{day.label}</Text>
        <View className="flex-row items-center">
          {totalPrep > 0 && (
            <>
              <Ionicons name="time-outline" size={13} color="#A8A29E" />
              <Text className="text-content-muted ml-1 mr-3 text-xs">
                {totalPrep} min prep
              </Text>
            </>
          )}
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#A8A29E"
          />
        </View>
      </TouchableOpacity>

      {/* Expanded meals */}
      {open &&
        day.meals.map((meal, i) => (
          <TouchableOpacity
            key={meal.id ?? `${day.day}-${i}`}
            onPress={() => onSelectMeal(meal)}
            activeOpacity={0.7}
            className="flex-row items-center border-t border-surface-border px-4 py-3"
          >
            <View className="flex-1">
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
            <Ionicons
              name="chevron-forward"
              size={18}
              color="#6B7280"
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        ))}
    </View>
  );
}
