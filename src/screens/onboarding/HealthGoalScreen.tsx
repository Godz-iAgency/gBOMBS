import { Alert } from 'react-native';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import OptionCard from '@/components/onboarding/OptionCard';
import { useOnboarding } from '@/store/onboardingStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { HealthGoal } from '@/types/database.types';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'HealthGoal'>;

type GoalDef = {
  key: HealthGoal;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  desc: string;
};

const GOALS: GoalDef[] = [
  { key: 'weight_loss', icon: 'trending-down', color: '#6FBF4A', title: 'Weight loss', desc: 'Lower-calorie, high-satiety meals' },
  { key: 'gut_health', icon: 'leaf', color: '#3A6B2A', title: 'Gut health', desc: 'Fiber-rich, fermented, microbiome-friendly' },
  { key: 'energy', icon: 'flash', color: '#D4A84E', title: 'Energy', desc: 'Steady fuel through the day' },
  { key: 'anti_inflammatory', icon: 'shield-checkmark', color: '#8A7BD8', title: 'Anti-inflammatory', desc: 'Antioxidant-dense, healing foods' },
  { key: 'general_wellness', icon: 'sparkles', color: '#D85A8E', title: 'General wellness', desc: 'A balanced, everyday approach' },
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
      onBack={() => navigation.goBack()}
    >
      {GOALS.map((g) => (
        <OptionCard
          key={g.key}
          icon={g.icon}
          iconColor={g.color}
          title={g.title}
          description={g.desc}
          selected={healthGoal === g.key}
          onPress={() => setHealthGoal(g.key)}
        />
      ))}
    </OnboardingScaffold>
  );
}
