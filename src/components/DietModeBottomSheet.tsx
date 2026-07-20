import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native';
import type { DietMode } from '@/types/database.types';

const DIET_META: Record<DietMode, { emoji: string; label: string }> = {
  vegan: { emoji: '🌱', label: 'Vegan' },
  vegetarian: { emoji: '🥚', label: 'Vegetarian' },
};

/**
 * Slide-up sheet shown when the user taps "Save my food preferences". Diet mode
 * was already picked back on step 2 (DietModeScreen), so this defaults to a
 * collapsed "already chosen" summary with a Change link — a re-confirmation
 * safety net (foods picked here can imply a diet, e.g. adding eggs/cheese)
 * without making the user redo a choice they already made.
 */
export default function DietModeBottomSheet({
  visible,
  selectedFoods,
  dietMode,
  saving,
  onChangeDietMode,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  selectedFoods: { label: string; color: string }[];
  dietMode: DietMode;
  saving: boolean;
  onChangeDietMode: (m: DietMode) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [editingDiet, setEditingDiet] = useState(false);

  // Fresh collapsed state each time the sheet opens.
  useEffect(() => {
    if (visible) setEditingDiet(false);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Dim backdrop; tap to dismiss */}
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        {/* Stop propagation so taps inside the sheet don't close it */}
        <Pressable
          className="rounded-t-3xl border-t border-surface-border bg-surface px-6 pb-8 pt-3"
          onPress={() => {}}
        >
          {/* Drag handle */}
          <View className="mb-4 items-center">
            <View className="h-1.5 w-12 rounded-full bg-surface-border" />
          </View>

          <Text className="text-content text-xl font-bold">Almost done</Text>
          <Text className="text-content-muted mt-1 text-sm">
            Your selected foods:
          </Text>

          {/* Selected food summary */}
          <ScrollView
            className="mt-3 max-h-24"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row flex-wrap">
              {selectedFoods.map((f) => (
                <View
                  key={f.label}
                  style={{
                    borderColor: f.color,
                    backgroundColor: f.color + '26', // ~15% alpha, matches step 5
                  }}
                  className="mb-2 mr-2 flex-row items-center rounded-full border px-3 py-1"
                >
                  <Text
                    className="mr-1 text-xs font-bold"
                    style={{ color: f.color }}
                  >
                    ✓
                  </Text>
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: f.color }}
                  >
                    {f.label}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {editingDiet ? (
            <>
              <Text className="text-content mt-4 text-base font-semibold">
                Choose your diet mode:
              </Text>
              <View className="mt-3 flex-row gap-3">
                <DietButton
                  emoji="🌱"
                  label="Vegan"
                  active={dietMode === 'vegan'}
                  onPress={() => {
                    onChangeDietMode('vegan');
                    setEditingDiet(false);
                  }}
                />
                <DietButton
                  emoji="🥚"
                  label="Vegetarian"
                  active={dietMode === 'vegetarian'}
                  onPress={() => {
                    onChangeDietMode('vegetarian');
                    setEditingDiet(false);
                  }}
                />
              </View>
            </>
          ) : (
            <View className="mt-4 flex-row items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3">
              <Text className="text-content text-base font-semibold">
                {DIET_META[dietMode].emoji} {DIET_META[dietMode].label}
              </Text>
              <TouchableOpacity onPress={() => setEditingDiet(true)} hitSlop={8}>
                <Text className="text-sm font-bold" style={{ color: '#5A9A3A' }}>
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Vegetarian notice */}
          {dietMode === 'vegetarian' ? (
            <View className="mt-3 rounded-xl border border-[rgba(250,191,23,0.3)] bg-[rgba(250,191,23,0.1)] p-3">
              <Text className="text-[#FCD34D] text-sm">
                Vegetarian mode: Eggs and cheese will be included in your recipes
                and grocery list where appropriate.
              </Text>
            </View>
          ) : null}

          {/* Confirm */}
          <TouchableOpacity
            onPress={onConfirm}
            disabled={saving}
            activeOpacity={0.85}
            className="mt-5 rounded-xl bg-brand-green py-4"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-center text-base font-bold text-white">
                Confirm & continue →
              </Text>
            )}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DietButton({
  emoji,
  label,
  active,
  onPress,
}: {
  emoji: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={
        active
          ? 'flex-1 flex-row items-center justify-center rounded-xl border-2 border-brand-green bg-brand-green/10 py-3'
          : 'flex-1 flex-row items-center justify-center rounded-xl border-2 border-surface-border bg-surface-card py-3'
      }
    >
      <Text className="mr-2 text-lg">{emoji}</Text>
      <Text
        className={
          active
            ? 'text-base font-bold text-brand-green'
            : 'text-base font-semibold text-content'
        }
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
