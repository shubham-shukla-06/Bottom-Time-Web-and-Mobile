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
  return {
    ...finishRes.data,
    credentialId: attResp?.id,
  }; // {passkey_id, label, created_at, device_type, backed_up, credentialId}
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

// ---- "Passkey on this device" flag ---------------------------------------
// Storage key + helpers for the "is there a passkey enrolled on THIS
// device?" flag. The value stored is the credential ID returned by the
// platform authenticator on successful registration (falls back to '1' if
// the caller doesn't have it on hand). Empty / missing = no passkey.
//
// Set when:
//   • register/finish succeeds on this browser
//   • post-login `GET /auth/me/has-passkey` returns true
//
// Cleared when:
//   • the user removes the matching passkey from the Security screen
//   • full logout (we re-set it from the post-login hook on next login
//     if there's still a synced passkey available)

const FLAG_KEY = 'bt_passkey_device_id';

export function hasPasskeyOnDeviceFlag() {
  try { return !!(localStorage.getItem(FLAG_KEY) || '').trim(); } catch { return false; }
}

// Accepts the credential ID returned by the browser authenticator (or any
// truthy identifier the caller has). Falls back to '1' so the flag still
// reads "present" even when no ID is supplied.
export function setPasskeyOnDeviceFlag(credentialId) {
  try { localStorage.setItem(FLAG_KEY, credentialId || '1'); } catch { /* noop */ }
}

export function getPasskeyOnDeviceFlag() {
  try { return localStorage.getItem(FLAG_KEY) || ''; } catch { return ''; }
}

export function clearPasskeyOnDeviceFlag() {
  try { localStorage.removeItem(FLAG_KEY); } catch { /* noop */ }
}

/**
 * Lightweight server probe. Used by the post-login hook to decide whether
 * to show the enrollment prompt. Falls back to `listPasskeys().length` if
 * the new endpoint isn't available yet (older backend). Returns:
 *   true  — user has at least one active passkey server-side
 *   false — user has zero
 *   null  — request failed
 */
export async function fetchServerHasPasskey() {
  try {
    const r = await axios.get('/auth/me/has-passkey');
    return !!r.data?.has_passkey;
  } catch {
    try {
      const list = await listPasskeys();
      return Array.isArray(list) && list.length > 0;
    } catch {
      return null;
    }
  }
}

/**
 * Post-login QoL hook: sync the local "passkey on this device" flag with
 * the server's truth. Returns the server-side boolean (or null on failure
 * — caller should treat null as "don't change UX"). If the server says
 * the user has at least one passkey but we don't have a credential ID in
 * local storage yet, store '1' as a presence marker.
 */
export async function syncPasskeyFlagFromServer() {
  const has = await fetchServerHasPasskey();
  if (has === true && !hasPasskeyOnDeviceFlag()) setPasskeyOnDeviceFlag();
  // NB: we deliberately do NOT clear the flag when the server says false —
  // the OS still has the passkey in its keychain on this exact device, and
  // clearing would hide a usable affordance. The flag is only cleared from
  // the Security screen (explicit user removal).
  return has;
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
