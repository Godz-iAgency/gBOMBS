import { View, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import OptionCard from '@/components/onboarding/OptionCard';
import { useOnboarding } from '@/store/onboardingStore';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'DietMode'>;

export default function DietModeScreen({ navigation }: Props) {
  const { dietMode, setDietMode } = useOnboarding();

  return (
    <OnboardingScaffold
      step={2}
      title="Your diet mode"
      subtitle="You'll confirm this again when you save your foods."
      buttonLabel="Continue"
      onPressButton={() => navigation.navigate('HealthGoal')}
    >
      <OptionCard
        icon="leaf"
        iconColor="#3A6B2A"
        title="Vegan"
        description="100% plant-based. No eggs, dairy, meat, or fish."
        selected={dietMode === 'vegan'}
        onPress={() => setDietMode('vegan')}
      />
      <OptionCard
        icon="egg"
        iconColor="#D4A84E"
        title="Vegetarian"
        description="Plant-based, but eggs and cheese are allowed. No meat or fish."
        selected={dietMode === 'vegetarian'}
        onPress={() => setDietMode('vegetarian')}
      />

      {dietMode === 'vegetarian' ? (
        <View className="mt-2 rounded-xl border border-[rgba(250,191,23,0.3)] bg-[rgba(250,191,23,0.1)] p-4">
          <Text className="text-[#FCD34D] text-sm">
            Vegetarian mode: Eggs and cheese will be included in your recipes and
            grocery list where appropriate.
          </Text>
        </View>
      ) : null}
    </OnboardingScaffold>
  );
}
