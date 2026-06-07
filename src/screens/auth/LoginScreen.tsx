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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import PasswordInput from '@/components/PasswordInput';
import type { AuthStackParamList } from '@/navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
    // On success, the auth listener swaps the navigator automatically.
  }

  function handleGoogle() {
    Alert.alert(
      'Google Sign-In',
      'Google OAuth turns on once we finish the Google Cloud Console setup. Email sign-in works now.'
    );
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
          {/* Brand */}
          <View className="mb-14 mt-6 items-center">
            <Image
              source={require('../../../assets/images/logo/G-bombs logo with background.png')}
              style={{ width: '100%', height: 126 }}
              resizeMode="contain"
            />
            <Text className="text-content-muted mt-4 text-base">
              Healthy Eating Made Simple
            </Text>
          </View>

          <Text className="text-content mb-6 text-2xl font-bold">Welcome back</Text>

          {/* Email */}
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

          {/* Password */}
          <Text className="text-content-muted mb-2 text-sm font-medium">
            Password
          </Text>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            containerClassName="mb-6"
          />

          {/* Sign in */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
            className="rounded-xl bg-brand-green py-4 active:opacity-90"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-center text-base font-bold text-white">
                Sign in
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
            activeOpacity={0.85}
            className="rounded-xl border border-brand-green bg-surface-card py-4"
          >
            <Text className="text-center text-base font-semibold text-content">
              Continue with Google
            </Text>
          </TouchableOpacity>

          {/* To sign up */}
          <View className="mt-8 flex-row justify-center">
            <Text className="text-content-muted">New here? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text className="font-semibold text-brand-green">Create account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
