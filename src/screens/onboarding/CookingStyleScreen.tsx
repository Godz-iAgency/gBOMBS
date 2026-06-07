import { Alert } from 'react-native';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import OptionCard from '@/components/onboarding/OptionCard';
import { useOnboarding } from '@/store/onboardingStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { CookingStyle } from '@/types/database.types';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'CookingStyle'>;

type StyleDef = {
  key: CookingStyle;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  desc: string;
};

const STYLES: StyleDef[] = [
  { key: 'quick_simple', icon: 'flash', color: '#D4A84E', title: 'Quick & simple', desc: '15–20 min meals, minimal steps' },
  { key: 'balanced_everyday', icon: 'restaurant', color: '#6FBF4A', title: 'Balanced everyday', desc: 'A practical mix for weeknights' },
  { key: 'gourmet_weekend', icon: 'wine', color: '#D85A8E', title: 'Gourmet weekend', desc: 'More involved, restaurant-style' },
  { key: 'batch_cooking', icon: 'layers', color: '#8A7BD8', title: 'Batch cooking', desc: 'Cook once, eat all week' },
];

export default function CookingStyleScreen({ navigation }: Props) {
  const { cookingStyle, setCookingStyle } = useOnboarding();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!cookingStyle || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ cooking_style: cookingStyle })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    navigation.navigate('FoodPreference');
  }

  return (
    <OnboardingScaffold
      step={4}
      title="Your cooking style"
      subtitle="How do you like to cook?"
      buttonLabel="Continue"
      buttonDisabled={!cookingStyle}
      buttonLoading={saving}
      onPressButton={handleContinue}
      onBack={() => navigation.goBack()}
    >
      {STYLES.map((s) => (
        <OptionCard
          key={s.key}
          icon={s.icon}
          iconColor={s.color}
          title={s.title}
          description={s.desc}
          selected={cookingStyle === s.key}
          onPress={() => setCookingStyle(s.key)}
        />
      ))}
    </OnboardingScaffold>
  );
}
