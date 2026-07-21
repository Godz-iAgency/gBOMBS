import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import FoodCategorySection from '@/components/FoodCategorySection';
import FoodLibraryModal from '@/components/FoodLibraryModal';
import { GBOMBS_CATEGORIES } from '@/utils/gbombsPresets';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';
import { GBOMBS_LIBRARY } from '@/utils/gbombsLibrary';
import { normalizeFood } from '@/utils/foodValidation';
import {
  loadFavorites,
  syncFavorites,
  type FavoritesState,
} from '@/lib/profile';

/**
 * Full-screen editor for the user's favorite foods, grouped by gBOMBS category.
 * Reuses the same category/chip UI as onboarding; on save it SYNCs the DB to the
 * current selection (adds new picks, removes ones turned off).
 */
export default function EditFavoritesModal({
  visible,
  userId,
  dietMode,
  onClose,
  onSaved,
}: {
  visible: boolean;
  userId: string;
  dietMode: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cats, setCats] = useState<FavoritesState | null>(null);
  const [saving, setSaving] = useState(false);
  const [libraryOpenFor, setLibraryOpenFor] = useState<GBombsCategoryKey | null>(
    null
  );

  useEffect(() => {
    if (!visible) {
      setCats(null);
      return;
    }
    let active = true;
    loadFavorites(userId).then((state) => {
      if (active) setCats(state);
    });
    return () => {
      active = false;
    };
  }, [visible, userId]);

  const selectedCount = useMemo(
    () =>
      cats
        ? Object.values(cats).reduce((sum, c) => sum + c.selected.size, 0)
        : 0,
    [cats]
  );

  function toggle(key: GBombsCategoryKey, label: string) {
    setCats((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const sel = new Set(next[key].selected);
      sel.has(label) ? sel.delete(label) : sel.add(label);
      next[key] = { ...next[key], selected: sel };
      return next;
    });
  }

  function addCustom(key: GBombsCategoryKey, label: string) {
    setCats((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const chips = [...next[key].chips, label];
      const customs = new Set(next[key].customs).add(label);
      const selected = new Set(next[key].selected).add(label); // auto-select
      next[key] = { chips, customs, selected };
      return next;
    });
  }

  function toggleFromLibrary(key: GBombsCategoryKey, label: string) {
    if (!cats) return;
    const alreadyChip = cats[key].chips.some(
      (c) => normalizeFood(c) === normalizeFood(label)
    );
    if (alreadyChip) {
      toggle(key, label);
    } else {
      addCustom(key, label);
    }
  }

  async function handleSave() {
    if (!cats) return;
    setSaving(true);
    try {
      await syncFavorites(userId, cats);
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-surface-border px-5 pb-3 pt-1">
          <TouchableOpacity onPress={onClose} className="py-1 pr-3">
            <Ionicons name="close" size={24} color="#A8A29E" />
          </TouchableOpacity>
          <Text className="text-content text-base font-bold">
            Favorite foods
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !cats}
            className="py-1 pl-3"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#5A9A3A" />
            ) : (
              <Text className="text-brand-green text-base font-bold">Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {!cats ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#5A9A3A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-content-muted mb-4 text-sm">
              Foods you love show up more often in your meal plans.{' '}
              {selectedCount} selected.
            </Text>
            {GBOMBS_CATEGORIES.map((config) => (
              <FoodCategorySection
                key={config.key}
                config={config}
                chips={cats[config.key].chips}
                selected={cats[config.key].selected}
                dietMode={dietMode}
                onToggle={(label) => toggle(config.key, label)}
                onAddCustom={(label) => addCustom(config.key, label)}
                onOpenLibrary={() => setLibraryOpenFor(config.key)}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {cats && libraryOpenFor ? (
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
    </Modal>
  );
}
