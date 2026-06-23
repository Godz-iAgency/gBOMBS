/**
 * Cross-platform dialogs.
 * ------------------------------------------------------------------
 * react-native-web's `Alert` is a NO-OP — on web it silently does nothing, so
 * any confirmation built on `Alert.alert([... buttons])` never fires its
 * handlers (this is why the "Cancel invite" button appeared dead on web).
 * These helpers fall back to the browser's native `window.alert`/`window.confirm`
 * on web and use `Alert` on native.
 */
import { Alert, Platform } from 'react-native';

/** A simple message box. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

/** A yes/no confirmation. Resolves true only if the user confirms. */
export function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    destructive = false,
  } = opts;

  if (Platform.OS === 'web') {
    return Promise.resolve(
      window.confirm(message ? `${title}\n\n${message}` : title)
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
