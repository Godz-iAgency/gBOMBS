import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  listMyClients,
  ROLE_META,
  type ClientSummaryRow,
} from '@/lib/professional';
import { LOGO_WITH_BG } from '@/utils/gbombsImages';
import type { ProfessionalStackParamList } from '@/navigation/ProfessionalStack';
import ChefDashboardModal from './ChefDashboardModal';
import TrainerDashboardModal from './TrainerDashboardModal';

type Nav = NativeStackNavigationProp<ProfessionalStackParamList, 'MyClients'>;

/** "3d ago" / "2h ago" / "just now" — compact relative time, null-safe. */
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Home for a PURE professional — their whole app is this: the list of clients
 * who invited them. Tapping one opens the dashboard for that connection's role
 * (chef → kitchen view; trainer → health view). No personal tabs exist.
 */
export default function ProfessionalHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [clients, setClients] = useState<ClientSummaryRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ClientSummaryRow | null>(null);

  const load = useCallback(() => {
    listMyClients()
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  // Refresh on focus so a newly-added (or removed) client shows immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      (c.client_name ?? '').toLowerCase().includes(q)
    );
  }, [clients, query]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Brand banner — same identity as the client side. Account button floats
          top-right so the logo can stay centered. */}
      <View className="border-b border-surface-border px-4 pb-3 pt-2">
        <View className="items-center">
          <Image
            source={LOGO_WITH_BG}
            style={{ width: '70%', height: 68 }}
            resizeMode="contain"
          />
          <Text className="text-content-muted -mt-1 text-xs">
            Healthy Eating Made Simple
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Account')}
          hitSlop={10}
          className="absolute right-4 top-2 h-10 w-10 items-center justify-center rounded-full bg-surface-card"
        >
          <Ionicons name="person-outline" size={20} color="#5A9A3A" />
        </TouchableOpacity>
      </View>

      {/* Section title */}
      <View className="px-4 pt-4">
        <Text className="text-content text-xl font-extrabold">My Clients</Text>
        <Text className="text-content-muted text-xs">
          Professional dashboard
        </Text>
      </View>

      {/* Search */}
      <View className="px-4 pt-3">
        <View className="flex-row items-center rounded-xl border border-surface-border bg-surface-card px-3">
          <Ionicons name="search" size={16} color="#6B7280" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search clients"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-content ml-2 flex-1 py-2.5 text-sm"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {clients === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#5A9A3A" />
        </View>
      ) : clients.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="people-outline" size={40} color="#3F3F46" />
          <Text className="text-content mt-3 text-center text-base font-bold">
            No clients yet
          </Text>
          <Text className="text-content-muted mt-1 text-center text-sm leading-5">
            When a client shares their invite and you connect, they'll show up
            here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.map((c) => (
            <TouchableOpacity
              key={c.connection_id}
              onPress={() => setSelected(c)}
              activeOpacity={0.8}
              className="mb-2.5 flex-row items-center rounded-2xl border border-surface-border bg-surface-card p-3.5"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-cardAlt">
                <Ionicons
                  name={ROLE_META[c.role].icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color="#5A9A3A"
                />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-content text-base font-bold" numberOfLines={1}>
                  {c.client_name ?? 'Client'}
                </Text>
                <Text className="text-content-muted text-xs">
                  {ROLE_META[c.role].label} · plan {ago(c.plan_updated_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6B7280" />
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <Text className="text-content-muted mt-6 text-center text-sm">
              No clients match "{query}".
            </Text>
          )}
        </ScrollView>
      )}

      {/* Role-routed dashboards (reused from the dual-role surface) */}
      {selected?.role === 'chef' && (
        <ChefDashboardModal
          visible
          clientId={selected.client_id}
          clientName={selected.client_name ?? 'Client'}
          onClose={() => setSelected(null)}
        />
      )}
      {selected?.role === 'trainer_nutritionist' && (
        <TrainerDashboardModal
          visible
          clientId={selected.client_id}
          clientName={selected.client_name ?? 'Client'}
          onClose={() => setSelected(null)}
        />
      )}
    </SafeAreaView>
  );
}
