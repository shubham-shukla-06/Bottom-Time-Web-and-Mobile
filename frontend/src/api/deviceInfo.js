// Phase B (web passkeys / refresh-token) — deviceInfo.js
//
// Web counterpart of the mobile `deviceInfo` payload. Generates a stable
// per-browser/per-install UUID (kept in localStorage) and a friendly device
// name parsed from user-agent. Used as the `device` body field on:
//   • /api/auth/login-complete
//   • /api/auth/signup-complete
//   • /api/auth/social/signup-complete
//   • /api/auth/webauthn/login/finish
//
// The backend treats `device` as optional; sending it mints a device_session
// row + refresh token in the response. Web must always send it now that
// ACCESS_TOKEN_EXPIRE is 60 min and we rely on the refresh interceptor.

const DEVICE_ID_KEY = 'bt:device_id';

function uuidv4() {
  // Prefer crypto.randomUUID (available in all evergreens we support).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (RFC 4122 v4)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage may be unavailable (private mode in some browsers).
    return uuidv4();
  }
}

export function getDeviceName() {
  const ua = (navigator.userAgent || '').toLowerCase();
  let device = 'Browser';
  if (/iphone/.test(ua)) device = 'iPhone';
  else if (/ipad/.test(ua)) device = 'iPad';
  else if (/macintosh|mac os x/.test(ua)) device = 'Mac';
  else if (/android/.test(ua)) device = 'Android';
  else if (/windows/.test(ua)) device = 'Windows';
  else if (/linux/.test(ua)) device = 'Linux';

  let browser = '';
  if (/edg\//.test(ua)) browser = 'Edge';
  else if (/chrome\//.test(ua) && !/edg\//.test(ua)) browser = 'Chrome';
  else if (/firefox\//.test(ua)) browser = 'Firefox';
  else if (/safari\//.test(ua) && !/chrome\//.test(ua)) browser = 'Safari';

  return browser ? `${device} (${browser})` : device;
}

export function buildDevicePayload() {
  return {
    device_id: getDeviceId(),
    device_name: getDeviceName(),
    platform: 'web',
    biometric_enabled: false,
  };
}
