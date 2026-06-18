import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  listMyClients,
  ROLE_META,
  type ClientSummaryRow,
} from '@/lib/professional';
import ChefDashboardModal from './ChefDashboardModal';
import TrainerDashboardModal from './TrainerDashboardModal';

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
 * My Clients (PROFESSIONAL side).
 * ------------------------------------------------------------------
 * Real-time searchable list of every active client. Tapping one opens the
 * dashboard for THIS connection's role (a chef link → kitchen view; a trainer
 * link → health view), so the same person connected in both roles gets the
 * right surface for each.
 */
export default function ClientListModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<ClientSummaryRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ClientSummaryRow | null>(null);

  useEffect(() => {
    if (!visible) {
      setClients(null);
      setQuery('');
      setSelected(null);
      return;
    }
    let active = true;
    listMyClients()
      .then((rows) => active && setClients(rows))
      .catch(() => active && setClients([]));
    return () => {
      active = false;
    };
  }, [visible]);

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      (c.client_name ?? '').toLowerCase().includes(q)
    );
  }, [clients, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-surface-border px-4 py-3">
          <Text className="text-content text-lg font-extrabold">My Clients</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color="#A8A29E" />
          </TouchableOpacity>
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
                    name={
                      ROLE_META[c.role].icon as keyof typeof Ionicons.glyphMap
                    }
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
      </SafeAreaView>

      {/* Role-routed dashboards */}
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
    </Modal>
  );
}
