import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/**
 * Home dashboard placeholder. Real content (daily gBOMBS score, quick actions)
 * is built in Phase 2.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <Ionicons name="home-outline" size={48} color="#5A9A3A" />
        <Text className="text-content mt-4 text-2xl font-bold">Home</Text>
        <Text className="text-content-muted mt-2 text-center text-sm">
          Your daily gBOMBS score and quick actions will live here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
