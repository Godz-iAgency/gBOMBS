import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Selectable card with a professional Ionicon in a colored rounded tile, a
 * title, a description, and a check indicator. The icon tile glows in its
 * accent color when selected.
 */
export default function OptionCard({
  icon,
  iconColor,
  title,
  description,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={selected ? { borderColor: iconColor } : undefined}
      className={
        selected
          ? 'mb-3 flex-row items-center rounded-2xl border-2 bg-surface-card p-4'
          : 'mb-3 flex-row items-center rounded-2xl border-2 border-surface-border bg-surface-card p-4'
      }
    >
      {/* Icon tile */}
      <View
        className="mr-4 h-12 w-12 items-center justify-center rounded-xl"
        style={{
          backgroundColor: iconColor + '24',
          borderWidth: 1,
          borderColor: iconColor + '59',
        }}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>

      <View className="flex-1">
        <Text
          className={selected ? 'text-base font-bold' : 'text-base font-bold text-content'}
          style={selected ? { color: iconColor } : undefined}
        >
          {title}
        </Text>
        {description ? (
          <Text className="text-content-muted mt-0.5 text-sm">{description}</Text>
        ) : null}
      </View>

      {/* Check indicator */}
      <View
        className="h-6 w-6 items-center justify-center rounded-full"
        style={
          selected
            ? { backgroundColor: iconColor }
            : { borderWidth: 2, borderColor: '#2D2D2D' }
        }
      >
        {selected ? (
          <Ionicons name="checkmark" size={15} color="#FFFFFF" />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
