import { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FoodChip from './FoodChip';
import { normalizeFood } from '@/utils/foodValidation';

/**
 * "See more options" — the full curated gBOMBS library for one category
 * (GBOMBS_LIBRARY), searchable, tap-to-toggle. No validation needed here:
 * every item already comes from our own vetted list, so tapping adds it
 * straight to the selection, same as tapping a preset chip on the main screen.
 */
export default function FoodLibraryModal({
  visible,
  categoryLabel,
  accentColor,
  items,
  selected,
  onToggle,
  onClose,
}: {
  visible: boolean;
  categoryLabel: string;
  accentColor: string;
  items: string[];
  selected: Set<string>;
  onToggle: (label: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalizeFood(query);
    if (!q) return items;
    return items.filter((item) => normalizeFood(item).includes(q));
  }, [items, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <View className="max-h-[80%] rounded-t-3xl bg-surface px-5 pb-8 pt-5">
          <View className="mb-4 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-content text-xl font-extrabold">
                {categoryLabel} options
              </Text>
              <Text className="text-content-muted mt-1 text-sm">
                Tap to add or remove — all of these fit gBOMBS.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface-card"
            >
              <Ionicons name="close" size={20} color="#A8A29E" />
            </TouchableOpacity>
          </View>

          <View className="mb-4 flex-row items-center rounded-xl border border-surface-border bg-surface-card px-3.5 py-2.5">
            <Ionicons name="search" size={16} color="#6B7280" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${categoryLabel.toLowerCase()}…`}
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              // See FoodCategorySection — without this the input can't shrink
              // below its intrinsic width and overflows the search box on
              // narrow phone screens.
              style={{ minWidth: 0 }}
              className="text-content ml-2 flex-1 text-sm"
            />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap pb-2">
              {filtered.map((item) => (
                <FoodChip
                  key={item}
                  label={item}
                  selected={selected.has(item)}
                  onPress={() => onToggle(item)}
                  accentColor={accentColor}
                />
              ))}
              {filtered.length === 0 ? (
                <Text className="text-content-muted text-sm">
                  No matches — try a different search.
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
