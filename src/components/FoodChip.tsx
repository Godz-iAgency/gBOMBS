import { Text, TouchableOpacity } from 'react-native';

/**
 * Selectable food pill with three visual states:
 *  - unselected: dark bg, grey border/text
 *  - selected:   tinted in the category's own food color (border + faint fill +
 *                leading checkmark), so each gBOMBS group looks distinct
 *
 * accentColor is the food group's hex (from GBOMBS_CATEGORIES). Falls back to
 * the brand green if not provided.
 */
export default function FoodChip({
  label,
  selected,
  onPress,
  accentColor = '#3A6B2A',
  mark = '✓',
  strikethrough = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accentColor?: string;
  /** Leading glyph when selected. '✓' for include, '✕' for exclude. */
  mark?: string;
  /** Strike through the label when selected (used for "avoid" chips). */
  strikethrough?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={
        selected
          ? { borderColor: accentColor, backgroundColor: accentColor + '26' } // ~15% alpha
          : undefined
      }
      className={
        selected
          ? 'mb-2 mr-2 flex-row items-center rounded-full border px-3.5 py-2'
          : 'mb-2 mr-2 flex-row items-center rounded-full border border-surface-border bg-surface-card px-3.5 py-2'
      }
    >
      {selected ? (
        <Text className="mr-1 text-sm font-bold" style={{ color: accentColor }}>
          {mark}
        </Text>
      ) : null}
      <Text
        className={selected ? 'text-sm font-semibold' : 'text-sm text-content-muted'}
        style={
          selected
            ? {
                color: accentColor,
                textDecorationLine: strikethrough ? 'line-through' : 'none',
              }
            : undefined
        }
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
