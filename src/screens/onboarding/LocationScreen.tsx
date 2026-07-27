import { useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import { useOnboarding } from '@/store/onboardingStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Location'>;

const INPUT_CLASS =
  'text-content rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-base';
const LABEL_CLASS =
  'text-content-muted mb-1.5 mt-5 text-xs font-semibold uppercase tracking-wide';

export default function LocationScreen({ navigation }: Props) {
  const { state, city, zipCode, setState, setCity, setZipCode } =
    useOnboarding();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const zipValid = /^\d{5}$/.test(zipCode.trim());
  const canContinue = state.trim().length > 0 && city.trim().length > 0 && zipValid;

  async function handleContinue() {
    if (!user || !canContinue) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
        state: state.trim(),
        city: city.trim(),
        zip_code: zipCode.trim(),
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    navigation.navigate('DietMode');
  }

  return (
    <OnboardingScaffold
      step={2}
      title="Where are you?"
      subtitle="We use this to find your nearest grocery store for checkout."
      buttonLabel="Continue"
      buttonDisabled={!canContinue}
      buttonLoading={saving}
      onPressButton={handleContinue}
      onBack={() => navigation.goBack()}
    >
      <Text className={LABEL_CLASS}>State</Text>
      <TextInput
        value={state}
        onChangeText={setState}
        placeholder="e.g. Texas"
        placeholderTextColor="#6B7280"
        autoCapitalize="words"
        returnKeyType="next"
        className={INPUT_CLASS}
      />

      <Text className={LABEL_CLASS}>City</Text>
      <TextInput
        value={city}
        onChangeText={setCity}
        placeholder="e.g. Austin"
        placeholderTextColor="#6B7280"
        autoCapitalize="words"
        returnKeyType="next"
        className={INPUT_CLASS}
      />

      <Text className={LABEL_CLASS}>ZIP code</Text>
      <TextInput
        value={zipCode}
        onChangeText={(v) => setZipCode(v.replace(/[^0-9]/g, '').slice(0, 5))}
        placeholder="e.g. 78701"
        placeholderTextColor="#6B7280"
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={5}
        className={INPUT_CLASS}
      />

      <View className="h-2" />
    </OnboardingScaffold>
  );
}
