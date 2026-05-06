import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * Cross-platform confirm dialog. On native, uses Alert.alert with two buttons.
 * On Expo Web, uses window.confirm (since react-native-web's Alert.alert with
 * multiple buttons does not reliably surface choice callbacks).
 *
 * Returns Promise<boolean> — resolves true if user confirmed, false otherwise.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    destructive = false,
  } = opts;

  return new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
        resolve(false);
        return;
      }
      const text = message ? `${title}\n\n${message}` : title;
      // eslint-disable-next-line no-alert
      resolve(window.confirm(text));
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
