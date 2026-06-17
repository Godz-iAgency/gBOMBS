import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { loadCachedPlan } from '@/lib/mealPlanCache';
import type { WeeklyMealPlan } from '@/services/gemini';
import GroceryListView from '@/screens/mealplan/GroceryScreen';

/**
 * Grocery tab. Loads the user's cached weekly meal plan and shows the real
 * grocery list (the same view used as a modal from the Meal Plan screen). When
 * no plan has been generated yet, it points the user to the Meal Plan tab —
 * the list is always derived from a plan, so there's nothing to show without one.
 */
export default function GroceryScreen() {
  const { user, profile } = useAuth();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const tier = profile?.subscription_tier ?? 'standard';

  const [plan, setPlan] = useState<WeeklyMealPlan | null>(null);
  const [loading, setLoading] = useState(true);

  // Reload the cached plan whenever the tab regains focus, so a plan generated
  // on the Meal Plan tab shows up here without an app restart.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!user?.id) {
          setLoading(false);
          return;
        }
        const cached = await loadCachedPlan(user.id);
        if (active) {
          setPlan(cached);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [user?.id])
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#5A9A3A" />
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cart-outline" size={48} color="#5A9A3A" />
          <Text className="text-content mt-4 text-2xl font-bold">
            No grocery list yet
          </Text>
          <Text className="text-content-muted mt-2 text-center text-sm">
            Generate a weekly meal plan first — your grocery list is built from
            it automatically.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('MealPlan')}
            activeOpacity={0.85}
            className="mt-6 rounded-xl bg-brand-green px-6 py-3"
          >
            <Text className="text-base font-bold text-white">
              Go to Meal Plan
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Plan exists → show the real grocery list. No onClose: it's a tab, not a modal.
  // Wrap in a flex parent so the list's absolute overlay always has a sized box.
  return (
    <View style={{ flex: 1 }}>
      <GroceryListView visible plan={plan} userId={user?.id ?? ''} tier={tier} />
    </View>
  );
}
