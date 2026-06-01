import { View, Text, Alert } from 'react-native';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/store/onboardingStore';
import { supabase } from '@/lib/supabase';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PantryStarter'>;

/**
 * PLACEHOLDER pantry seed step. Its key job today: finalize onboarding by
 * persisting diet_mode + onboarding_completed=TRUE, then refresh the profile so
 * AppNavigator routes into the main app.
 */
export default function PantryStarterScreen(_props: Props) {
  const { user, refreshProfile } = useAuth();
  const { dietMode } = useOnboarding();
  const [finishing, setFinishing] = useState(false);

  async function handleFinish() {
    if (!user) return;
    setFinishing(true);
    const { error } = await supabase
      .from('users')
      .update({ diet_mode: dietMode, onboarding_completed: true })
      .eq('id', user.id);
    if (error) {
      setFinishing(false);
      Alert.alert('Could not finish', error.message);
      return;
    }
    await refreshProfile();
    // AppNavigator now sees onboarding_completed=TRUE and shows MainStack.
  }

  return (
    <OnboardingScaffold
      step={7}
      title="Stock your pantry"
      subtitle="Tell us what you already have (optional)"
      buttonLabel="Finish setup"
      buttonLoading={finishing}
      onPressButton={handleFinish}
    >
      <View className="mt-6 rounded-2xl border border-surface-border bg-surface-card p-6">
        <Text className="text-content text-base font-semibold">🚧 Coming next</Text>
        <Text className="text-content-muted mt-2 text-sm leading-5">
          The pantry seed list is built later. Tapping "Finish setup" completes
          onboarding and takes you into the app.
        </Text>
      </View>
    </OnboardingScaffold>
  );
}
