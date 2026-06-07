import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import FoodChip from '@/components/FoodChip';
import { normalizeFood } from '@/utils/foodValidation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Allergies'>;

/** Most common food allergens / intolerances, shown as quick-select chips. */
const COMMON_ALLERGENS = [
  'Peanuts',
  'Tree nuts',
  'Walnuts',
  'Almonds',
  'Cashews',
  'Soy',
  'Gluten',
  'Wheat',
  'Sesame',
  'Eggs',
  'Dairy',
  'Coconut',
  'Nightshades',
  'Corn',
];

export default function AllergiesScreen({ navigation }: Props) {
  const { user, refreshProfile } = useAuth();

  const [chips, setChips] = useState<string[]>([...COMMON_ALLERGENS]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedCount = selected.size;

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function addCustom() {
    const raw = input.trim();
    if (!raw) return;
    const norm = normalizeFood(raw);
    // Dedup against existing chips.
    if (chips.some((c) => normalizeFood(c) === norm)) {
      // Already there — just make sure it's selected.
      setSelected((prev) => new Set(prev).add(
        chips.find((c) => normalizeFood(c) === norm) as string
      ));
      setInput('');
      return;
    }
    setChips((prev) => [...prev, raw]);
    setSelected((prev) => new Set(prev).add(raw));
    setInput('');
  }

  /** Mark onboarding complete + refresh so AppNavigator routes into the app. */
  async function completeOnboarding(): Promise<boolean> {
    if (!user) return false;
    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', user.id);
    if (error) {
      Alert.alert('Could not finish', error.message);
      return false;
    }
    await refreshProfile();
    return true;
  }

  async function persistAndContinue() {
    if (!user) return;
    setSaving(true);

    if (selected.size > 0) {
      type Row = Database['public']['Tables']['food_preferences']['Insert'];
      const rows: Row[] = Array.from(selected).map((food) => ({
        user_id: user.id,
        // Exclusions aren't tied to a gBOMBS category; bucket under 'other_vegetables'.
        category: 'other_vegetables',
        food_item: food,
        food_item_normalized: normalizeFood(food),
        source: 'custom',
        is_validated: true,
        is_excluded: true,
        is_active: true,
      }));

      const { error } = await supabase
        .from('food_preferences')
        .upsert(rows, { onConflict: 'user_id,food_item_normalized,category' });

      if (error) {
        setSaving(false);
        Alert.alert('Could not save', error.message);
        return;
      }
    }

    const ok = await completeOnboarding();
    if (!ok) setSaving(false);
    // On success, AppNavigator swaps to MainStack — no further nav needed.
  }

  async function handleSkip() {
    if (saving) return;
    setSaving(true);
    const ok = await completeOnboarding();
    if (!ok) setSaving(false);
  }

  return (
    <OnboardingScaffold
      step={6}
      title="Anything to avoid?"
      subtitle="Allergies, intolerances, or foods you just hate"
      buttonLabel={
        selectedCount > 0
          ? `Finish setup · ${selectedCount} excluded`
          : 'Finish setup'
      }
      buttonLoading={saving}
      onPressButton={persistAndContinue}
      onBack={() => navigation.goBack()}
      footer={
        <TouchableOpacity
          onPress={handleSkip}
          disabled={saving}
          className="mb-3 self-center"
        >
          <Text className="text-content-muted text-sm underline">
            Skip — no exclusions
          </Text>
        </TouchableOpacity>
      }
    >
      <Text className="text-content-muted mb-3 mt-2 text-sm">
        Tap any that apply. These will never appear in your meals.
      </Text>

      {/* Allergen chips */}
      <View className="flex-row flex-wrap">
        {chips.map((label) => (
          <FoodChip
            key={label}
            label={label}
            selected={selected.has(label)}
            onPress={() => toggle(label)}
            accentColor="#EF4444"
            mark="✕"
            strikethrough
          />
        ))}
      </View>

      {/* Add-your-own row */}
      <View className="mt-3 flex-row items-center">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Add another allergy or food to avoid…"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={addCustom}
          className="mr-2 flex-1 rounded-xl border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-content"
        />
        <TouchableOpacity
          onPress={addCustom}
          activeOpacity={0.85}
          className="rounded-xl border border-brand-green px-4 py-2.5"
        >
          <Text className="text-sm font-bold text-brand-green">+ Add</Text>
        </TouchableOpacity>
      </View>

      <View className="h-2" />
    </OnboardingScaffold>
  );
}
