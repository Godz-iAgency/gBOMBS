import { useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import FoodCategorySection from '@/components/FoodCategorySection';
import FoodLibraryModal from '@/components/FoodLibraryModal';
import DietModeBottomSheet from '@/components/DietModeBottomSheet';
import { GBOMBS_PRESETS, GBOMBS_CATEGORIES } from '@/utils/gbombsPresets';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';
import { GBOMBS_LIBRARY } from '@/utils/gbombsLibrary';
import { normalizeFood } from '@/utils/foodValidation';
import { useOnboarding } from '@/store/onboardingStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Database, DietMode } from '@/types/database.types';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'FoodPreference'>;

type CategoryState = {
  // Full chip list = presets + customs (preserves order).
  chips: string[];
  customs: Set<string>; // which chips are user-added
  selected: Set<string>;
};

// category key -> on-dark "chip" color, so the summary sheet can color-code
// each selected food to match its gBOMBS group (same look as step 5).
const CATEGORY_CHIP_COLOR = GBOMBS_CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c.chip;
    return acc;
  },
  {} as Record<GBombsCategoryKey, string>
);

function initialState(): Record<GBombsCategoryKey, CategoryState> {
  const out = {} as Record<GBombsCategoryKey, CategoryState>;
  (Object.keys(GBOMBS_PRESETS) as GBombsCategoryKey[]).forEach((key) => {
    out[key] = {
      chips: [...GBOMBS_PRESETS[key]],
      customs: new Set(),
      selected: new Set(),
    };
  });
  return out;
}

export default function FoodPreferenceScreen({ navigation }: Props) {
  const { dietMode, setDietMode } = useOnboarding();
  const { user } = useAuth();

  const [cats, setCats] =
    useState<Record<GBombsCategoryKey, CategoryState>>(initialState);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [libraryOpenFor, setLibraryOpenFor] = useState<GBombsCategoryKey | null>(
    null
  );

  const selectedCount = useMemo(
    () =>
      Object.values(cats).reduce((sum, c) => sum + c.selected.size, 0),
    [cats]
  );

  const allSelectedFoods = useMemo(() => {
    const list: { label: string; color: string }[] = [];
    (Object.keys(cats) as GBombsCategoryKey[]).forEach((key) => {
      cats[key].selected.forEach((f) =>
        list.push({ label: f, color: CATEGORY_CHIP_COLOR[key] })
      );
    });
    return list;
  }, [cats]);

  function toggle(key: GBombsCategoryKey, label: string) {
    setCats((prev) => {
      const next = { ...prev };
      const sel = new Set(next[key].selected);
      sel.has(label) ? sel.delete(label) : sel.add(label);
      next[key] = { ...next[key], selected: sel };
      return next;
    });
  }

  function addCustom(key: GBombsCategoryKey, label: string) {
    setCats((prev) => {
      const next = { ...prev };
      const chips = [...next[key].chips, label];
      const customs = new Set(next[key].customs).add(label);
      const selected = new Set(next[key].selected).add(label); // auto-select
      next[key] = { chips, customs, selected };
      return next;
    });
  }

  // Library items are pre-vetted (GBOMBS_LIBRARY), so no validation round-trip
  // — just add-and-select if new, or toggle if it's already a chip (e.g. one
  // of the starter presets that also appears in the fuller library list).
  function toggleFromLibrary(key: GBombsCategoryKey, label: string) {
    const alreadyChip = cats[key].chips.some(
      (c) => normalizeFood(c) === normalizeFood(label)
    );
    if (alreadyChip) {
      toggle(key, label);
    } else {
      addCustom(key, label);
    }
  }

  async function handleConfirm() {
    if (!user) return;
    setSaving(true);

    // Build rows for every selected food across all categories.
    type Row = Database['public']['Tables']['food_preferences']['Insert'];
    const rows: Row[] = [];
    (Object.keys(cats) as GBombsCategoryKey[]).forEach((key) => {
      cats[key].selected.forEach((food) => {
        const isCustom = cats[key].customs.has(food);
        rows.push({
          user_id: user.id,
          category: key,
          food_item: food,
          food_item_normalized: normalizeFood(food),
          source: isCustom ? 'custom' : 'preset',
          is_validated: true,
          is_excluded: false,
          is_active: true,
        });
      });
    });

    // Save food prefs (upsert by the unique key so re-saving is safe).
    const { error: prefErr } = await supabase
      .from('food_preferences')
      .upsert(rows, { onConflict: 'user_id,food_item_normalized,category' });

    if (prefErr) {
      setSaving(false);
      Alert.alert('Could not save foods', prefErr.message);
      return;
    }

    // Save diet mode on the user profile.
    const { error: userErr } = await supabase
      .from('users')
      .update({ diet_mode: dietMode })
      .eq('id', user.id);

    if (userErr) {
      setSaving(false);
      Alert.alert('Could not save diet mode', userErr.message);
      return;
    }

    // Log the diet mode choice to history (best-effort).
    await supabase.from('food_preference_history').insert({
      user_id: user.id,
      action: 'diet_mode_changed',
      new_diet_mode: dietMode,
    });

    setSaving(false);
    setSheetOpen(false);
    navigation.navigate('Allergies');
  }

  return (
    <>
      <OnboardingScaffold
        step={5}
        title="Your whole foods"
        subtitle="Select foods you love — or add your own"
        buttonLabel={
          selectedCount > 0
            ? 'Save my food preferences'
            : 'Select at least one food'
        }
        buttonDisabled={selectedCount === 0}
        onPressButton={() => setSheetOpen(true)}
        onBack={() => navigation.goBack()}
        footer={
          <Text className="text-content-muted mb-3 text-center text-sm">
            {selectedCount} food{selectedCount === 1 ? '' : 's'} selected
          </Text>
        }
        stickyHeader={
          // Pinned above the scrollable category list — explains WHY a
          // typed-in food sometimes gets rejected, before anyone hits that
          // surprise, and stays visible the whole time (not just at the top).
          <View className="mb-3 flex-row items-center rounded-xl border border-brand-greenBright/40 bg-brand-greenBright/10 px-3.5 py-2.5">
            <Ionicons name="information-circle" size={16} color="#5A9A3A" />
            <Text className="text-content ml-2 flex-1 text-xs leading-4">
              Only whole, unprocessed foods count toward each gBOMBS group.
            </Text>
          </View>
        }
      >
        {GBOMBS_CATEGORIES.map((config) => (
          <FoodCategorySection
            key={`${config.key}-${config.label}`}
            config={config}
            chips={cats[config.key].chips}
            selected={cats[config.key].selected}
            dietMode={dietMode}
            onToggle={(label) => toggle(config.key, label)}
            onAddCustom={(label) => addCustom(config.key, label)}
            onOpenLibrary={() => setLibraryOpenFor(config.key)}
          />
        ))}

        <View className="h-2" />
      </OnboardingScaffold>

      <DietModeBottomSheet
        visible={sheetOpen}
        selectedFoods={allSelectedFoods}
        dietMode={dietMode}
        saving={saving}
        onChangeDietMode={(m: DietMode) => setDietMode(m)}
        onConfirm={handleConfirm}
        onClose={() => setSheetOpen(false)}
      />

      {libraryOpenFor ? (
        <FoodLibraryModal
          visible={!!libraryOpenFor}
          categoryLabel={
            GBOMBS_CATEGORIES.find((c) => c.key === libraryOpenFor)?.label ?? ''
          }
          accentColor={
            GBOMBS_CATEGORIES.find((c) => c.key === libraryOpenFor)?.chip ??
            '#6FBF4A'
          }
          items={GBOMBS_LIBRARY[libraryOpenFor]}
          selected={cats[libraryOpenFor].selected}
          onToggle={(label) => toggleFromLibrary(libraryOpenFor, label)}
          onClose={() => setLibraryOpenFor(null)}
        />
      ) : null}
    </>
  );
}
