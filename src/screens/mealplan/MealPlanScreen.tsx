import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/**
 * Meal plan placeholder. Real content (AI-generated weekly plan + recipe cards)
 * is built in Phase 2.
 */
export default function MealPlanScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <Ionicons name="calendar-outline" size={48} color="#5A9A3A" />
        <Text className="text-content mt-4 text-2xl font-bold">Meal Plan</Text>
        <Text className="text-content-muted mt-2 text-center text-sm">
          Your AI-generated weekly meal plan and recipes will live here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
