import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  generateRecipe,
  type Recipe,
  type MealSummary,
  type GBombsCategory,
  type UserMealContext,
} from '@/services/gemini';
import { buildUserMealContext } from '@/lib/mealContext';
import { loadCachedRecipe, saveCachedRecipe } from '@/lib/recipeCache';
import { addChefNote, loadMealNote } from '@/lib/professional';
import { notify } from '@/utils/dialog';
import { PlantIcon, PLANT_LABELS } from '@/components/PlantGroups';
import { GBOMBS_LETTERS, LETTER_BY_KEY } from '@/utils/gbombsImages';

/** Chef-note context for a recipe. The chef (editable) attaches a note to a
 *  meal; the client sees it read-only on their own copy of that recipe. */
export interface RecipeNoteContext {
  /** Whose meal this is — the recipe-cache + note owner. */
  clientId: string;
  /** true = chef can write the note; false = client sees it read-only. */
  editable: boolean;
}

/** Rotating, kitchen-themed status lines for the recipe loading screen. */
const LOADING_MESSAGES = [
  'Reading the recipe…',
  'Gathering fresh ingredients…',
  'Prepping the kitchen…',
  'Seasoning to taste…',
  'Plating it up…',
  'Almost ready…',
];

/**
 * Recipe loading state — an engaging, timed animation instead of a bare
 * spinner. A pulsing chef icon, rotating status lines, and a progress bar that
 * eases toward (but never reaches) full give a felt sense of "this is working
 * and nearly done" — far less alarming than a spinner that reads as "stuck".
 * Web-safe: react-native Animated runs on react-native-web; width animates with
 * useNativeDriver:false, the icon pulse (transform) with true.
 */
function RecipeLoading() {
  const [msgIndex, setMsgIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Ease toward 95% over ~11s. The recipe usually lands in 3–8s and unmounts
    // this; the long, decelerating tail means the bar never visibly stalls.
    Animated.timing(progress, {
      toValue: 1,
      duration: 11000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Gentle breathing pulse on the icon. useNativeDriver:false so it animates
    // cleanly on react-native-web too (true logs an unsupported-driver warning).
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();

    const id = setInterval(() => {
      setMsgIndex((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1));
    }, 2000);
    return () => clearInterval(id);
  }, [progress, pulse]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['8%', '95%'],
  });
  const iconScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  return (
    <View style={styles.centered}>
      <Animated.View
        style={[styles.loadingIconWrap, { transform: [{ scale: iconScale }] }]}
      >
        <Ionicons name="restaurant" size={34} color="#5A9A3A" />
      </Animated.View>
      <Text style={styles.loadingText}>{LOADING_MESSAGES[msgIndex]}</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: barWidth }]} />
      </View>
      <Text style={styles.loadingSub}>
        Crafting a fresh plant-based recipe
      </Text>
    </View>
  );
}

// Safe area top padding — avoids react-native-safe-area-context on web
// (its inset style arrays can trigger a CSSStyleDeclaration indexed-property
// error in react-native-web 0.21 + React 19). 48 was sized for a desktop
// browser's own chrome on top of the page; on an actual mobile browser
// there's no native notch to clear (the browser chrome is already outside the
// page viewport), so that much space just reads as unexplained dead air above
// the close button — confirmed against LoginScreen's real SafeAreaView, which
// shows no such gap on the same device.
const TOP_PAD = Platform.OS === 'web' ? 12 : 44;

/** All six plant groups, with included groups highlighted and labelled. */
function ScoreRow({ hit, score }: { hit: GBombsCategory[]; score: number }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  return (
    <View style={styles.plantCard}>
      <View style={styles.plantHeader}>
        <Text style={styles.plantTitle}>Plant groups</Text>
        <Text style={styles.plantCount}>{score} of 6</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: compact ? 'wrap' : 'nowrap', rowGap: 12, marginTop: 12 }}>
        {GBOMBS_LETTERS.map((meta) => {
          const isHit = hit.includes(meta.key as GBombsCategory);
          return (
            <View
              key={meta.key}
              accessibilityLabel={`${PLANT_LABELS[meta.key]}: ${isHit ? 'included' : 'not included'}`}
              style={{ flex: compact ? undefined : 1, width: compact ? '33.333%' : undefined,
                minWidth: 0, alignItems: 'center' }}
            >
              <View style={[styles.plantSymbol, {
                backgroundColor: isHit ? meta.glow + '20' : '#FFFFFF04',
                borderColor: isHit ? meta.glow + '99' : '#343A30',
              }]}>
                <PlantIcon category={meta.key} size={26} color={isHit ? meta.glow : '#747A6F'} />
              </View>
              <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}
                style={[styles.plantLabel, { fontSize: compact || width >= 600 ? 11 : 9,
                  color: isHit ? '#F5F5F0' : '#959D8F' }]}>
                {PLANT_LABELS[meta.key]}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.plantHint}>Highlighted groups are included in this recipe.</Text>
    </View>
  );
}

/** Small category badge next to an ingredient. */
function IngredientBadge({ cat }: { cat: GBombsCategory }) {
  const meta = LETTER_BY_KEY[cat];
  if (!meta) return null;
  return (
    <View
      style={{
        marginLeft: 8,
        height: 20,
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: meta.glow,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#000' }}>
        {meta.letter}
      </Text>
    </View>
  );
}

/** Catches render crashes so they show as a readable message, not a white screen. */
class RecipeErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Recipe render crashed:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 24, backgroundColor: '#0A0A0A' }}>
          <Text style={{ color: '#f87171', fontWeight: 'bold', marginBottom: 8 }}>
            Recipe render error (diagnostic)
          </Text>
          <Text style={{ color: '#F5F5F0', fontSize: 12 }}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RecipeModal({
  meal,
  userId,
  tier,
  onClose,
  buildContext,
  note,
}: {
  meal: MealSummary | null;
  /** Owns the recipe cache namespace. For a professional viewing a client,
   *  pass the CLIENT's id so cached recipes are per-client and isolated. */
  userId: string;
  tier: string;
  onClose: () => void;
  /** Override how the AI personalization context is built. Defaults to the
   *  signed-in user's own context; the chef/trainer pass a client-scoped
   *  builder (buildClientMealContext) since RLS blocks reading the client's
   *  users row directly. */
  buildContext?: () => Promise<UserMealContext>;
  /** Enables the chef-note section (editable for the chef, read-only for the
   *  client). Omit to hide notes entirely. */
  note?: RecipeNoteContext;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Body text sized for a phone reads a bit small stretched across a tablet's
  // extra width — a modest bump keeps ingredients and steps comfortably
  // readable there without a full responsive-typography rewrite.
  const { width: windowWidth } = useWindowDimensions();
  const fontScale = windowWidth >= 600 ? 1.15 : 1;
  // Chef-note state (only used when `note` is provided).
  const [noteText, setNoteText] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    if (!meal || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const cached = await loadCachedRecipe(userId, meal.id);
      if (cached) {
        setRecipe(cached);
        setLoading(false);
        return;
      }
      const ctx = buildContext
        ? await buildContext()
        : await buildUserMealContext(userId);
      const next = await generateRecipe(
        {
          id: meal.id,
          name: meal.name,
          description: meal.description,
          slot: meal.slot,
        },
        ctx,
        tier
      );
      setRecipe(next);
      await saveCachedRecipe(userId, meal.id, next);
    } catch (e) {
      setError(
        (e as Error).message || 'Could not load this recipe. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [meal, userId, tier, buildContext]);

  useEffect(() => {
    if (meal) {
      setRecipe(null);
      load();
    }
  }, [meal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the chef note for this meal whenever it changes (if notes are enabled).
  useEffect(() => {
    setJustSaved(false);
    if (!meal || !note) {
      setNoteText('');
      setSavedNote('');
      return;
    }
    let active = true;
    loadMealNote(note.clientId, meal.id)
      .then((n) => {
        if (!active) return;
        setNoteText(n ?? '');
        setSavedNote(n ?? '');
      })
      .catch(() => {
        if (active) {
          setNoteText('');
          setSavedNote('');
        }
      });
    return () => {
      active = false;
    };
  }, [meal?.id, note?.clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveNote() {
    if (!meal || !note) return;
    setNoteSaving(true);
    try {
      await addChefNote(note.clientId, meal.id, noteText);
      setSavedNote(noteText.trim());
      // Brief "Updated ✓" confirmation, then return to the dashboard.
      setJustSaved(true);
      setTimeout(() => onClose(), 850);
    } catch (e) {
      notify('Could not save note', (e as Error).message);
    } finally {
      setNoteSaving(false);
    }
  }

  const showTips = tier === 'wellness_pro' && recipe?.tips;
  const noteDirty = note?.editable && noteText.trim() !== savedNote;

  if (!meal) return null;

  return (
    <View style={styles.overlay}>
      {/* Manual safe-area top pad — avoids SafeAreaView array-style bug on web */}
      <View style={{ height: TOP_PAD, backgroundColor: '#0A0A0A' }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close recipe" style={styles.closeBtn}>
          <Ionicons name="close" size={22} color="#F5F5F0" />
        </TouchableOpacity>
      </View>

      <RecipeErrorBoundary key={meal.id}>
        {loading ? (
          <RecipeLoading />
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={44} color="#A8A29E" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : recipe ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero photo (best-effort from Unsplash). Omitted entirely when no
                image was found so the layout stays clean. */}
            {recipe.photoUrl ? (
              <View style={styles.heroWrap}>
                <Image
                  source={{ uri: recipe.photoUrl }}
                  style={styles.hero}
                  resizeMode="cover"
                />
                {recipe.photoCredit?.name ? (
                  <Text style={styles.heroCredit}>
                    Photo: {recipe.photoCredit.name} / Unsplash
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.recipeName, { fontSize: 24 * fontScale }]}>
              {recipe.name}
            </Text>
            {recipe.description ? (
              <Text style={[styles.recipeDesc, { fontSize: 14 * fontScale }]}>
                {recipe.description}
              </Text>
            ) : null}

            {/* Chef's note — shown to the CLIENT at the top so it's the first
                thing they see, never buried. (The chef's editor is at the end.) */}
            {note && !note.editable && savedNote ? (
              <View style={[styles.noteBox, { marginTop: 16 }]}>
                <Text style={styles.noteLabel}>CHEF'S NOTE</Text>
                <Text style={styles.noteText}>{savedNote}</Text>
              </View>
            ) : null}

            {/* Recipe plant-group coverage */}
            <View style={{ marginTop: 16 }}>
              <ScoreRow
                hit={recipe.gbombs.categoriesHit}
                score={recipe.gbombs.score}
              />
            </View>

            {/* Prep / cook / servings — smoothies have no cook time */}
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={14} color="#A8A29E" style={{ marginRight: 6 }} />
              <Text style={styles.metaText}>
                {meal.slot === 'smoothie'
                  ? `${recipe.prepMinutes} min · ${recipe.servings} servings`
                  : `⏱  ${recipe.prepMinutes} min prep · ${recipe.cookMinutes} min cook · ${recipe.servings} servings`}
              </Text>
            </View>

            {/* Ingredients */}
            <Text style={styles.sectionHeader}>Ingredients</Text>
            <View style={{ marginTop: 8 }}>
              {recipe.ingredients.map((ing, i) => (
                <View key={`${ing.item}-${i}`} style={styles.ingredientRow}>
                  <Text
                    style={[styles.ingredientText, { fontSize: 14 * fontScale }]}
                  >
                    {ing.quantity ? `${ing.quantity}   ` : ''}{ing.item}
                  </Text>
                  {ing.category ? <IngredientBadge cat={ing.category} /> : null}
                </View>
              ))}
            </View>

            {/* Steps */}
            <Text style={styles.sectionHeader}>Steps</Text>
            <View style={{ marginTop: 8 }}>
              {recipe.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { fontSize: 14 * fontScale }]}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>

            {/* Plant-based tip — Wellness Pro only */}
            {showTips ? (
              <View style={styles.tipBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Ionicons name="bulb-outline" size={16} color="#D4C24E" /><Text style={styles.tipLabel}>PLANT-BASED TIP</Text></View>
                <Text style={styles.tipText}>{recipe.tips}</Text>
              </View>
            ) : null}

            {/* Chef's note EDITOR — chef only, at the end of the recipe so they
                can read the dish first, then annotate. The client sees their
                note prominently at the TOP instead (see above). */}
            {note?.editable ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteLabel}>👨‍🍳 CHEF'S NOTE</Text>
                <Text style={styles.noteHint}>
                  Visible to your client on this meal.
                </Text>
                <TextInput
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="e.g. Swap the cashew cream for sunflower seeds; soak the lentils overnight."
                  placeholderTextColor="#6B7280"
                  multiline
                  style={styles.noteInput}
                />
                <TouchableOpacity
                  onPress={handleSaveNote}
                  disabled={!noteDirty || noteSaving || justSaved}
                  style={[
                    styles.noteSaveBtn,
                    // Faded only when there's nothing to save — stay green for
                    // the saving spinner and the "Updated ✓" confirmation.
                    !noteDirty && !noteSaving && !justSaved &&
                      styles.noteSaveBtnDisabled,
                  ]}
                >
                  {noteSaving ? (
                    <ActivityIndicator color="#000" />
                  ) : justSaved ? (
                    <View style={styles.noteSavedRow}>
                      <Ionicons name="checkmark" size={18} color="#000" />
                      <Text style={[styles.noteSaveText, { marginLeft: 6 }]}>
                        Updated
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noteSaveText}>
                      {savedNote && !noteText.trim()
                        ? 'Clear note'
                        : savedNote
                          ? 'Update note'
                          : 'Save note'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </RecipeErrorBoundary>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeBtn: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#161616',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingIconWrap: {
    height: 72,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  loadingText: {
    color: '#F5F5F0',
    marginTop: 20,
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressTrack: {
    marginTop: 18,
    height: 6,
    width: 220,
    borderRadius: 3,
    backgroundColor: '#1F1F1F',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5A9A3A',
  },
  loadingSub: {
    color: '#6B7280',
    marginTop: 12,
    fontSize: 12,
  },
  errorText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    color: '#f87171',
  },
  retryBtn: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#5A9A3A',
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryBtnText: {
    fontWeight: 'bold',
    color: '#000',
  },
  scroll: {
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor: '#0A0A0A',
  },
  heroWrap: {
    marginBottom: 16,
  },
  hero: {
    width: '100%',
    // A fixed height (was 200) combined with width:'100%' means the box's
    // aspect ratio balloons out on a wide tablet screen (e.g. 800px wide by
    // still only 200px tall — a 4:1 box) while staying ~1.6:1 on mobile.
    // `cover` has to zoom the source photo in much further to fill that much
    // wider box, cropping far more of it top/bottom — which is exactly why
    // the same photo showed the whole glass on mobile but only a tight,
    // cropped sliver on tablet. aspectRatio keeps the crop ratio constant
    // across screen widths instead of a fixed pixel height.
    aspectRatio: 1.6,
    borderRadius: 16,
    backgroundColor: '#161616',
  },
  heroCredit: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'right',
  },
  recipeName: {
    color: '#F5F5F0',
    fontSize: 24,
    fontWeight: '800',
  },
  recipeDesc: {
    color: '#A8A29E',
    marginTop: 4,
    fontSize: 14,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    color: '#A8A29E',
    fontSize: 12,
  },
  plantCard: {
    borderRadius: 16,
    backgroundColor: '#141A12',
    borderWidth: 1,
    borderColor: '#35472B',
    padding: 12,
  },
  plantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plantTitle: {
    color: '#D2DBC9',
    fontSize: 12,
    fontWeight: '600',
  },
  plantCount: {
    color: '#FAFAF9',
    fontSize: 14,
    fontWeight: '700',
  },
  plantSymbol: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantLabel: {
    width: '100%',
    marginTop: 6,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
  },
  plantHint: {
    color: '#9BA593',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 10,
  },
  sectionHeader: {
    color: '#F5F5F0',
    marginTop: 28,
    fontSize: 16,
    fontWeight: 'bold',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
    paddingVertical: 10,
  },
  ingredientText: {
    color: '#F5F5F0',
    flex: 1,
    fontSize: 14,
  },
  stepRow: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  stepNum: {
    marginRight: 12,
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#5A9A3A',
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  stepText: {
    color: '#F5F5F0',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  tipBox: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#1F1B14',
    padding: 16,
  },
  tipLabel: {
    color: '#D4C24E',
    marginBottom: 4,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  tipText: {
    color: '#F5F5F0',
    fontSize: 14,
    lineHeight: 20,
  },
  noteBox: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#141A12',
    borderWidth: 1,
    borderColor: '#2A3A22',
    padding: 16,
  },
  noteLabel: {
    color: '#7FBF5A',
    marginBottom: 6,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  noteHint: {
    color: '#6B7280',
    marginBottom: 10,
    fontSize: 12,
  },
  noteInput: {
    color: '#F5F5F0',
    minHeight: 80,
    borderRadius: 12,
    backgroundColor: '#0F140D',
    borderWidth: 1,
    borderColor: '#2A3A22',
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  noteSaveBtn: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#5A9A3A',
    paddingVertical: 12,
    alignItems: 'center',
  },
  noteSaveBtnDisabled: {
    opacity: 0.45,
  },
  noteSaveText: {
    fontWeight: 'bold',
    color: '#000',
  },
  noteSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteText: {
    color: '#F5F5F0',
    fontSize: 14,
    lineHeight: 20,
  },
});
