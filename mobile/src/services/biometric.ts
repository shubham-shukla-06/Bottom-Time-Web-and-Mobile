/**
 * Wraps `expo-local-authentication` with a tiny purpose-built API.
 * Phase A: mobile biometric resume (2026-05-07).
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'generic';

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const hw = await LocalAuthentication.hasHardwareAsync();
    if (!hw) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return Boolean(enrolled);
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<BiometricKind> {
  if (Platform.OS === 'web') return 'generic';
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
  } catch { /* fallthrough */ }
  return 'generic';
}

export function biometricLabel(kind: BiometricKind): string {
  // iOS marketing names: Face ID / Touch ID. Android: just "Fingerprint".
  if (kind === 'face') return Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
  if (kind === 'fingerprint') return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
  if (kind === 'iris') return 'Iris';
  return 'Biometrics';
}

export type AuthResult = { success: true } | { success: false; error: string };

export async function authenticate(reason: string): Promise<AuthResult> {
  if (Platform.OS === 'web') return { success: false, error: 'web_unsupported' };
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      // No PIN/password fallback — we want the user to fall through to OTP
      // explicitly when biometrics are unavailable, not silently down-grade.
      disableDeviceFallback: true,
      cancelLabel: 'Use OTP instead',
    });
    if ((res as any).success) return { success: true };
    const errCode: string = (res as any).error || (res as any).warning || 'cancelled';
    return { success: false, error: String(errCode) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'unknown' };
  }
}
