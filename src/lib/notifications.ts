import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * Push notifications for the daily check-in reminder.
 * ------------------------------------------------------------------
 * The token + the device's IANA timezone are stored on the user's row; the
 * `send-daily-reminders` Edge Function reads them so each user is reminded at
 * THEIR local evening, not a fixed UTC hour. Delivery goes through Expo's free
 * push service (→ FCM on Android, APNs on iOS). Web and simulators can't receive
 * push, so registration quietly no-ops there.
 */

// Foreground behavior: still show the banner + play a sound while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** This device's IANA timezone, e.g. "America/New_York". */
function deviceTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
    );
  } catch {
    return 'America/New_York';
  }
}

/** Android requires an explicit channel for notifications to display. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#5A9A3A',
  });
}

/**
 * Ask for permission, fetch the Expo push token, and save it (plus the device
 * timezone) to the user's row. Safe to call on every login. Returns the token,
 * or null if permission was denied or the platform can't deliver push.
 */
export async function registerForPushNotifications(
  userId: string
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;

  let token: string;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    token = res.data;
  } catch {
    return null; // e.g. simulator / no Google Play services
  }

  // Best-effort persist — a failure here must never block login.
  try {
    await supabase
      .from('users')
      .update({
        push_token: token,
        timezone: deviceTimeZone(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
  } catch {
    /* ignore */
  }

  return token;
}

/** Drop the token on sign-out so a logged-out device stops receiving pushes. */
export async function clearPushToken(userId: string): Promise<void> {
  try {
    await supabase.from('users').update({ push_token: null }).eq('id', userId);
  } catch {
    /* ignore */
  }
}
