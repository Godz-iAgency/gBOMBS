/**
 * Local read-state for the client's "Professional Updates" feed.
 * ------------------------------------------------------------------
 * Tracks which update ids the client has opened, so the Home card can show
 * unread items bright and already-seen items muted. Per-user keyed; best-effort
 * (a storage failure just means nothing is marked read — never blocks the UI).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string) => `gbombs_pro_updates_read_v1_${userId}`;

export async function loadReadIds(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function markRead(userId: string, id: string): Promise<void> {
  try {
    const ids = await loadReadIds(userId);
    if (ids.has(id)) return;
    ids.add(id);
    // Keep the list bounded — only the most recent ~200 matter.
    const trimmed = [...ids].slice(-200);
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(trimmed));
  } catch {
    // non-fatal
  }
}
