import { View, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'FoodPreference'>;

/**
 * PLACEHOLDER — the full chip-grid + free-text + Gemini-validation + diet-mode
 * save sheet gets built next. For now it lets the flow continue end-to-end.
 */
export default function FoodPreferenceScreen({ navigation }: Props) {
  return (
    <OnboardingScaffold
      step={5}
      title="Your whole foods"
      subtitle="Select foods you love — or add your own"
      buttonLabel="Save my food preferences"
      onPressButton={() => navigation.navigate('Allergies')}
    >
      <View className="mt-6 rounded-2xl border border-surface-border bg-surface-card p-6">
        <Text className="text-content text-base font-semibold">
          🚧 Coming next
        </Text>
        <Text className="text-content-muted mt-2 text-sm leading-5">
          This is the most complex screen: the G·B·O·M·B·S chip grid, custom food
          entry with instant validation, and the diet-mode save sheet. It's the
          next thing we build. For now, tap continue to walk the rest of the flow.
        </Text>
      </View>
    </OnboardingScaffold>
  );
}
