import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  acceptInvite,
  ROLE_META,
  type AcceptInviteResult,
} from '@/lib/professional';
import { parseInviteCode } from '@/lib/invite';

/**
 * Connect to a Client (PROFESSIONAL side).
 * ------------------------------------------------------------------
 * The professional types (or pastes) the invite code their client showed them.
 * On a real phone they can also scan the client's QR with the OS camera, which
 * deep-links here with the code prefilled. Accepting links the two accounts and
 * the client appears under "My Clients".
 */
export default function AcceptInviteModal({
  visible,
  onClose,
  onConnected,
  initialCode,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful connection so the parent can refresh. */
  onConnected?: (result: AcceptInviteResult) => void;
  /** Prefill (e.g. from a scanned deep link). */
  initialCode?: string;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AcceptInviteResult | null>(null);

  useEffect(() => {
    if (visible) {
      setCode(initialCode ? parseInviteCode(initialCode) : '');
      setError(null);
      setDone(null);
      setBusy(false);
    }
  }, [visible, initialCode]);

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
      setDone(result);
      onConnected?.(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-row items-center justify-between border-b border-surface-border px-4 py-3">
          <Text className="text-content text-lg font-extrabold">
            Connect to a Client
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color="#A8A29E" />
          </TouchableOpacity>
        </View>

        <View className="flex-1 px-5 pt-8">
          {done ? (
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-surface-cardAlt">
                <Ionicons name="checkmark-circle" size={40} color="#5A9A3A" />
              </View>
              <Text className="text-content mt-4 text-center text-xl font-extrabold">
                You're connected
              </Text>
              {/* NOTE: a single flat <Text> — a nested <Text> renders as a
                  <span> on react-native-web and crashes the NativeWind style
                  pass ("Failed to set an indexed property on CSSStyleDeclaration").
                  Keep this one element; do not re-introduce an inner <Text>. */}
              <Text className="text-content-muted mt-2 text-center text-sm leading-5">
                You're now this client's {ROLE_META[done.role].label}. They'll
                appear under “My Clients”.
              </Text>
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.85}
                className="mt-8 w-full rounded-xl bg-brand-green py-3"
              >
                <Text className="text-center text-base font-bold text-white">
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View className="items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-cardAlt">
                  <Ionicons name="qr-code-outline" size={28} color="#5A9A3A" />
                </View>
              </View>
              <Text className="text-content-muted mt-5 text-center text-sm leading-5">
                Enter the invite code your client showed you. On your phone you
                can also scan their QR code with your camera.
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
                className="text-content mt-6 rounded-xl border border-surface-border bg-surface-card px-4 py-3.5 text-center text-lg font-bold tracking-widest"
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
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
