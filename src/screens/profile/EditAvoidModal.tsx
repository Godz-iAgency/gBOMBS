import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import FoodChip from '@/components/FoodChip';
import { normalizeFood } from '@/utils/foodValidation';
import { loadExclusions, syncExclusions } from '@/lib/profile';

/**
 * Full-screen editor for foods to avoid (allergies / dislikes). Reuses the
 * allergen quick-pick chips from onboarding; on save it SYNCs the DB to the
 * current selection. These foods never appear in meal plans or coach tips.
 */
export default function EditAvoidModal({
  visible,
  userId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [chips, setChips] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setChips(null);
      setSelected(new Set());
      setInput('');
      return;
    }
    let active = true;
    loadExclusions(userId).then((state) => {
      if (!active) return;
      setChips(state.chips);
      setSelected(state.selected);
    });
    return () => {
      active = false;
    };
  }, [visible, userId]);

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function addCustom() {
    const raw = input.trim();
    if (!raw || !chips) return;
    const norm = normalizeFood(raw);
    const existing = chips.find((c) => normalizeFood(c) === norm);
    if (existing) {
      setSelected((prev) => new Set(prev).add(existing));
    } else {
      setChips((prev) => [...(prev ?? []), raw]);
      setSelected((prev) => new Set(prev).add(raw));
    }
    setInput('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await syncExclusions(userId, selected);
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
          <Text className="text-content text-base font-bold">Foods to avoid</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !chips}
            className="py-1 pl-3"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#5A9A3A" />
            ) : (
              <Text className="text-brand-green text-base font-bold">Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {!chips ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#5A9A3A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-content-muted mb-4 text-sm">
              Tap any that apply. These will never appear in your meals.
            </Text>

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
            <View className="mt-4 flex-row items-center">
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
                <Text className="text-brand-green text-sm font-bold">+ Add</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
