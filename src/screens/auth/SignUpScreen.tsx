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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import PasswordInput from '@/components/PasswordInput';
import type { AuthStackParamList } from '@/navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  async function handleGoogle() {
    // Native (iOS/Android) OAuth needs deep-link plumbing built in a later task.
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Google Sign-Up',
        'Google sign-up on iOS/Android arrives in a later build. Email sign-up works now.'
      );
      return;
    }

    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Supabase sends the user back here with the session in the URL hash;
        // detectSessionInUrl (web) then completes sign-in automatically.
        redirectTo: window.location.origin,
      },
    });
    // On success the browser redirects to Google, so code below only runs on error.
    if (error) {
      setGoogleLoading(false);
      Alert.alert('Google sign-up failed', error.message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Back to landing page */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Landing')}
        activeOpacity={0.7}
        className="absolute left-3 top-2 z-10 h-10 w-10 items-center justify-center rounded-full"
      >
        <Ionicons name="chevron-back" size={28} color="#E5E7EB" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-12 mt-4 items-center">
            <Image
              source={require('../../../assets/images/logo/G-bombs logo with background.png')}
              style={{ width: '100%', height: 126 }}
              resizeMode="contain"
            />
            <Text className="text-content-muted mt-4 text-base">
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
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            containerClassName="mb-4"
          />

          <Text className="text-content-muted mb-2 text-sm font-medium">
            Confirm password
          </Text>
          <PasswordInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            containerClassName="mb-6"
          />

          <TouchableOpacity
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
            className="rounded-xl bg-brand-green py-4"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-center text-base font-bold text-white">
                Create account
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View className="my-6 flex-row items-center">
            <View className="h-px flex-1 bg-surface-border" />
            <Text className="mx-3 text-xs text-content-muted">OR</Text>
            <View className="h-px flex-1 bg-surface-border" />
          </View>

          {/* Google */}
          <TouchableOpacity
            onPress={handleGoogle}
            disabled={googleLoading}
            activeOpacity={0.85}
            className="rounded-xl border border-brand-green bg-surface-card py-4"
          >
            {googleLoading ? (
              <ActivityIndicator color="#6FBF4A" />
            ) : (
              <Text className="text-center text-base font-semibold text-content">
                Continue with Google
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
