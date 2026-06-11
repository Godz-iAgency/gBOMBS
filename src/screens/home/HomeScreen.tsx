import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import CheckInScreen from './CheckInScreen';

/**
 * Home dashboard. The full aggregated dashboard (scores, streaks, plan
 * progress) lands in Step 6 — for now it surfaces the Daily Check-in entry.
 */
export default function HomeScreen() {
  const { user, profile } = useAuth();
  const tier = profile?.subscription_tier ?? 'standard';
  const [checkInOpen, setCheckInOpen] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-content text-3xl font-extrabold">Today</Text>
        <Text className="text-content-muted mt-1 text-sm">
          Your daily gBOMBS at a glance.
        </Text>

        {/* Daily Check-in entry */}
        <TouchableOpacity
          onPress={() => setCheckInOpen(true)}
          activeOpacity={0.9}
          className="mt-6 rounded-2xl bg-surface-card p-5"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-content text-lg font-bold">
                Daily Check-in
              </Text>
              <Text className="text-content-muted mt-1 text-sm">
                Log what you ate today and get your gBOMBS score with coaching.
              </Text>
            </View>
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: '#5A9A3A' }}
            >
              <Ionicons name="checkmark-done" size={24} color="#000" />
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <CheckInScreen
        visible={checkInOpen}
        userId={user?.id ?? ''}
        tier={tier}
        onClose={() => setCheckInOpen(false)}
      />
    </SafeAreaView>
  );
}
