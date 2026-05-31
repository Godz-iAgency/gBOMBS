import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import type { AuthStackParamList } from '@/navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords differ', 'Both passwords must match.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }

    // If email confirmation is ON in Supabase, no session is returned yet.
    if (!data.session) {
      Alert.alert(
        'Confirm your email',
        'We sent a confirmation link. Tap it, then sign in.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    }
    // If confirmation is OFF, the auth listener logs them straight in.
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 items-center">
            <Text className="text-brand-green text-4xl font-extrabold tracking-tight">
              gBOMBS
            </Text>
            <Text className="text-content-muted mt-2 text-base">
              Start your 7-day free trial
            </Text>
          </View>

          <Text className="text-content mb-6 text-2xl font-bold">
            Create your account
          </Text>

          <Text className="text-content-muted mb-2 text-sm font-medium">
            Full name
          </Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor="#6B7280"
            className="mb-4 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-base text-content"
          />

          <Text className="text-content-muted mb-2 text-sm font-medium">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            className="mb-4 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-base text-content"
          />

          <Text className="text-content-muted mb-2 text-sm font-medium">
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor="#6B7280"
            secureTextEntry
            autoCapitalize="none"
            className="mb-4 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-base text-content"
          />

          <Text className="text-content-muted mb-2 text-sm font-medium">
            Confirm password
          </Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            placeholderTextColor="#6B7280"
            secureTextEntry
            autoCapitalize="none"
            className="mb-6 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-base text-content"
          />

          <TouchableOpacity
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
            className="rounded-xl bg-brand-green py-4"
          >
            {loading ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text className="text-center text-base font-bold text-surface">
                Create account
              </Text>
            )}
          </TouchableOpacity>

          <View className="mt-8 flex-row justify-center">
            <Text className="text-content-muted">Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text className="font-semibold text-brand-green">Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
