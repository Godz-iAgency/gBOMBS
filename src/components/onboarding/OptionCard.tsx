import { View, Text, TouchableOpacity } from 'react-native';

/** Selectable card with an emoji/icon, title, and description. */
export default function OptionCard({
  emoji,
  title,
  description,
  selected,
  onPress,
}: {
  emoji: string;
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={
        selected
          ? 'mb-3 flex-row items-center rounded-2xl border-2 border-brand-green bg-brand-green/10 p-4'
          : 'mb-3 flex-row items-center rounded-2xl border-2 border-surface-border bg-surface-card p-4'
      }
    >
      <Text className="mr-4 text-3xl">{emoji}</Text>
      <View className="flex-1">
        <Text
          className={
            selected
              ? 'text-base font-bold text-brand-green'
              : 'text-base font-bold text-content'
          }
        >
          {title}
        </Text>
        {description ? (
          <Text className="text-content-muted mt-0.5 text-sm">{description}</Text>
        ) : null}
      </View>
      <View
        className={
          selected
            ? 'h-5 w-5 items-center justify-center rounded-full bg-brand-green'
            : 'h-5 w-5 rounded-full border-2 border-surface-border'
        }
      >
        {selected ? (
          <Text className="text-xs font-bold text-surface">✓</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
