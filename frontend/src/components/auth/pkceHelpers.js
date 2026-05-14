export function generateCodeVerifier() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function initiateGoogleAuth() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateCodeVerifier();
  sessionStorage.setItem('google_code_verifier', verifier);
  sessionStorage.setItem('google_state', state);
  const redirectUri = window.location.origin + '/auth/callback';
  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'select_account');
  window.location.href = authUrl.toString();
}

export async function initiateMSAuth() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateCodeVerifier();
  sessionStorage.setItem('ms_code_verifier', verifier);
  sessionStorage.setItem('ms_state', state);
  const redirectUri = window.location.origin + '/auth/callback';
  const clientId = process.env.REACT_APP_MS_CLIENT_ID;
  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('prompt', 'select_account');
  window.location.href = authUrl.toString();
}


/**
 * Apple Sign-in (web). Uses Apple's public Sign-in JS via popup mode.
 * Backend stub at POST /api/auth/social/apple-token returns 501 until
 * the operator wires Apple credentials. We surface that 501 as a friendly
 * "coming soon" alert.
 */
export async function initiateAppleAuth() {
  const ensureScript = () =>
    new Promise((resolve, reject) => {
      if (window.AppleID) return resolve(window.AppleID);
      const s = document.createElement('script');
      s.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
      s.async = true;
      s.onload = () => resolve(window.AppleID);
      s.onerror = () => reject(new Error('Failed to load Apple Sign-in JS.'));
      document.head.appendChild(s);
    });

  try {
    const AppleID = await ensureScript();
    const clientId = process.env.REACT_APP_APPLE_CLIENT_ID || 'com.bottom-time.web';
    AppleID.auth.init({
      clientId,
      scope: 'name email',
      redirectURI: window.location.origin + '/auth/callback',
      usePopup: true,
    });
    let resp;
    try {
      resp = await AppleID.auth.signIn();
    } catch (err) {
      if (err?.error === 'popup_closed_by_user' || err?.error === 'user_cancelled_authorize') return;
      throw err;
    }
    const idToken = resp?.authorization?.id_token;
    if (!idToken) throw new Error('Apple did not return an identity token.');

    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL || ''}/api/auth/social/apple-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity_token: idToken,
        authorization_code: resp.authorization?.code,
        full_name: resp.user ? `${resp.user.name?.firstName || ''} ${resp.user.name?.lastName || ''}`.trim() : undefined,
        email: resp.user?.email,
      }),
    });
    if (res.status === 501) {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.detail || 'Apple sign-in coming soon — please use email or Google for now.');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || 'Apple sign-in failed.');
    }
    // Success — reload to pick up token (matches existing google/MS flow).
    const data = await res.json();
    if (data?.access_token) {
      localStorage.setItem('token', data.access_token);
      window.location.href = '/discover';
    }
  } catch (e) {
    window.alert(e?.message || 'Apple sign-in failed.');
  }
}
