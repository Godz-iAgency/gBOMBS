import { View, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Allergies'>;

/**
 * PLACEHOLDER — same chip + free-text pattern as FoodPreference, but selections
 * are saved with is_excluded=TRUE. Built alongside the real FoodPreferenceScreen.
 */
export default function AllergiesScreen({ navigation }: Props) {
  return (
    <OnboardingScaffold
      step={6}
      title="Anything to avoid?"
      subtitle="Allergies and foods you never want to see"
      buttonLabel="Continue"
      onPressButton={() => navigation.navigate('PantryStarter')}
    >
      <View className="mt-6 rounded-2xl border border-surface-border bg-surface-card p-6">
        <Text className="text-content text-base font-semibold">🚧 Coming next</Text>
        <Text className="text-content-muted mt-2 text-sm leading-5">
          Exclusions use the same UI as the food preferences screen. Built next.
        </Text>
      </View>
    </OnboardingScaffold>
  );
}
