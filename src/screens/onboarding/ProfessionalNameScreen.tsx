import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { notify } from '@/utils/dialog';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<
  OnboardingStackParamList,
  'ProfessionalName'
>;

/**
 * Professional onboarding step 2 (final) — confirm the name the client will see.
 * Saving refreshes the profile, which flips isProfessional true in AuthContext,
 * and AppNavigator swaps this whole stack out for the pro app. This is the only
 * onboarding a professional does — no diet mode, goals, or food preferences.
 */
export default function ProfessionalNameScreen({ route }: Props) {
  const { roleLabel } = route.params;
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Prefill any name we already have (e.g. from a Google sign-in).
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (active && data?.full_name) setName(data.full_name);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function handleFinish() {
    if (!user?.id) return;
    const trimmed = name.trim();
    if (!trimmed) {
      notify('Name needed', 'Enter the name your client should see.');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    try {
      // Save the name AND mark onboarding complete — a professional's short
      // signup IS their onboarding. Without this flag, if they later lose their
      // last client they'd be wrongly funneled back through the whole role-choice
      // flow as if brand new (they should land on the paywall instead).
      const { error } = await supabase
        .from('users')
        .update({ full_name: trimmed, onboarding_completed: true })
        .eq('id', user.id);
      if (error) throw error;
      // Flip routing → the pro app. AppNavigator unmounts this stack.
      await refreshProfile();
    } catch (e) {
      notify('Could not save', (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="flex-1 px-6 pt-4">
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-surface-cardAlt">
            <Ionicons name="checkmark-circle" size={34} color="#5A9A3A" />
          </View>
        </View>

        <Text className="text-content mt-5 text-center text-2xl font-extrabold">
          You're connected
        </Text>
        <Text className="text-content-muted mt-2 text-center text-sm leading-5">
          You're now this client's {roleLabel}. What name should they see on your
          notes and updates?
        </Text>

        <Text className="text-content-muted mb-1.5 mt-8 text-xs font-semibold uppercase tracking-wide">
          Your name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Chef Marco"
          placeholderTextColor="#6B7280"
          autoCapitalize="words"
          onSubmitEditing={handleFinish}
          returnKeyType="done"
          className="text-content rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-base"
        />

        <TouchableOpacity
          onPress={handleFinish}
          disabled={busy}
          activeOpacity={0.85}
          className="mt-6 rounded-xl bg-brand-green py-3.5"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-center text-base font-bold text-white">
              Go to my dashboard
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
