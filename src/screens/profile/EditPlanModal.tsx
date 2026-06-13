import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionCard from '@/components/onboarding/OptionCard';
import type { PlanOption } from '@/utils/profileOptions';

/**
 * Bottom-sheet single-select picker for the simple profile fields (diet mode,
 * health goal, cooking style). Tapping an option saves it via `onSelect` and
 * closes — no separate confirm step. Typed loosely (string keys) so one modal
 * serves all three fields; the parent casts on save.
 */
export default function EditPlanModal({
  visible,
  title,
  subtitle,
  options,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: PlanOption<string>[];
  current: string;
  onSelect: (key: string) => Promise<void>;
  onClose: () => void;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function pick(key: string) {
    if (savingKey) return;
    if (key === current) {
      onClose();
      return;
    }
    setSavingKey(key);
    try {
      await onSelect(key);
      onClose();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        <TouchableOpacity
          className="flex-1"
          activeOpacity={1}
          onPress={onClose}
        />
        <View className="max-h-[82%] rounded-t-3xl bg-surface px-5 pb-8 pt-5">
          {/* Header */}
          <View className="mb-4 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-content text-xl font-extrabold">
                {title}
              </Text>
              {subtitle ? (
                <Text className="text-content-muted mt-1 text-sm">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface-card"
            >
              <Ionicons name="close" size={20} color="#A8A29E" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((o) => (
              <View key={o.key}>
                <OptionCard
                  icon={o.icon}
                  iconColor={o.color}
                  title={o.title}
                  description={o.desc}
                  selected={current === o.key}
                  onPress={() => pick(o.key)}
                />
                {savingKey === o.key ? (
                  <View className="-mt-1 mb-3 flex-row items-center">
                    <ActivityIndicator size="small" color="#5A9A3A" />
                    <Text className="text-content-muted ml-2 text-xs">
                      Saving…
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
