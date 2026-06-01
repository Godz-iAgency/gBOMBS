import { Alert } from 'react-native';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import OptionCard from '@/components/onboarding/OptionCard';
import { useOnboarding } from '@/store/onboardingStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { HealthGoal } from '@/types/database.types';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'HealthGoal'>;

const GOALS: { key: HealthGoal; emoji: string; title: string; desc: string }[] = [
  { key: 'weight_loss', emoji: '⚖️', title: 'Weight loss', desc: 'Lower-calorie, high-satiety meals' },
  { key: 'gut_health', emoji: '🌱', title: 'Gut health', desc: 'Fiber-rich, fermented, microbiome-friendly' },
  { key: 'energy', emoji: '⚡', title: 'Energy', desc: 'Steady fuel through the day' },
  { key: 'anti_inflammatory', emoji: '🛡️', title: 'Anti-inflammatory', desc: 'Antioxidant-dense, healing foods' },
  { key: 'general_wellness', emoji: '✨', title: 'General wellness', desc: 'A balanced, everyday approach' },
];

export default function HealthGoalScreen({ navigation }: Props) {
  const { healthGoal, setHealthGoal } = useOnboarding();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!healthGoal || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ health_goal: healthGoal })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    navigation.navigate('CookingStyle');
  }

  return (
    <OnboardingScaffold
      step={3}
      title="Your health goal"
      subtitle="We'll tune your meals toward this."
      buttonLabel="Continue"
      buttonDisabled={!healthGoal}
      buttonLoading={saving}
      onPressButton={handleContinue}
    >
      {GOALS.map((g) => (
        <OptionCard
          key={g.key}
          emoji={g.emoji}
          title={g.title}
          description={g.desc}
          selected={healthGoal === g.key}
          onPress={() => setHealthGoal(g.key)}
        />
      ))}
    </OnboardingScaffold>
  );
}
