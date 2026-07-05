import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import {
  listMyConnections,
  createInvite,
  revokeConnection,
  previewRevoke,
  ROLE_META,
  ALL_ROLES,
  type ProfessionalConnection,
  type ProfessionalRole,
} from '@/lib/professional';
import { shareInvite, inviteDeepLink } from '@/lib/invite';
import { confirmAsync, notify } from '@/utils/dialog';
import QRCodeBox from '@/components/QRCodeBox';

/** Premium gate (matches the create_professional_invite RPC's server-side rule). */
function isPremium(profile: {
  subscription_tier: string;
  subscription_status: string;
  subscription_id: string | null;
} | null): boolean {
  return (
    !!profile &&
    profile.subscription_tier === 'wellness_pro' &&
    !!profile.subscription_id &&
    ['active', 'trialing'].includes(profile.subscription_status)
  );
}

/**
 * Professional Access (CLIENT side, Premium).
 * ------------------------------------------------------------------
 * Two fixed slots — a Personal Chef and a Trainer/Nutritionist. The client
 * generates an invite per slot (QR + code), the professional scans/types it,
 * and the client can revoke at any time to free the slot. All state changes go
 * through the server RPCs; this screen just reflects the connection rows.
 */
export default function ProfessionalAccessModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { user, profile } = useAuth();
  const premium = isPremium(profile);

  const [connections, setConnections] = useState<ProfessionalConnection[] | null>(
    null
  );
  const [busyRole, setBusyRole] = useState<ProfessionalRole | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    try {
      setConnections(await listMyConnections(user.id));
    } catch {
      setConnections([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!visible) {
      setConnections(null);
      return;
    }
    reload();
  }, [visible, reload]);

  const connFor = (role: ProfessionalRole) =>
    connections?.find((c) => c.role === role) ?? null;

  async function handleGenerate(role: ProfessionalRole) {
    setBusyRole(role);
    try {
      await createInvite(role);
      await reload();
    } catch (e) {
      notify('Could not create invite', (e as Error).message);
    } finally {
      setBusyRole(null);
    }
  }

  async function handleRevoke(conn: ProfessionalConnection) {
    const label = ROLE_META[conn.role].label;
    const who = conn.professional_name ?? `Your ${label}`;

    // Cancelling a still-pending invite never deletes anyone (no account yet).
    if (conn.status !== 'active') {
      const ok = await confirmAsync({
        title: 'Cancel invite?',
        message:
          'This invite code will stop working. You can generate a new one anytime.',
        confirmLabel: 'Cancel invite',
        cancelLabel: 'Keep',
        destructive: true,
      });
      if (!ok) return;
      try {
        await revokeConnection(conn.id);
        await reload();
      } catch (e) {
        notify('Could not update', (e as Error).message);
      }
      return;
    }

    // Active connection: ask the server whether removing it will permanently
    // delete this professional (their last client + no personal subscription),
    // and show the hard warning only when that's actually true.
    let willDelete = false;
    try {
      ({ willDelete } = await previewRevoke(conn.id));
    } catch {
      // If the check fails, fall back to the softer message (never block removal).
    }

    const ok = await confirmAsync(
      willDelete
        ? {
            title: 'Remove and delete account?',
            message: `You're ${who}'s only client. Removing them will PERMANENTLY DELETE their professional account and erase all their data — they'll have to start from scratch if you ever reconnect. This cannot be undone. Continue?`,
            confirmLabel: 'Remove & delete',
            cancelLabel: 'Keep',
            destructive: true,
          }
        : {
            title: 'Remove?',
            message: `${who} will lose access to your plan and data. You can re-invite anytime.`,
            confirmLabel: 'Remove',
            cancelLabel: 'Keep',
            destructive: true,
          }
    );
    if (!ok) return;
    try {
      await revokeConnection(conn.id);
      await reload();
    } catch (e) {
      notify('Could not update', (e as Error).message);
    }
  }

  async function handleShare(conn: ProfessionalConnection) {
    if (!conn.invite_code) return;
    const { copied } = await shareInvite(
      conn.invite_code,
      ROLE_META[conn.role].label
    );
    if (copied) notify('Copied', 'Invite copied to your clipboard.');
  }

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
          <Text className="text-content text-lg font-extrabold">
            Professional Access
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color="#A8A29E" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-content-muted text-sm leading-5">
            Give your Personal Chef and your Trainer/Nutritionist their own free
            access to your plan. They scan your QR code (or type the code) to
            connect. You control access and can remove them anytime.
          </Text>

          {!premium && (
            <View className="mt-5 rounded-2xl border border-brand-gold/40 bg-surface-cardAlt p-4">
              <View className="flex-row items-center">
                <Ionicons name="star" size={18} color="#9B8C3A" />
                <Text className="text-content ml-2 text-base font-bold">
                  Premium feature
                </Text>
              </View>
              <Text className="text-content-muted mt-1.5 text-sm leading-5">
                Connecting a chef or trainer is part of Premium. Upgrade from the
                Subscription section to invite your professionals.
              </Text>
            </View>
          )}

          {connections === null ? (
            <View className="mt-10 items-center">
              <ActivityIndicator size="large" color="#5A9A3A" />
            </View>
          ) : (
            ALL_ROLES.map((role) => (
              <SlotCard
                key={role}
                role={role}
                conn={connFor(role)}
                premium={premium}
                busy={busyRole === role}
                onGenerate={() => handleGenerate(role)}
                onRevoke={handleRevoke}
                onShare={handleShare}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** One role slot: empty → pending (QR) → active. */
function SlotCard({
  role,
  conn,
  premium,
  busy,
  onGenerate,
  onRevoke,
  onShare,
}: {
  role: ProfessionalRole;
  conn: ProfessionalConnection | null;
  premium: boolean;
  busy: boolean;
  onGenerate: () => void;
  onRevoke: (c: ProfessionalConnection) => void;
  onShare: (c: ProfessionalConnection) => void;
}) {
  const meta = ROLE_META[role];

  return (
    <View className="mt-5 rounded-2xl border border-surface-border bg-surface-card p-4">
      {/* Role header */}
      <View className="flex-row items-center">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-cardAlt">
          <Ionicons
            name={meta.icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color="#5A9A3A"
          />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-content text-base font-bold">{meta.label}</Text>
          <Text className="text-content-muted text-xs leading-4">
            {meta.blurb}
          </Text>
        </View>
      </View>

      {/* State */}
      {conn?.status === 'active' ? (
        <View className="mt-4">
          <View className="flex-row items-center rounded-xl bg-surface-cardAlt px-3 py-2.5">
            <Ionicons name="checkmark-circle" size={18} color="#5A9A3A" />
            <Text className="text-content ml-2 flex-1 text-sm font-semibold">
              Connected{conn.professional_name ? ` — ${conn.professional_name}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onRevoke(conn)}
            activeOpacity={0.8}
            className="mt-3 self-start"
          >
            <Text className="text-sm font-semibold text-brand-onion">
              Remove access
            </Text>
          </TouchableOpacity>
        </View>
      ) : conn?.status === 'pending' && conn.invite_code ? (
        <View className="mt-4 items-center">
          <QRCodeBox value={inviteDeepLink(conn.invite_code)} size={190} />
          <Text className="text-content-muted mt-3 text-center text-xs">
            Have your {meta.label.toLowerCase()} scan this, or share the code:
          </Text>
          <Text
            selectable
            className="text-content mt-1 text-center text-lg font-bold tracking-widest"
          >
            {conn.invite_code}
          </Text>
          <View className="mt-4 w-full flex-row">
            <TouchableOpacity
              onPress={() => onShare(conn)}
              activeOpacity={0.85}
              className="mr-2 flex-1 flex-row items-center justify-center rounded-xl bg-brand-green py-3"
            >
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
              <Text className="ml-2 text-sm font-bold text-white">Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onRevoke(conn)}
              activeOpacity={0.85}
              className="flex-1 items-center justify-center rounded-xl border border-surface-border py-3"
            >
              <Text className="text-sm font-bold text-brand-onion">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={onGenerate}
          disabled={!premium || busy}
          activeOpacity={0.85}
          className={`mt-4 flex-row items-center justify-center rounded-xl py-3 ${
            premium ? 'bg-brand-green' : 'bg-surface-cardAlt'
          }`}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="qr-code-outline"
                size={18}
                color={premium ? '#FFFFFF' : '#A8A29E'}
              />
              <Text
                className={`ml-2 text-sm font-bold ${
                  premium ? 'text-white' : 'text-content-muted'
                }`}
              >
                Generate invite
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}
