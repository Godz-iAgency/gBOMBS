import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import FoodChip from './FoodChip';
import LetterTile from './LetterTile';
import {
  isBlockedFood,
  REJECTION_MESSAGES,
  normalizeFood,
} from '@/utils/foodValidation';
import { validateCustomFood } from '@/services/gemini';
import { LETTER_BY_KEY } from '@/utils/gbombsImages';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';

export type CategoryConfig = {
  key: GBombsCategoryKey;
  letter: string;
  label: string;
  color: string;
  /** Brighter on-dark variant for selected chips/Add button (readable on black). */
  chip: string;
  addPlaceholder: string;
};

/**
 * One gBOMBS category block: colored letter badge + name, a wrapping grid of
 * chips (presets + any custom additions), and a free-text "add your own" row
 * with inline accept/reject messaging.
 */
export default function FoodCategorySection({
  config,
  chips,
  selected,
  dietMode,
  onToggle,
  onAddCustom,
}: {
  config: CategoryConfig;
  /** All chips to render for this category (presets first, then customs). */
  chips: string[];
  /** Set of currently-selected chip labels. */
  selected: Set<string>;
  dietMode: string;
  onToggle: (label: string) => void;
  /** Called when a custom food passes checks. Parent adds + selects it. */
  onAddCustom: (label: string) => void;
}) {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [reject, setReject] = useState('');
  const [accept, setAccept] = useState('');

  function flashReject(msg: string) {
    setAccept('');
    setReject(msg);
    setTimeout(() => setReject(''), 3000);
  }

  async function handleAdd() {
    const raw = input.trim();
    if (!raw) return;

    const norm = normalizeFood(raw);

    // Already present in this section?
    if (chips.some((c) => normalizeFood(c) === norm)) {
      flashReject('Already added.');
      setInput('');
      return;
    }

    // Fast local block check — no API cost.
    if (isBlockedFood(raw)) {
      flashReject(REJECTION_MESSAGES[config.key] ?? "That doesn't fit gBOMBS.");
      setInput('');
      return;
    }

    // Gemini validation (gracefully accepts if no key configured).
    setChecking(true);
    const result = await validateCustomFood(raw, config.key, dietMode);
    setChecking(false);

    if (!result.valid) {
      const tip = result.suggested_alternative
        ? ` ${result.suggested_alternative}`
        : '';
      flashReject((result.reason || "That doesn't fit gBOMBS.") + tip);
      setInput('');
      return;
    }

    onAddCustom(raw);
    setReject('');
    setAccept(`Added "${raw}"`);
    setTimeout(() => setAccept(''), 2500);
    setInput('');
  }

  const meta = LETTER_BY_KEY[config.key];

  return (
    <View
      className="mb-5 rounded-2xl border p-4"
      style={{
        borderColor: config.chip + '40',
        backgroundColor: config.color + '14', // ~8% tint of the food color
      }}
    >
      {/* Header */}
      <View className="mb-3 flex-row items-center">
        <LetterTile
          image={meta.image}
          color={config.color}
          glow={config.chip}
          size={44}
        />
        <Text
          className="ml-3 text-base font-extrabold tracking-wide"
          style={{ color: config.chip }}
        >
          {config.label}
        </Text>
      </View>

      {/* Chips */}
      <View className="flex-row flex-wrap">
        {chips.map((label) => (
          <FoodChip
            key={label}
            label={label}
            selected={selected.has(label)}
            onPress={() => onToggle(label)}
            accentColor={config.chip}
          />
        ))}
      </View>

      {/* Add-your-own row */}
      <View className="mt-1 flex-row items-center">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={config.addPlaceholder}
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          className="mr-2 flex-1 rounded-xl border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-content"
        />
        <TouchableOpacity
          onPress={handleAdd}
          disabled={checking}
          activeOpacity={0.85}
          style={{ borderColor: config.chip }}
          className="rounded-xl border px-4 py-2.5"
        >
          {checking ? (
            <ActivityIndicator size="small" color={config.chip} />
          ) : (
            <Text className="text-sm font-bold" style={{ color: config.chip }}>
              + Add
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Inline messages */}
      {reject ? (
        <Text className="mt-2 text-xs text-red-400">{reject}</Text>
      ) : null}
      {accept ? (
        <Text className="text-brand-green mt-2 text-xs">{accept}</Text>
      ) : null}
    </View>
  );
}
