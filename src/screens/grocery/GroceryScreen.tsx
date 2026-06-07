import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/**
 * Grocery placeholder. Real content (auto-built list + Instacart order) is built
 * in Phase 3.
 */
export default function GroceryScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <Ionicons name="cart-outline" size={48} color="#5A9A3A" />
        <Text className="text-content mt-4 text-2xl font-bold">Grocery</Text>
        <Text className="text-content-muted mt-2 text-center text-sm">
          Your grocery list and Instacart checkout will live here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
