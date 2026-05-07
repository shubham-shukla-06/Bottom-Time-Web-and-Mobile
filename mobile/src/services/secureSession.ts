/**
 * Secure storage for the long-lived refresh token + the device id.
 * Phase A: mobile biometric resume (2026-05-07).
 *
 *   - Refresh token is stored under SecureStore key REFRESH_TOKEN_KEY with
 *     `requireAuthentication: true` so reading it pops a Face ID / Touch ID
 *     / Fingerprint prompt on iOS (and an in-app biometric prompt on Android
 *     via the Keystore strongbox flag). On web the storage layer falls
 *     through to localStorage with no auth — biometrics aren't available.
 *
 *   - Device id is generated once per install and persisted under
 *     DEVICE_ID_KEY without biometric gating (the server only uses it as a
 *     stable handle for the session row).
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'bt_refresh_token';
const DEVICE_ID_KEY = 'bt_device_id';
const BIOMETRIC_FLAG_KEY = 'bt_biometric_enabled';
const BIOMETRIC_SKIP_AT_KEY = 'bt_biometric_skipped_at';
const SESSION_ID_KEY = 'bt_session_id';

const SKIP_REPROMPT_DAYS = 14;


// ---------------------------------------------------------------------------
// Web-localStorage shim (mirrors src/utils/storage.ts behaviour).
// ---------------------------------------------------------------------------
function webGet(k: string): string | null {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(k) : null; } catch { return null; }
}
function webSet(k: string, v: string): void {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(k, v); } catch {/* ignore */}
}
function webDel(k: string): void {
  try { if (typeof window !== 'undefined') window.localStorage.removeItem(k); } catch {/* ignore */}
}


// ---------------------------------------------------------------------------
// Refresh token (biometric-gated on native).
// ---------------------------------------------------------------------------
export async function storeRefreshToken(token: string): Promise<void> {
  if (Platform.OS === 'web') { webSet(REFRESH_TOKEN_KEY, token); return; }
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: 'Authenticate to enable biometric login',
  });
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webGet(REFRESH_TOKEN_KEY);
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Sign in to Bottom Time',
    });
  } catch {
    return null;
  }
}

export async function clearRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') { webDel(REFRESH_TOKEN_KEY); return; }
  try { await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY); } catch {/* ignore */}
}


// ---------------------------------------------------------------------------
// Stable device id (one per install).
// ---------------------------------------------------------------------------
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = Platform.OS === 'web' ? webGet(DEVICE_ID_KEY) : await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  if (existing) return existing;
  const id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  if (Platform.OS === 'web') webSet(DEVICE_ID_KEY, id);
  else await SecureStore.setItemAsync(DEVICE_ID_KEY, id).catch(() => {/* ignore */});
  return id;
}


// ---------------------------------------------------------------------------
// Biometric flag + 'skipped' timer (so we don't re-prompt for ~14 days).
// ---------------------------------------------------------------------------
export async function setBiometricEnabled(v: boolean): Promise<void> {
  const s = v ? '1' : '0';
  if (Platform.OS === 'web') webSet(BIOMETRIC_FLAG_KEY, s);
  else await SecureStore.setItemAsync(BIOMETRIC_FLAG_KEY, s).catch(() => {/* ignore */});
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = Platform.OS === 'web'
    ? webGet(BIOMETRIC_FLAG_KEY)
    : await SecureStore.getItemAsync(BIOMETRIC_FLAG_KEY).catch(() => null);
  return v === '1';
}

export async function markEnrollmentSkipped(): Promise<void> {
  const ts = String(Date.now());
  if (Platform.OS === 'web') webSet(BIOMETRIC_SKIP_AT_KEY, ts);
  else await SecureStore.setItemAsync(BIOMETRIC_SKIP_AT_KEY, ts).catch(() => {/* ignore */});
}

export async function shouldOfferEnrollment(): Promise<boolean> {
  const v = Platform.OS === 'web'
    ? webGet(BIOMETRIC_SKIP_AT_KEY)
    : await SecureStore.getItemAsync(BIOMETRIC_SKIP_AT_KEY).catch(() => null);
  if (!v) return true;
  const ts = Number(v);
  if (!Number.isFinite(ts)) return true;
  const days = (Date.now() - ts) / (24 * 60 * 60 * 1000);
  return days >= SKIP_REPROMPT_DAYS;
}


// ---------------------------------------------------------------------------
// Session id (stable across rotations; informational for "is_current" UI).
// ---------------------------------------------------------------------------
export async function setSessionId(id: string | null): Promise<void> {
  if (id === null) {
    if (Platform.OS === 'web') webDel(SESSION_ID_KEY);
    else await SecureStore.deleteItemAsync(SESSION_ID_KEY).catch(() => {/* ignore */});
    return;
  }
  if (Platform.OS === 'web') webSet(SESSION_ID_KEY, id);
  else await SecureStore.setItemAsync(SESSION_ID_KEY, id).catch(() => {/* ignore */});
}

export async function getSessionId(): Promise<string | null> {
  return Platform.OS === 'web'
    ? webGet(SESSION_ID_KEY)
    : await SecureStore.getItemAsync(SESSION_ID_KEY).catch(() => null);
}


// ---------------------------------------------------------------------------
// Bulk wipe — used by logout / revoke-all.
// ---------------------------------------------------------------------------
export async function wipeBiometricSession(): Promise<void> {
  await clearRefreshToken();
  await setBiometricEnabled(false);
  await setSessionId(null);
}
