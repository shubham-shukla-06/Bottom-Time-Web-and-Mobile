/**
 * Typed client for /api/auth/session/* endpoints.
 * Phase A — mobile biometric resume (2026-05-07).
 */
import api from './client';

export type SessionRow = {
  session_id: string;
  device_name: string;
  platform: 'ios' | 'android' | 'web';
  biometric_enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  is_current: boolean;
};

export type RefreshResponse = {
  access_token: string;
  token_type: string;
  refresh_token: string;
  session_id: string;
  refresh_expires_at: string;
};

/** Errors returned in `detail` on 401 from /session/refresh. */
export type RefreshErrorCode =
  | 'invalid_token' | 'session_revoked' | 'session_expired' | 'device_mismatch';

export async function refreshSession(refreshToken: string, deviceId: string): Promise<RefreshResponse> {
  const r = await api.post('/auth/session/refresh', {
    refresh_token: refreshToken,
    device_id: deviceId,
  });
  return r.data as RefreshResponse;
}

export async function revokeSession(sessionId: string): Promise<{ revoked: boolean }> {
  const r = await api.post('/auth/session/revoke', { session_id: sessionId });
  return r.data;
}

export async function revokeAllSessions(): Promise<{ revoked_count: number }> {
  const r = await api.post('/auth/session/revoke-all');
  return r.data;
}

export async function listSessions(currentSessionId?: string | null): Promise<SessionRow[]> {
  const r = await api.get('/auth/sessions', {
    params: currentSessionId ? { session_id: currentSessionId } : undefined,
  });
  return (r.data?.sessions ?? []) as SessionRow[];
}
