/**
 * Cross-platform secure key/value storage.
 * Native (iOS/Android Expo Go): expo-secure-store (Keychain/Keystore).
 * Web: localStorage (SecureStore is unavailable on web).
 *
 * SecureStore key constraint: alphanumerics + . - _
 * All keys used here ('token', etc.) already comply.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const webStorage = {
  getItem: (k: string): string | null => {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(k) : null; } catch { return null; }
  },
  setItem: (k: string, v: string): void => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(k, v); } catch {/* ignore */}
  },
  removeItem: (k: string): void => {
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(k); } catch {/* ignore */}
  },
};

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webStorage.getItem(key);
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { webStorage.setItem(key, value); return; }
  try { await SecureStore.setItemAsync(key, value); } catch {/* ignore */}
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') { webStorage.removeItem(key); return; }
  try { await SecureStore.deleteItemAsync(key); } catch {/* ignore */}
}

export default { getItem, setItem, removeItem };
