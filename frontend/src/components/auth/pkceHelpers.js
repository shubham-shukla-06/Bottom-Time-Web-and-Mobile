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
