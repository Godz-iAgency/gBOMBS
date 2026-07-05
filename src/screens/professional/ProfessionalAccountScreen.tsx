import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { updateFullName } from '@/lib/profile';
import { notify } from '@/utils/dialog';

/**
 * Minimal account screen for a pure professional — just the identity their
 * clients see (name) and sign out. No diet/goal/subscription settings: none of
 * that applies to someone who's only here to serve a client. (Photo upload +
 * the "want your own plan too?" upgrade path land in a later chunk.)
 */
export default function ProfessionalAccountScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!active) return;
        const n = data?.full_name ?? '';
        setName(n);
        setSavedName(n);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function handleSave() {
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateFullName(user.id, name);
      setSavedName(name.trim());
      notify('Saved', 'Your clients will see this name.');
    } catch (e) {
      notify('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = name.trim() !== savedName && name.trim().length > 0;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center border-b border-surface-border px-4 py-3">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={10}
          className="mr-3"
        >
          <Ionicons name="chevron-back" size={26} color="#A8A29E" />
        </TouchableOpacity>
        <Text className="text-content text-lg font-extrabold">Account</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#5A9A3A" />
        </View>
      ) : (
        <View className="px-5 pt-6">
          <Text className="text-content-muted text-xs">Signed in as</Text>
          <Text className="text-content mt-1 text-base font-semibold">
            {user?.email}
          </Text>

          <Text className="text-content-muted mb-1.5 mt-7 text-xs font-semibold uppercase tracking-wide">
            Your name
          </Text>
          <Text className="text-content-muted mb-2 text-xs">
            This is what your clients see on notes and updates.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chef Marco"
            placeholderTextColor="#6B7280"
            className="text-content rounded-xl border border-surface-border bg-surface-card px-4 py-3 text-base"
          />
          <TouchableOpacity
            onPress={handleSave}
            disabled={!dirty || saving}
            activeOpacity={0.85}
            className={`mt-3 items-center rounded-xl py-3 ${
              dirty && !saving ? 'bg-brand-green' : 'bg-surface-cardAlt'
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                className={`text-base font-bold ${
                  dirty ? 'text-white' : 'text-content-muted'
                }`}
              >
                Save name
              </Text>
            )}
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity
            onPress={signOut}
            activeOpacity={0.85}
            className="mt-10 self-center rounded-xl border border-surface-border bg-surface-card px-8 py-3"
          >
            <Text className="text-content text-base font-semibold">
              Sign out
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
