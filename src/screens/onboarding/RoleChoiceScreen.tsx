import { View, Text, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { LOGO_WITH_BG } from '@/utils/gbombsImages';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'RoleChoice'>;

/**
 * The FIRST thing a new account sees — before any onboarding. The screen exists
 * to make ONE decision, so the question is the hero: client (regular member,
 * continues into onboarding) vs. professional (chef/trainer with an invite code,
 * skips consumer onboarding). The professional card is styled more "elevated"
 * (gold) so the two roles read as distinct at a glance.
 *
 * Never a dead end: a back arrow (and a "Sign in" link for returning users who
 * landed here by mistake) signs out and returns to the landing page — the only
 * honest way "back" past the first onboarding screen, since they're signed in.
 */
export default function RoleChoiceScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="flex-1 px-6">
        {/* Back to the landing page (signs this fresh session out) */}
        <TouchableOpacity
          onPress={signOut}
          hitSlop={10}
          className="absolute left-1 top-2 z-10 h-10 w-10 items-center justify-center rounded-full"
        >
          <Ionicons name="chevron-back" size={28} color="#A8A29E" />
        </TouchableOpacity>

        {/* Brand anchor */}
        <View className="items-center pt-4">
          <Image
            source={LOGO_WITH_BG}
            style={{ width: '100%', height: 110 }}
            resizeMode="contain"
          />
          <Text className="text-content-muted -mt-1 text-base">
            Healthy Eating Made Simple
          </Text>
        </View>

        {/* Hero question — the biggest thing on the screen */}
        <View className="mt-10">
          <Text className="text-content text-center text-4xl font-extrabold leading-tight">
            How will you use{'\n'}G-BOMBS?
          </Text>
        </View>

        {/* Choices */}
        <View className="mt-10">
          {/* CLIENT — regular member */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Welcome')}
            activeOpacity={0.85}
            className="flex-row items-center rounded-2xl border border-surface-border bg-surface-card p-5"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-cardAlt">
              <Ionicons name="person-outline" size={26} color="#5A9A3A" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-content text-lg font-extrabold">Client</Text>
              <Text className="text-content-muted mt-0.5 text-sm leading-5">
                Create meal plans, track progress, and work toward your health
                goals.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          {/* PROFESSIONAL — invited with a code (elevated, gold) */}
          <TouchableOpacity
            onPress={() => navigation.navigate('ProfessionalConnect')}
            activeOpacity={0.85}
            className="mt-4 flex-row items-center rounded-2xl border p-5"
            style={{ borderColor: '#9B8C3A', backgroundColor: '#1C1A12' }}
          >
            <View
              className="h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: '#2A2718' }}
            >
              <Ionicons name="ribbon-outline" size={26} color="#D4C24E" />
            </View>
            <View className="ml-4 flex-1">
              <View className="mb-1 flex-row items-center">
                <Text className="text-content text-lg font-extrabold">
                  Professional
                </Text>
                <View
                  className="ml-2 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: '#9B8C3A' }}
                >
                  <Text className="text-[9px] font-bold uppercase tracking-widest text-black">
                    Code
                  </Text>
                </View>
              </View>
              <Text className="text-content-muted text-sm leading-5">
                For chefs and trainers invited by a client.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9B8C3A" />
          </TouchableOpacity>
        </View>

        {/* Gentle nudge — most people are clients. (Flat single <Text>: a
            nested <Text> renders as a <span> on web and crashes NativeWind.) */}
        <Text className="text-content-muted mt-auto text-center text-xs leading-5">
          No invite code? Choose Client — professionals join free with a
          client's code, no subscription needed.
        </Text>

        {/* Returning user who landed here by mistake → sign out to the landing
            page, where they can sign in as themselves. (Two flat <Text>s — no
            nesting, which crashes NativeWind on web.) */}
        <TouchableOpacity
          onPress={signOut}
          activeOpacity={0.7}
          className="mt-4 flex-row items-center justify-center pb-2"
        >
          <Text className="text-content-muted text-sm">
            Already have an account?{' '}
          </Text>
          <Text className="text-sm font-bold" style={{ color: '#5A9A3A' }}>
            Sign in
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
