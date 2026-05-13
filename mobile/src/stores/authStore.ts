import { create } from 'zustand';
import { Platform } from 'react-native';
import storage from '../utils/storage';
import api from '../api/client';
import {
  storeRefreshToken, getRefreshToken, clearRefreshToken,
  setBiometricEnabled, isBiometricEnabled,
  setSessionId, getSessionId,
  getOrCreateDeviceId, wipeBiometricSession,
} from '../services/secureSession';
import { authenticate } from '../services/biometric';
import { refreshSession, revokeSession } from '../api/sessionApi';
import useUIStore from './uiStore';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  onboarding_complete?: boolean;
  profile_photo?: string;
  location_country?: string;
  location_city?: string;
  certification_agency?: string;
  experience_level?: string;
  total_dives?: number;
  currency?: string;
  [key: string]: any;
}

export type SessionMintResult = {
  access_token: string;
  refresh_token?: string;
  session_id?: string;
  refresh_expires_at?: string;
  user: User;
};

export type ResumeOutcome = 'resumed' | 'no_session' | 'cancelled' | 'failed' | 'unsupported';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;       // in-memory only — secure-store is canonical
  sessionId: string | null;
  biometricEnabled: boolean;
  biometricFailCount: number;        // resets after each successful auth/launch
  loading: boolean;

  setUser: (u: User | null) => void;
  setLoading: (l: boolean) => void;

  /** Legacy entry point — used by the existing OTP flow in verify.tsx.
   *  Accepts the full token-response payload so we can persist refresh data
   *  when the mobile client requested a device session. */
  login: (tokenOrPayload: string | SessionMintResult, user?: User) => Promise<void>;

  /** Enroll the current session for biometric resume. Caller must already
   *  have a fresh refresh_token in `state.refreshToken` (from the mint). */
  enrollBiometric: () => Promise<{ success: boolean; error?: string }>;

  /** Disable biometrics — clears secure store but does NOT log the user out. */
  disableBiometric: () => Promise<void>;

  /** Called on app boot if biometricEnabled was true on the last launch.
   *  Prompts biometrics, reads the refresh token, calls /session/refresh,
   *  loads /auth/me. Returns an outcome the splash screen can act on. */
  tryBiometricResume: () => Promise<ResumeOutcome>;

  /** Manually rotate the access token using the in-memory refresh token. */
  refreshAccessToken: () => Promise<boolean>;

  /** Restore an authed state on cold-start using the access-token JWT in
   *  storage (legacy behaviour preserved). Used by _layout.tsx. */
  fetchCurrentUser: () => Promise<User | null>;

  logout: () => Promise<void>;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  sessionId: null,
  biometricEnabled: false,
  biometricFailCount: 0,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  login: async (tokenOrPayload, user) => {
    // Backwards compat: callers can pass `(token, user)` (legacy) or a single
    // payload object including refresh_token / session_id (new mobile flow).
    let access: string; let usr: User; let refreshToken: string | undefined;
    let sessionId: string | undefined; let _expiresAt: string | undefined;
    if (typeof tokenOrPayload === 'string') {
      access = tokenOrPayload; usr = user as User;
    } else {
      access = tokenOrPayload.access_token;
      usr = tokenOrPayload.user;
      refreshToken = tokenOrPayload.refresh_token;
      sessionId = tokenOrPayload.session_id;
      _expiresAt = tokenOrPayload.refresh_expires_at;
    }
    await storage.setItem('token', access);
    if (sessionId) await setSessionId(sessionId); else await setSessionId(null);
    set({ token: access, user: usr, refreshToken: refreshToken || null, sessionId: sessionId || null, loading: false });
    // Login implies a real account; clear any lingering guestMode
    // flag set by the welcome "Skip" button. Without this, Discover
    // remained sliced to GUEST_VISIBLE_COUNT (4) after the user
    // logged in via the Book Now -> Sign in flow.
    useUIStore.getState().setGuestMode(false);
  },

  enrollBiometric: async () => {
    const refresh = get().refreshToken;
    if (!refresh) return { success: false, error: 'no_refresh_token' };
    try {
      // requireAuthentication on iOS triggers Face ID/Touch ID at write time;
      // we already prompt explicitly in the enrollment sheet, so this write
      // is safe to fall through.
      await storeRefreshToken(refresh);
      await setBiometricEnabled(true);
      set({ biometricEnabled: true });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'storage_failed' };
    }
  },

  disableBiometric: async () => {
    await clearRefreshToken();
    await setBiometricEnabled(false);
    set({ biometricEnabled: false });
  },

  refreshAccessToken: async () => {
    const refresh = get().refreshToken;
    if (!refresh) return false;
    const deviceId = await getOrCreateDeviceId();
    try {
      const res = await refreshSession(refresh, deviceId);
      await storage.setItem('token', res.access_token);
      await setSessionId(res.session_id);
      set({ token: res.access_token, refreshToken: res.refresh_token, sessionId: res.session_id });
      // Persist the rotated refresh token if biometrics enabled
      if (get().biometricEnabled) {
        try { await storeRefreshToken(res.refresh_token); } catch {/* ignore */}
      }
      return true;
    } catch {
      return false;
    }
  },

  tryBiometricResume: async () => {
    if (Platform.OS === 'web') return 'unsupported';
    const enabled = await isBiometricEnabled();
    if (!enabled) return 'no_session';

    // Step 1 — biometric prompt.
    const auth = await authenticate('Sign in to Bottom Time');
    if (!auth.success) {
      const fc = get().biometricFailCount + 1;
      set({ biometricFailCount: fc });
      // 3 strikes — clear the flag client-side so we fall through to OTP
      // on the next launch (refresh token stays put on the server's side
      // because we don't have it here to revoke; server still enforces
      // expiry and the user will re-OTP, minting a fresh session).
      if (fc >= 3) {
        await wipeBiometricSession();
        set({ biometricEnabled: false, biometricFailCount: 0 });
        return 'failed';
      }
      return 'cancelled';
    }

    // Step 2 — read the refresh token (this also pops biometric prompt on
    // some platforms but we just authed so the OS treats it as fresh).
    const refresh = await getRefreshToken();
    if (!refresh) {
      await wipeBiometricSession();
      set({ biometricEnabled: false });
      return 'no_session';
    }

    // Step 3 — exchange for a fresh access token.
    const deviceId = await getOrCreateDeviceId();
    try {
      const res = await refreshSession(refresh, deviceId);
      await storage.setItem('token', res.access_token);
      await setSessionId(res.session_id);
      try { await storeRefreshToken(res.refresh_token); } catch {/* ignore */}

      // Step 4 — pull /auth/me so we have a User object before navigating.
      const me = await api.get('/auth/me').then((r) => r.data).catch(() => null);
      if (!me) {
        await wipeBiometricSession();
        set({ biometricEnabled: false });
        return 'failed';
      }
      set({
        token: res.access_token,
        refreshToken: res.refresh_token,
        sessionId: res.session_id,
        user: me,
        biometricFailCount: 0,
        loading: false,
      });
      return 'resumed';
    } catch (e: any) {
      // Server rejected — most likely session_revoked / session_expired.
      // Drop the local credential so the next launch starts clean.
      await wipeBiometricSession();
      set({ biometricEnabled: false, refreshToken: null, sessionId: null });
      return 'failed';
    }
  },

  fetchCurrentUser: async () => {
    const token = await storage.getItem('token');
    const sessionId = await getSessionId();
    const enabled = await isBiometricEnabled();
    set({ biometricEnabled: enabled, sessionId });
    if (!token) {
      set({ loading: false, token: null });
      return null;
    }
    set({ token });
    try {
      const res = await api.get('/auth/me');
      set({ user: res.data, loading: false });
      return res.data;
    } catch {
      await storage.removeItem('token');
      set({ token: null, user: null, loading: false });
      return null;
    }
  },

  logout: async () => {
    const sessionId = get().sessionId;
    // Best-effort revoke server-side; the bearer is still valid here.
    try { if (sessionId) await revokeSession(sessionId); } catch {/* ignore */}
    await storage.removeItem('token');
    await wipeBiometricSession();
    set({ token: null, user: null, refreshToken: null, sessionId: null, biometricEnabled: false });
  },
}));

export default useAuthStore;
