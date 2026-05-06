/**
 * OAuth helpers for Google + Microsoft using expo-auth-session (PKCE).
 *
 * Both providers reuse the same backend endpoints the web uses:
 *   - POST /api/auth/social/google-code   { code, code_verifier, redirect_uri }
 *   - POST /api/auth/social/microsoft-token { id_token }
 *
 * Native (Expo Go): redirectUri = https://auth.expo.io/@anonymous/<slug>  (AuthSession proxy)
 *                   or your app's custom scheme (`mobile://...`) if standalone
 * Web:              redirectUri = window.location.origin + '/auth/callback'
 *
 * IMPORTANT — provider console registration required:
 *   The redirect URIs above MUST be allow-listed in the Google + MS consoles
 *   for the consent flow to succeed. The Expo Go proxy URL prints to the
 *   console at runtime — copy it from the log, add to Google/MS consoles.
 */
import * as AuthSession from 'expo-auth-session';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import api from '../api/client';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const MS_CLIENT_ID = process.env.EXPO_PUBLIC_MS_CLIENT_ID || '';

const googleDiscovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const msDiscovery = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

export interface SocialResult {
  status: 'logged_in' | 'needs_setup' | 'error' | 'cancelled';
  access_token?: string;
  user?: any;
  email?: string;
  name?: string;
  provider?: 'google' | 'microsoft';
  error?: string;
}

function buildRedirectUri(): string {
  // Web: use current origin + /auth/callback (matches what's already registered)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin + '/auth/callback';
  }
  // Native: AuthSession proxy (works in Expo Go without custom scheme registration)
  return makeRedirectUri({ scheme: 'mobile', path: 'auth/callback' });
}

/* ----------------------------- GOOGLE ----------------------------- */
export async function startGoogleSignIn(): Promise<SocialResult> {
  if (!GOOGLE_CLIENT_ID) {
    return { status: 'error', error: 'Google client ID not configured (EXPO_PUBLIC_GOOGLE_CLIENT_ID)' };
  }
  const redirectUri = buildRedirectUri();
  // eslint-disable-next-line no-console
  console.log('[oauth] Google redirectUri =', redirectUri);

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
    return { status: 'error', error: (result as any).params?.error_description || 'Google sign-in failed' };
  }

  try {
    const res = await api.post('/auth/social/google-code', {
      code: result.params.code,
      code_verifier: request.codeVerifier,
      redirect_uri: redirectUri,
    });
    return mapBackendResponse(res.data, 'google');
  } catch (e: any) {
    return { status: 'error', error: e?.response?.data?.detail || 'Google login failed at backend' };
  }
}

/* --------------------------- MICROSOFT --------------------------- */
export async function startMicrosoftSignIn(): Promise<SocialResult> {
  if (!MS_CLIENT_ID) {
    return { status: 'error', error: 'Microsoft client ID not configured (EXPO_PUBLIC_MS_CLIENT_ID)' };
  }
  const redirectUri = buildRedirectUri();
  // eslint-disable-next-line no-console
  console.log('[oauth] Microsoft redirectUri =', redirectUri);

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
    return { status: 'error', error: (result as any).params?.error_description || 'Microsoft sign-in failed' };
  }

  // Exchange code -> id_token directly with Microsoft (web does the same; SPA token endpoint)
  try {
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
      return { status: 'error', error: tokenData.error_description || tokenData.error || 'Microsoft token exchange failed' };
    }
    const res = await api.post('/auth/social/microsoft-token', { id_token: tokenData.id_token });
    return mapBackendResponse(res.data, 'microsoft');
  } catch (e: any) {
    return { status: 'error', error: e?.response?.data?.detail || e?.message || 'Microsoft login failed' };
  }
}

function mapBackendResponse(data: any, provider: 'google' | 'microsoft'): SocialResult {
  if (data?.status === 'logged_in' || data?.access_token) {
    return { status: 'logged_in', access_token: data.access_token, user: data.user, provider };
  }
  if (data?.status === 'needs_setup') {
    return { status: 'needs_setup', email: data.email, name: data.name, provider };
  }
  return { status: 'error', error: 'Unexpected response from backend' };
}
