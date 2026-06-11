import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  scoreCheckIn,
  type CheckInResult,
  type GBombsCategory,
} from '@/services/gemini';
import { buildUserMealContext } from '@/lib/mealContext';
import { loadTodayCheckIn, saveCheckIn } from '@/lib/dailyCheckIn';
import { GBOMBS_LETTERS } from '@/utils/gbombsImages';

// Manual safe-area top pad — avoids react-native-safe-area-context on web.
const TOP_PAD = Platform.OS === 'web' ? 48 : 44;

const PLACEHOLDER =
  'e.g. Oatmeal with blueberries and walnuts, a big kale & chickpea salad with red onion, mushroom-lentil stir-fry with garlic…';

/** All six gBOMBS letters, lit when that category was hit today. */
function ScoreBadges({ hit }: { hit: GBombsCategory[] }) {
  return (
    <View style={styles.badgeRow}>
      {GBOMBS_LETTERS.map((meta) => {
        const isHit = hit.includes(meta.key as GBombsCategory);
        return (
          <View
            key={meta.key}
            style={[
              styles.badge,
              {
                backgroundColor: isHit ? meta.glow : 'transparent',
                borderColor: isHit ? meta.glow : '#2D2D2D',
              },
            ]}
          >
            <Text
              style={[styles.badgeText, { color: isHit ? '#000' : '#A8A29E' }]}
            >
              {meta.letter}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function CheckInScreen({
  visible,
  userId,
  tier,
  onClose,
}: {
  visible: boolean;
  userId: string;
  tier: string;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On open: restore today's check-in if one was already logged.
  useEffect(() => {
    if (!visible || !userId) return;
    let active = true;
    (async () => {
      const cached = await loadTodayCheckIn(userId);
      if (!active || !cached) return;
      setResult(cached);
      setText(cached.mealsText);
    })();
    return () => {
      active = false;
    };
  }, [visible, userId]);

  const score = useCallback(async () => {
    if (!userId || !text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = await buildUserMealContext(userId);
      const next = await scoreCheckIn(text, ctx, tier);
      setResult(next);
      await saveCheckIn(userId, next);
    } catch (e) {
      setError(
        (e as Error).message || 'Could not score your day. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [userId, text, tier]);

  // Re-edit: drop back to the input, keeping what they typed.
  const logAgain = () => {
    setResult(null);
    setError(null);
  };

  if (!visible) return null;

  const canSubmit = text.trim().length > 0 && !loading;

  return (
    <View style={styles.overlay}>
      <View style={{ height: TOP_PAD, backgroundColor: '#0A0A0A' }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color="#F5F5F0" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Check-in</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#5A9A3A" />
              <Text style={styles.loadingText}>Scoring your day…</Text>
              <Text style={styles.loadingSub}>
                Checking which gBOMBS you hit.
              </Text>
            </View>
          ) : result ? (
            // ---- Result ----
            <>
              <Text style={styles.scoreLabel}>TODAY'S gBOMBS</Text>
              <ScoreBadges hit={result.categoriesHit} />
              <Text style={styles.scoreBig}>
                {result.score}/6 {result.score === 6 ? '🔥' : ''}
              </Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>How you did</Text>
                <Text style={styles.cardBody}>{result.feedback}</Text>
              </View>

              {result.missedTip ? (
                <View style={[styles.card, styles.tipCard]}>
                  <Text style={styles.cardTitle}>Tomorrow's tip</Text>
                  <Text style={styles.cardBody}>{result.missedTip}</Text>
                </View>
              ) : null}

              <TouchableOpacity onPress={logAgain} style={styles.secondaryBtn}>
                <Ionicons name="create-outline" size={18} color="#5A9A3A" />
                <Text style={styles.secondaryBtnText}>Edit today's log</Text>
              </TouchableOpacity>
            </>
          ) : (
            // ---- Input ----
            <>
              <Text style={styles.prompt}>What did you eat today?</Text>
              <Text style={styles.promptSub}>
                List your meals and I'll score your gBOMBS coverage.
              </Text>

              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={PLACEHOLDER}
                placeholderTextColor="#6B6B6B"
                multiline
                textAlignVertical="top"
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                onPress={score}
                disabled={!canSubmit}
                style={[styles.primaryBtn, !canSubmit && styles.primaryBtnOff]}
              >
                <Text style={styles.primaryBtnText}>Score My Day</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0A0A',
    zIndex: 50,
    elevation: 50,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#F5F5F0',
    fontSize: 18,
    fontWeight: 'bold',
  },
  iconBtn: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#161616',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  loadingText: {
    color: '#F5F5F0',
    marginTop: 16,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingSub: {
    color: '#A8A29E',
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  // Input
  prompt: {
    color: '#F5F5F0',
    fontSize: 22,
    fontWeight: 'bold',
  },
  promptSub: {
    color: '#A8A29E',
    marginTop: 6,
    fontSize: 14,
  },
  input: {
    marginTop: 16,
    minHeight: 140,
    borderRadius: 16,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 14,
    color: '#F5F5F0',
    fontSize: 15,
    lineHeight: 22,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#f87171',
  },
  primaryBtn: {
    marginTop: 20,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#5A9A3A',
    paddingVertical: 16,
  },
  primaryBtnOff: { opacity: 0.4 },
  primaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Result
  scoreLabel: {
    color: '#A8A29E',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  badge: {
    marginHorizontal: 4,
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  scoreBig: {
    color: '#F5F5F0',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 14,
  },
  card: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: '#161616',
    padding: 16,
  },
  tipCard: {
    backgroundColor: '#1F1B14',
  },
  cardTitle: {
    color: '#5A9A3A',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardBody: {
    color: '#F5F5F0',
    fontSize: 15,
    lineHeight: 22,
  },
  secondaryBtn: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#161616',
    paddingVertical: 14,
  },
  secondaryBtnText: {
    color: '#5A9A3A',
    marginLeft: 8,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
