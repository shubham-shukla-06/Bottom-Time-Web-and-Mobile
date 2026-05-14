/**
 * OAuth helpers — lazy-loaded so a missing native module (e.g. ExpoCryptoAES
 * inside expo-auth-session/expo-crypto) does NOT crash the auth screen on
 * Expo Go. Imports happen inside the function body, wrapped in try/catch.
 *
 * Web + properly-aligned native builds: full PKCE flows for Google + MS,
 * mirroring the web auth callback (POST /auth/social/google-code,
 * POST /auth/social/microsoft-token).
 */
import { Platform } from 'react-native';
import api from '../api/client';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const MS_CLIENT_ID = process.env.EXPO_PUBLIC_MS_CLIENT_ID || '';

const googleDiscovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
const msDiscovery = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

export interface SocialResult {
  status: 'logged_in' | 'needs_setup' | 'error' | 'cancelled' | 'unsupported';
  access_token?: string;
  user?: any;
  email?: string;
  name?: string;
  provider?: 'google' | 'microsoft' | 'apple';
  error?: string;
  // Populated only on `logged_in` — mirrors the web Apple flow so the mobile
  // authStore can persist the refresh token + session id for biometric-resume.
  refresh_token?: string | null;
  session_id?: string | null;
  refresh_expires_at?: number | string | null;
}

/**
 * Indicates whether OAuth is available in this runtime. expo-auth-session
 * requires expo-crypto's native module which is not bundled in some Expo Go
 * builds. Returns false on those — the UI hides social buttons in that case.
 */
export async function oauthSupported(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AuthSession: any = await import('expo-auth-session');
    // Touching ResponseType triggers the underlying native check.
    return !!AuthSession?.AuthRequest && !!AuthSession?.ResponseType;
  } catch {
    return false;
  }
}

async function buildRedirectUri(): Promise<string> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin + '/auth/callback';
  }
  const { makeRedirectUri } = await import('expo-auth-session');
  return makeRedirectUri({ scheme: 'mobile', path: 'auth/callback' });
}

export async function startGoogleSignIn(): Promise<SocialResult> {
  if (!GOOGLE_CLIENT_ID) return { status: 'error', error: 'Google client ID not configured' };
  let AuthSession: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AuthSession = await import('expo-auth-session');
    await import('expo-web-browser').then((m) => m.maybeCompleteAuthSession?.());
  } catch (e: any) {
    return { status: 'unsupported', error: e?.message || 'OAuth modules unavailable in Expo Go' };
  }

  const redirectUri = await buildRedirectUri();
  // eslint-disable-next-line no-console
  console.log('[oauth] Google redirectUri =', redirectUri);

  try {
    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { access_type: 'offline', prompt: 'select_account' },
    });
    await request.makeAuthUrlAsync(googleDiscovery);
    const result = await request.promptAsync(googleDiscovery);
    if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
    if (result.type !== 'success' || !result.params?.code) {
      return { status: 'error', error: result.params?.error_description || 'Google sign-in failed' };
    }
    const res = await api.post('/auth/social/google-code', {
      code: result.params.code,
      code_verifier: request.codeVerifier,
      redirect_uri: redirectUri,
    });
    return mapBackend(res.data, 'google');
  } catch (e: any) {
    return { status: 'error', error: e?.response?.data?.detail || e?.message || 'Google login failed' };
  }
}

export async function startMicrosoftSignIn(): Promise<SocialResult> {
  if (!MS_CLIENT_ID) return { status: 'error', error: 'Microsoft client ID not configured' };
  let AuthSession: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AuthSession = await import('expo-auth-session');
    await import('expo-web-browser').then((m) => m.maybeCompleteAuthSession?.());
  } catch (e: any) {
    return { status: 'unsupported', error: e?.message || 'OAuth modules unavailable in Expo Go' };
  }

  const redirectUri = await buildRedirectUri();
  // eslint-disable-next-line no-console
  console.log('[oauth] Microsoft redirectUri =', redirectUri);

  try {
    const request = new AuthSession.AuthRequest({
      clientId: MS_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { prompt: 'select_account' },
    });
    await request.makeAuthUrlAsync(msDiscovery);
    const result = await request.promptAsync(msDiscovery);
    if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
    if (result.type !== 'success' || !result.params?.code) {
      return { status: 'error', error: result.params?.error_description || 'Microsoft sign-in failed' };
    }
    const tokenResp = await fetch(msDiscovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        code: result.params.code,
        code_verifier: request.codeVerifier || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid profile email',
      }).toString(),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.id_token) {
      return { status: 'error', error: tokenData.error_description || 'Microsoft token exchange failed' };
    }
    const res = await api.post('/auth/social/microsoft-token', { id_token: tokenData.id_token });
    return mapBackend(res.data, 'microsoft');
  } catch (e: any) {
    return { status: 'error', error: e?.response?.data?.detail || e?.message || 'Microsoft login failed' };
  }
}

function mapBackend(data: any, provider: 'google' | 'microsoft' | 'apple'): SocialResult {
  if (data?.status === 'logged_in' || data?.access_token) {
    return {
      status: 'logged_in',
      access_token: data.access_token,
      user: data.user,
      refresh_token: data.refresh_token,
      session_id: data.session_id,
      refresh_expires_at: data.refresh_expires_at,
      provider,
    };
  }
  if (data?.status === 'needs_setup') {
    return { status: 'needs_setup', email: data.email, name: data.name, provider };
  }
  return { status: 'error', error: 'Unexpected response from backend' };
}

/** Posts the Apple identity token to /auth/social/apple-token; backend verifies via JWKS. */
export async function startAppleSignIn(): Promise<SocialResult> {
  if (Platform.OS !== 'ios') {
    return { status: 'unsupported', error: 'Apple sign-in is iOS-only.' };
  }
  let AppleAuth: any;
  try {
    AppleAuth = await import('expo-apple-authentication');
  } catch (e: any) {
    return { status: 'unsupported', error: 'Apple sign-in not available in this build.' };
  }
  try {
    const available = await AppleAuth.isAvailableAsync?.();
    if (!available) return { status: 'unsupported', error: 'Apple sign-in not available on this device.' };

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential?.identityToken) {
      return { status: 'error', error: 'Apple did not return an identity token.' };
    }
    const res = await api.post('/auth/social/apple-token', {
      identity_token: credential.identityToken,
      authorization_code: credential.authorizationCode,
      full_name: credential.fullName ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim() : undefined,
      email: credential.email,
    });
    return mapBackend(res.data, 'apple');
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') {
      return { status: 'cancelled' };
    }
    // Backend stub returns 501 — surface its message.
    const msg = e?.response?.data?.detail || e?.message || 'Apple sign-in failed.';
    return { status: 'error', error: msg };
  }
}
