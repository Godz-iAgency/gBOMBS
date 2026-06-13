import { useEffect, useState } from 'react';
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
import { BADGE_CATALOG } from '@/lib/badgeCatalog';
import {
  loadStreakStats,
  loadUserBadges,
  type StreakStats,
} from '@/lib/streaks';

/**
 * Trophy case: persisted streak stats up top, then the full badge grid — earned
 * badges in colour, the rest greyed (locked, or "Soon" for badges whose feature
 * isn't built yet). Reads the streaks table + user_badges on open.
 */
export default function BadgeTrophyModal({
  visible,
  userId,
  onClose,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<StreakStats | null>(null);
  const [earned, setEarned] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!visible) {
      setStats(null);
      setEarned(null);
      return;
    }
    let active = true;
    Promise.all([loadStreakStats(userId), loadUserBadges(userId)]).then(
      ([s, e]) => {
        if (!active) return;
        setStats(s);
        setEarned(e);
      }
    );
    return () => {
      active = false;
    };
  }, [visible, userId]);

  const loading = earned === null;
  const earnedCount = earned ? Object.keys(earned).length : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-surface-border px-5 pb-3 pt-1">
          <TouchableOpacity onPress={onClose} className="py-1 pr-3">
            <Ionicons name="close" size={24} color="#A8A29E" />
          </TouchableOpacity>
          <Text className="text-content text-base font-bold">Achievements</Text>
          <View className="w-9" />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#5A9A3A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Streak stats */}
            <View className="-mx-1 flex-row">
              <StatCard
                value={`${stats?.currentDailyStreak ?? 0} 🔥`}
                label="Current streak"
              />
              <StatCard
                value={`${stats?.longestDailyStreak ?? 0}`}
                label="Longest streak"
              />
              <StatCard
                value={`${stats?.totalPerfectDays ?? 0} ⭐`}
                label="Perfect days"
              />
            </View>

            {/* Badge grid */}
            <Text className="text-content-muted mb-3 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
              Badges · {earnedCount}/{BADGE_CATALOG.length}
            </Text>

            <View className="-mx-1.5 flex-row flex-wrap">
              {BADGE_CATALOG.map((b) => {
                const unlockedAt = earned?.[b.key];
                const isEarned = Boolean(unlockedAt);
                return (
                  <View key={b.key} className="w-1/2 px-1.5 pb-3">
                    <View
                      className="items-center rounded-2xl border p-4"
                      style={{
                        backgroundColor: isEarned ? '#161616' : '#101010',
                        borderColor: isEarned ? '#5A9A3A' : '#2D2D2D',
                        opacity: isEarned ? 1 : 0.55,
                      }}
                    >
                      <Text className="text-4xl" style={{ opacity: isEarned ? 1 : 0.5 }}>
                        {isEarned ? b.icon : '🔒'}
                      </Text>
                      <Text
                        className="text-content mt-2 text-center text-sm font-bold"
                        numberOfLines={1}
                      >
                        {b.name}
                      </Text>
                      <Text
                        className="text-content-muted mt-1 text-center text-xs leading-4"
                        numberOfLines={2}
                      >
                        {b.description}
                      </Text>

                      {/* Status pill */}
                      <Text
                        className="mt-2 text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          color: isEarned
                            ? '#5A9A3A'
                            : b.earnable
                              ? '#6B7280'
                              : '#A8742E',
                        }}
                      >
                        {isEarned
                          ? 'Earned'
                          : b.earnable
                            ? 'Locked'
                            : 'Soon'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View className="mx-1 flex-1 rounded-2xl bg-surface-card p-4">
      <Text className="text-content text-xl font-extrabold">{value}</Text>
      <Text className="text-content-muted mt-1 text-xs font-semibold">
        {label}
      </Text>
    </View>
  );
}
