// Phase B (web passkeys) — webauthnClient.js
//
// Thin wrapper around `@simplewebauthn/browser` + axios.
// Browser-side helpers: register a new passkey, authenticate with one,
// list and delete passkeys.
//
// All axios calls go through the shared default instance — that means
// the 401 refresh-token interceptor (configured in stores/authStore.js)
// applies automatically to every authenticated call here.

import axios from 'axios';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { buildDevicePayload } from './deviceInfo';

export function passkeysSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  );
}

// ---- Registration --------------------------------------------------------

export async function registerPasskey({ label } = {}) {
  if (!passkeysSupported()) throw new Error('passkeys_unsupported');

  const beginRes = await axios.post('/auth/webauthn/register/begin', {});
  const options = beginRes.data;

  // startRegistration may throw NotAllowedError if user dismisses; let it
  // bubble so callers can no-op. Other errors are surfaced as well.
  const attResp = await startRegistration({ optionsJSON: options });

  const finishRes = await axios.post('/auth/webauthn/register/finish', {
    response: attResp,
    label: label || undefined,
  });
  return finishRes.data; // {passkey_id, label, created_at, device_type, backed_up}
}

// ---- Authentication ------------------------------------------------------

export async function authenticatePasskey({ email } = {}) {
  if (!passkeysSupported()) throw new Error('passkeys_unsupported');

  // Fire begin without an Authorization header (public endpoint). axios
  // default header propagates if a stale token is set; clear for this one
  // call to keep the response shape clean.
  const begin = await axios.post(
    '/auth/webauthn/login/begin',
    email ? { email } : {},
  );
  const options = begin.data;

  const assertionResp = await startAuthentication({ optionsJSON: options });

  const finishRes = await axios.post('/auth/webauthn/login/finish', {
    response: assertionResp,
    device: buildDevicePayload(),
  });
  return finishRes.data; // {access_token, user, refresh_token, session_id, ...}
}

// ---- Management ----------------------------------------------------------

export async function listPasskeys() {
  const r = await axios.get('/auth/webauthn/passkeys');
  return r.data?.passkeys || [];
}

export async function deletePasskey(passkeyId) {
  const r = await axios.delete(`/auth/webauthn/passkeys/${passkeyId}`);
  return r.data;
}

// ---- Sessions (Phase A endpoints — reused in the web Security screen) ----

export async function listSessions() {
  const sid = (() => {
    try { return localStorage.getItem('bt:session_id') || ''; } catch { return ''; }
  })();
  const r = await axios.get('/auth/sessions', {
    params: sid ? { session_id: sid } : {},
  });
  return r.data?.sessions || [];
}

export async function revokeSession(sessionId) {
  const r = await axios.post('/auth/session/revoke', { session_id: sessionId });
  return r.data;
}

export async function revokeAllSessions() {
  const r = await axios.post('/auth/session/revoke-all');
  return r.data;
}
