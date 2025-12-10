import { Alert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

/**
 * Platform-safe alert helper.
 * - Native: delegates to Alert.alert with provided buttons/options.
 * - Web: falls back to window.alert and invokes the first button + onDismiss callbacks.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
): void {
  if (Platform.OS === 'web') {
    const content = [title, message].filter(Boolean).join('\n\n');
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(content);
    }
    // Simulate primary button press and onDismiss in web fallback
    if (buttons?.[0]?.onPress) {
      try {
        buttons[0].onPress();
      } catch (error) {
        console.error('showAlert web button handler error', error);
      }
    }
    if (options?.onDismiss) {
      try {
        options.onDismiss();
      } catch (error) {
        console.error('showAlert web onDismiss error', error);
      }
    }
    return;
  }

  Alert.alert(title, message, buttons, options);
}
