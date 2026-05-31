import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Placeholder authenticated area. The real bottom-tab navigator (Home, Meal
 * Plan, Grocery, Profile) gets built in Step 7. For now this confirms the auth
 * gate works end-to-end and lets you sign out.
 */
export default function MainStack() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-brand-green text-3xl font-extrabold">gBOMBS</Text>
        <Text className="text-content mt-3 text-lg font-semibold">
          You're signed in
        </Text>
        <Text className="text-content-muted mt-1 text-sm">{user?.email}</Text>

        <TouchableOpacity
          onPress={signOut}
          activeOpacity={0.85}
          className="mt-10 rounded-xl border border-surface-border bg-surface-card px-8 py-3"
        >
          <Text className="text-base font-semibold text-content">Sign out</Text>
        </TouchableOpacity>

        <Text className="text-content-muted mt-12 text-center text-xs">
          Main app (tabs, meal plan, grocery, profile) arrives in Step 7.
        </Text>
      </View>
    </SafeAreaView>
  );
}
