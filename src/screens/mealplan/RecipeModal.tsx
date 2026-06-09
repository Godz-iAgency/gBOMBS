import {
  Component,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  generateRecipe,
  type Recipe,
  type MealSummary,
  type GBombsCategory,
} from '@/services/gemini';
import { buildUserMealContext } from '@/lib/mealContext';
import { loadCachedRecipe, saveCachedRecipe } from '@/lib/recipeCache';
import { GBOMBS_LETTERS, LETTER_BY_KEY } from '@/utils/gbombsImages';

// Safe area top padding — avoids react-native-safe-area-context on web
// (its inset style arrays can trigger a CSSStyleDeclaration indexed-property
// error in react-native-web 0.21 + React 19).
const TOP_PAD = Platform.OS === 'web' ? 48 : 44;

/** Full-width gBOMBS score row: all six letters, lit if the recipe hits them. */
function ScoreRow({ hit, score }: { hit: GBombsCategory[]; score: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row' }}>
        {GBOMBS_LETTERS.map((meta) => {
          const isHit = hit.includes(meta.key as GBombsCategory);
          return (
            <View
              key={meta.key}
              style={{
                marginRight: 4,
                height: 24,
                width: 24,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 1,
                backgroundColor: isHit ? meta.glow : 'transparent',
                borderColor: isHit ? meta.glow : '#2D2D2D',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: 'bold',
                  color: isHit ? '#000' : '#A8A29E',
                }}
              >
                {meta.letter}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={{ color: '#F5F5F0', marginLeft: 8, fontSize: 14, fontWeight: 'bold' }}>
        {score}/6
      </Text>
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
}: {
  meal: MealSummary | null;
  userId: string;
  tier: string;
  onClose: () => void;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const ctx = await buildUserMealContext(userId);
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
  }, [meal, userId, tier]);

  useEffect(() => {
    if (meal) {
      setRecipe(null);
      load();
    }
  }, [meal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showTips = tier === 'wellness_pro' && recipe?.tips;

  if (!meal) return null;

  return (
    <View style={styles.overlay}>
      {/* Manual safe-area top pad — avoids SafeAreaView array-style bug on web */}
      <View style={{ height: TOP_PAD, backgroundColor: '#0A0A0A' }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color="#F5F5F0" />
        </TouchableOpacity>
      </View>

      <RecipeErrorBoundary key={meal.id}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#5A9A3A" />
            <Text style={styles.loadingText}>Writing your recipe…</Text>
          </View>
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
            <Text style={styles.recipeName}>{recipe.name}</Text>
            {recipe.description ? (
              <Text style={styles.recipeDesc}>{recipe.description}</Text>
            ) : null}

            {/* gBOMBS score row */}
            <View style={{ marginTop: 16 }}>
              <ScoreRow
                hit={recipe.gbombs.categoriesHit}
                score={recipe.gbombs.score}
              />
            </View>

            {/* Prep / cook / servings — smoothies have no cook time */}
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {meal.slot === 'smoothie'
                  ? `⏱  ${recipe.prepMinutes} min · ${recipe.servings} servings`
                  : `⏱  ${recipe.prepMinutes} min prep · ${recipe.cookMinutes} min cook · ${recipe.servings} servings`}
              </Text>
            </View>

            {/* Ingredients */}
            <Text style={styles.sectionHeader}>Ingredients</Text>
            <View style={{ marginTop: 8 }}>
              {recipe.ingredients.map((ing, i) => (
                <View key={`${ing.item}-${i}`} style={styles.ingredientRow}>
                  <Text style={styles.ingredientText}>
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
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Nutritarian tip — Wellness Pro only */}
            {showTips ? (
              <View style={styles.tipBox}>
                <Text style={styles.tipLabel}>💡 NUTRITARIAN TIP</Text>
                <Text style={styles.tipText}>{recipe.tips}</Text>
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
  loadingText: {
    color: '#F5F5F0',
    marginTop: 16,
    fontSize: 16,
    fontWeight: 'bold',
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
});
