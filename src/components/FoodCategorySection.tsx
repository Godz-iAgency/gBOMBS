import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

/** First letter capitalized — for displaying the food name back to the user. */
function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

type RejectState = { food: string; message: string; suggestion: string };

/**
 * One gBOMBS category block: colored letter badge + name, a wrapping grid of
 * chips (presets + any custom additions), a free-text "add your own" row
 * with inline accept/reject messaging, and a link into the full library.
 */
export default function FoodCategorySection({
  config,
  chips,
  selected,
  dietMode,
  onToggle,
  onAddCustom,
  onOpenLibrary,
}: {
  config: CategoryConfig;
  /** All chips to render for this category (presets first, then customs). */
  chips: string[];
  /** Set of currently-selected chip labels. */
  selected: Set<string>;
  dietMode: string;
  onToggle: (label: string) => void;
  /** Called when a custom food passes checks, or a suggested/library food is added. */
  onAddCustom: (label: string) => void;
  /** Opens the full searchable library for this category. */
  onOpenLibrary: () => void;
}) {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [reject, setReject] = useState<RejectState | null>(null);
  const [accept, setAccept] = useState('');

  function flashNotice(msg: string) {
    setAccept('');
    setReject(null);
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  }

  // No auto-dismiss timeout — this state carries tappable actions (suggestion,
  // see more), so it should stay until the user acts on it or starts typing again.
  function flashReject(food: string, message: string, suggestion = '') {
    setAccept('');
    setNotice('');
    setReject({ food, message, suggestion });
  }

  function quickAdd(label: string) {
    onAddCustom(label);
    setReject(null);
    setAccept(`Added "${label}"`);
    setTimeout(() => setAccept(''), 2500);
  }

  async function handleAdd() {
    const raw = input.trim();
    if (!raw) return;

    const norm = normalizeFood(raw);

    // Already present in this section?
    if (chips.some((c) => normalizeFood(c) === norm)) {
      flashNotice('Already added.');
      setInput('');
      return;
    }

    // Fast local block check — no API cost.
    if (isBlockedFood(raw)) {
      flashReject(raw, REJECTION_MESSAGES[config.key] ?? "Doesn't fit this category.");
      setInput('');
      return;
    }

    // Gemini validation (gracefully accepts if no key configured).
    setChecking(true);
    const result = await validateCustomFood(raw, config.key, dietMode);
    setChecking(false);

    if (!result.valid) {
      flashReject(raw, result.reason || '', result.suggested_alternative || '');
      setInput('');
      return;
    }

    quickAdd(raw);
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
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          {(() => {
            const isLandscape =
              config.key === 'berries' || config.key === 'seeds';
            return (
              <LetterTile
                image={meta.image}
                color={config.color}
                glow={config.chip}
                // Berries/Seeds (landscape) stay larger + cover. The portrait
                // letters shrink 4px and use contain so the whole letter shows.
                size={isLandscape ? 52 : 36}
                resizeMode={isLandscape ? 'cover' : 'contain'}
              />
            );
          })()}
          <Text
            className="ml-3 text-base font-extrabold tracking-wide"
            style={{ color: config.chip }}
          >
            {config.label}
          </Text>
        </View>

        {/* Second entry point into the library — always available, not just
            after a rejection, so people can browse proactively. */}
        <TouchableOpacity onPress={onOpenLibrary} activeOpacity={0.7} hitSlop={8}>
          <Text className="text-xs font-bold underline" style={{ color: config.chip }}>
            See all
          </Text>
        </TouchableOpacity>
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
          onChangeText={(t) => {
            setInput(t);
            if (reject) setReject(null);
          }}
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

      {/* Rejection — names the food, explains why, and offers two ways
          forward instead of a dead end. */}
      {reject ? (
        <View className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3">
          {/* Flat single <Text> — a nested <Text className> renders as a
              <span> on web and crashes NativeWind, so the food name is
              emphasized with quotes + semibold on the whole line instead. */}
          <Text className="text-sm font-semibold leading-5 text-red-300">
            "{capitalize(reject.food)}" isn't part of the gBOMBS{' '}
            {config.label.toLowerCase()} list.
          </Text>
          {reject.message ? (
            <Text className="mt-1 text-xs font-normal text-red-300/80">
              {reject.message}
            </Text>
          ) : null}
          <View className="mt-2.5 flex-row flex-wrap items-center">
            {reject.suggestion ? (
              <TouchableOpacity
                onPress={() => quickAdd(reject.suggestion)}
                activeOpacity={0.85}
                style={{ backgroundColor: config.chip + '26', borderColor: config.chip }}
                className="mb-1 mr-3 flex-row items-center rounded-full border px-3 py-1.5"
              >
                <Ionicons name="add-circle" size={14} color={config.chip} />
                <Text className="ml-1 text-xs font-bold" style={{ color: config.chip }}>
                  Add {reject.suggestion} instead
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onOpenLibrary} activeOpacity={0.7} className="mb-1">
              <Text className="text-xs font-bold underline" style={{ color: config.chip }}>
                See more options
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Inline notice/accept messages */}
      {notice ? (
        <Text className="mt-2 text-xs text-red-400">{notice}</Text>
      ) : null}
      {accept ? (
        <Text className="text-brand-green mt-2 text-xs">{accept}</Text>
      ) : null}
    </View>
  );
}
