import { create } from 'zustand';
import axios from 'axios';
import { buildDevicePayload, getDeviceId } from '../api/deviceInfo';

// ---- Storage keys --------------------------------------------------------
// Access token stays in sessionStorage (existing behavior — not auto-shared
// across tabs). Refresh token + session id move to localStorage so they
// survive tab reloads and let us bootstrap an access token before the first
// API call.
const ACCESS_KEY = 'token';
const REFRESH_KEY = 'bt:refresh_token';
const SESSION_ID_KEY = 'bt:session_id';
const REFRESH_EXP_KEY = 'bt:refresh_expires_at';

const readSession = (k) => {
  try { return sessionStorage.getItem(k); } catch { return null; }
};
const readLocal = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const writeSession = (k, v) => {
  try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* noop */ }
};
const writeLocal = (k, v) => {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* noop */ }
};

function applyAuthHeader(token) {
  if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete axios.defaults.headers.common['Authorization'];
  // Activity bookkeeping: server's get_current_user reads this header and
  // throttle-updates device_sessions.last_used_at so the 'Active sessions'
  // card reflects real activity (otherwise rows show the timestamp of the
  // last refresh-token rotation, which can be tens of minutes stale).
  try {
    const sid = localStorage.getItem(SESSION_ID_KEY);
    if (sid) axios.defaults.headers.common['X-Session-Id'] = sid;
    else delete axios.defaults.headers.common['X-Session-Id'];
  } catch { /* noop */ }
}

function persistTokens({ access_token, refresh_token, session_id, refresh_expires_at }) {
  if (access_token !== undefined) writeSession(ACCESS_KEY, access_token);
  if (refresh_token !== undefined) writeLocal(REFRESH_KEY, refresh_token);
  if (session_id !== undefined) writeLocal(SESSION_ID_KEY, session_id);
  if (refresh_expires_at !== undefined) writeLocal(REFRESH_EXP_KEY, refresh_expires_at);
}

function clearTokens() {
  writeSession(ACCESS_KEY, null);
  writeLocal(REFRESH_KEY, null);
  writeLocal(SESSION_ID_KEY, null);
  writeLocal(REFRESH_EXP_KEY, null);
}

// ---- Refresh token flow --------------------------------------------------
// Single-flight refresh: many concurrent 401s share one in-flight refresh
// promise so we don't hit /session/refresh in parallel.
let inflightRefresh = null;

async function performRefresh() {
  const refresh_token = readLocal(REFRESH_KEY);
  if (!refresh_token) throw new Error('no_refresh_token');
  const device_id = getDeviceId();
  // Bypass the default Authorization header — refresh is a public endpoint
  // keyed by the refresh token itself; sending a stale bearer is harmless
  // but unnecessary.
  const res = await axios.post(
    '/auth/session/refresh',
    { refresh_token, device_id },
    { _skipAuthRefresh: true },
  );
  const data = res.data || {};
  persistTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    session_id: data.session_id,
    refresh_expires_at: data.refresh_expires_at,
  });
  applyAuthHeader(data.access_token);
  return data.access_token;
}

function refreshOnce() {
  if (!inflightRefresh) {
    inflightRefresh = performRefresh().finally(() => { inflightRefresh = null; });
  }
  return inflightRefresh;
}

let interceptorInstalled = false;

/**
 * Install the global axios 401 interceptor. Runs on app boot from App.js.
 * Retries the original request once after a successful refresh; if the
 * refresh itself 401s, the user is logged out.
 */
export function installAuthInterceptor() {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error?.config;
      const status = error?.response?.status;
      if (status !== 401 || !original || original._skipAuthRefresh || original._retried) {
        return Promise.reject(error);
      }
      // Don't try to refresh on the refresh endpoint itself.
      const url = String(original.url || '');
      if (url.includes('/auth/session/refresh')) return Promise.reject(error);

      // No refresh token → can't recover.
      if (!readLocal(REFRESH_KEY)) return Promise.reject(error);

      original._retried = true;
      try {
        const fresh = await refreshOnce();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${fresh}`;
        return axios(original);
      } catch (refreshErr) {
        // Refresh failed (revoked / expired / device mismatch). Log out.
        try { useAuthStore.getState().logout({ skipServerRevoke: true }); } catch { /* noop */ }
        return Promise.reject(refreshErr);
      }
    },
  );
}

// ---- Zustand store -------------------------------------------------------

const useAuthStore = create((set, get) => ({
  user: null,
  token: readSession(ACCESS_KEY),
  loading: true,

  setUser: (user) => set({ user }),

  /**
   * Hydrate from a backend auth response. Supports both legacy shape
   * (token + user) and Phase B shape (refresh_token + session_id).
   */
  login: (accessToken, userData, extras = {}) => {
    persistTokens({
      access_token: accessToken,
      refresh_token: extras.refresh_token,
      session_id: extras.session_id,
      refresh_expires_at: extras.refresh_expires_at,
    });
    applyAuthHeader(accessToken);
    set({ token: accessToken, user: userData });
    if (userData?.currency) {
      import('./uiStore').then(m => {
        try { localStorage.setItem('bt_currency', userData.currency); } catch { /* noop */ }
        m.default.setState({ currency: userData.currency });
      });
    }
    import('./cartStore').then(m => m.default.getState().refreshCart());
    import('../lib/queryClient').then(m => m.default.clear());
  },

  logout: async (opts = {}) => {
    const sid = readLocal(SESSION_ID_KEY);
    const access = readSession(ACCESS_KEY);
    // Best-effort server revoke when we have both pieces. Skipped on the
    // forced-logout path (refresh failure) where the session is already
    // dead server-side.
    if (!opts.skipServerRevoke && sid && access) {
      try {
        await axios.post('/auth/session/revoke', { session_id: sid }, {
          headers: { Authorization: `Bearer ${access}` },
          _skipAuthRefresh: true,
        });
      } catch { /* don't block local logout */ }
    }
    clearTokens();
    // NOTE: deliberately NOT clearing `bt:passkey_on_device` here — the
    // passkey itself lives in the OS keychain (Touch ID / Windows Hello /
    // iCloud / Google Password Manager) and survives our logout. The flag
    // is cleared only when the user deletes their last passkey from the
    // Security screen.
    applyAuthHeader(null);
    set({ token: null, user: null });
    import('./cartStore').then(m => m.default.getState().clearCart());
    import('../lib/queryClient').then(m => m.default.clear());
  },

  fetchCurrentUser: async () => {
    let token = readSession(ACCESS_KEY);
    // Bootstrap path: tab was reopened so sessionStorage is empty, but a
    // refresh token survives in localStorage → mint a new access token
    // before the very first /auth/me call.
    if (!token && readLocal(REFRESH_KEY)) {
      try {
        token = await refreshOnce();
        set({ token });
      } catch {
        clearTokens();
        applyAuthHeader(null);
        set({ token: null, user: null, loading: false });
        return null;
      }
    }
    if (!token) { set({ loading: false }); return null; }
    applyAuthHeader(token);
    try {
      const res = await axios.get('/auth/me');
      set({ user: res.data, loading: false });
      if (res.data?.currency) {
        const uiStore = (await import('./uiStore')).default;
        try { localStorage.setItem('bt_currency', res.data.currency); } catch { /* noop */ }
        uiStore.setState({ currency: res.data.currency });
      }
      return res.data;
    } catch {
      // Interceptor already attempted a refresh; if we get here it failed.
      get().logout({ skipServerRevoke: true });
      set({ loading: false });
      return null;
    }
  },

  setLoading: (loading) => set({ loading }),
}));

// Re-export so callers (useAuthFlow, social auth callback, etc.) can pull
// the device payload without importing deviceInfo themselves.
export { buildDevicePayload };

export default useAuthStore;
