import { useState } from 'react';
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
import { acceptInvite, ROLE_META } from '@/lib/professional';
import { parseInviteCode } from '@/lib/invite';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<
  OnboardingStackParamList,
  'ProfessionalConnect'
>;

/**
 * Professional onboarding step 1 — enter the invite code the client shared.
 * On success we DON'T refresh the profile yet (that would immediately route us
 * to the pro app); we move to the name step first, then finalize there.
 */
export default function ProfessionalConnectScreen({ navigation }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    const parsed = parseInviteCode(code);
    if (!parsed) {
      setError('Enter the invite code your client gave you.');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      const result = await acceptInvite(parsed);
      navigation.navigate('ProfessionalName', {
        roleLabel: ROLE_META[result.role].label,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={10}
          className="mr-3"
        >
          <Ionicons name="chevron-back" size={26} color="#A8A29E" />
        </TouchableOpacity>
      </View>

      <View className="flex-1 px-6 pt-4">
        <View className="items-center">
          <View
            className="h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: '#2A2718' }}
          >
            <Ionicons name="ribbon-outline" size={30} color="#D4C24E" />
          </View>
        </View>

        <Text className="text-content mt-5 text-center text-2xl font-extrabold">
          Connect to your client
        </Text>
        <Text className="text-content-muted mt-2 text-center text-sm leading-5">
          Enter the invite code your client shared with you. On a phone, you can
          also scan their QR code with your camera.
        </Text>

        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t);
            if (error) setError(null);
          }}
          placeholder="Invite code"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          onSubmitEditing={handleConnect}
          returnKeyType="go"
          className="text-content mt-8 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-center text-lg font-bold tracking-widest"
        />

        {error && (
          <Text className="mt-3 text-center text-sm text-brand-onion">
            {error}
          </Text>
        )}

        <TouchableOpacity
          onPress={handleConnect}
          disabled={busy}
          activeOpacity={0.85}
          className="mt-6 rounded-xl bg-brand-green py-3.5"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-center text-base font-bold text-white">
              Connect
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
