import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import useAuthStore from '../stores/authStore';
import { runPostLoginPasskeyHook } from '../components/auth/passkeyEnrollPrompt';
import { Waves, Check, AlertCircle, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const ROLES = [
  { value: 'diver', label: 'Diver', desc: 'Explore dive sites and log adventures' },
  { value: 'instructor', label: 'Instructor', desc: 'Teach and guide other divers' },
  { value: 'operator', label: 'Operator', desc: 'List dive trips and run a business' },
];

export default function AuthCallback() {
  const navigate = useNavigate();
  const login = useAuthStore(s => s.login);
  const hasProcessed = useRef(false);

  const [status, setStatus] = useState('loading'); // loading | needs_setup | error | pending_operator
  const [setupStep, setSetupStep] = useState('role'); // role | phone | otp
  const [socialData, setSocialData] = useState(null);
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneToken, setPhoneToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    processCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSocialResponse = (data) => {
    if (data.status === 'logged_in') {
      login(data.access_token, data.user);
      // Phase B: social login = non-passkey login. Run the shared post-login
      // hook (resets the session-skip latch, fetches /auth/me/has-passkey,
      // syncs the local device flag, and pops the enrollment dialog when
      // either the server reports no passkey OR this device has no flag).
      // Fire-and-forget — navigation continues immediately.
      runPostLoginPasskeyHook(false);
      const u = data.user;
      if (!u.onboarding_complete) return navigate('/onboarding');
      if (u.role === 'operator' || u.role === 'instructor') return navigate('/operator');
      navigate('/discover');
    } else if (data.status === 'needs_setup') {
      setSocialData({ email: data.email, name: data.name, provider: data.provider });
      setStatus('needs_setup');
    }
  };

  const processCallback = async () => {
    // Apple needs_setup landing — popup-mode pkceHelpers redirected us here
    // with the stashed signup data in sessionStorage. Pre-empts Google/MS
    // discrimination below because Apple's path uses no `code`/`session_id`
    // URL params — those are MS/Google specific. Additive only; rest of
    // processCallback is untouched.
    const _appleParams = new URLSearchParams(window.location.search);
    if (_appleParams.get('provider') === 'apple' && _appleParams.get('needs_setup') === '1') {
      const raw = sessionStorage.getItem('apple_pending_signup');
      if (raw) {
        try {
          const pending = JSON.parse(raw);
          sessionStorage.removeItem('apple_pending_signup');
          setSocialData({
            email: pending.email || '',
            name: pending.name || '',
            provider: 'apple',
            apple_sub: pending.apple_sub || null,
          });
          setStatus('needs_setup');
          return;
        } catch (e) {
          // Fallthrough to error path.
          // eslint-disable-next-line no-console
          console.error('[auth-callback] apple needs_setup parse error', e);
        }
      }
      setStatus('error');
      setErr('Apple sign-in could not be completed. Please try again.');
      return;
    }

    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hash.substring(1));

    // Microsoft sometimes returns errors as query params
    const msError = searchParams.get('error') || hashParams.get('error');
    if (msError) {
      const desc = searchParams.get('error_description') || hashParams.get('error_description') || msError;
      setStatus('error');
      setErr(`Microsoft: ${desc.split('.')[0]}`);
      return;
    }

    // Get code from query params (preferred) OR hash fragment (some Azure configs)
    const msCode = searchParams.get('code') || hashParams.get('code');
    const msState = searchParams.get('state') || hashParams.get('state');

    try {
      if (hash.includes('session_id=')) {
        // Google (Emergent) flow
        const googleParams = new URLSearchParams(hash.substring(1));
        const sessionId = googleParams.get('session_id');
        if (!sessionId) throw new Error('Missing session_id');
        const res = await axios.post(`${API}/api/auth/social/google`, { session_id: sessionId });
        handleSocialResponse(res.data);
      } else if (msCode && msState) {
        // Could be Google or Microsoft — check which sessionStorage keys are set
        const isGoogle = !!sessionStorage.getItem('google_state');

        if (isGoogle) {
          // Custom Google OAuth (PKCE, backend exchange with client_secret)
          const savedState = sessionStorage.getItem('google_state');
          if (savedState && msState !== savedState) {
            setStatus('error'); setErr('Security check failed. Please try again.'); return;
          }
          const codeVerifier = sessionStorage.getItem('google_code_verifier');
          if (!codeVerifier) {
            setStatus('error'); setErr('Session expired. Please try signing in again.'); return;
          }
          sessionStorage.removeItem('google_code_verifier');
          sessionStorage.removeItem('google_state');
          const redirectUri = window.location.origin + '/auth/callback';
          const res = await axios.post(`${API}/api/auth/social/google-code`, {
            code: msCode,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
          });
          handleSocialResponse(res.data);
        } else {
          // Microsoft PKCE flow — exchange code IN BROWSER (SPA requirement)
          const savedState = sessionStorage.getItem('ms_state');
          if (savedState && msState !== savedState) {
            setStatus('error'); setErr('Security check failed (state mismatch). Please try again.'); return;
          }
          const codeVerifier = sessionStorage.getItem('ms_code_verifier');
          if (!codeVerifier) {
            setStatus('error'); setErr('Session expired. Please try signing in again.'); return;
          }
          const redirectUri = window.location.origin + '/auth/callback';
          const clientId = process.env.REACT_APP_MS_CLIENT_ID;
          const tokenResp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              code: msCode,
              code_verifier: codeVerifier,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
              scope: 'openid profile email',
            }),
          });
          const tokenData = await tokenResp.json();
          if (!tokenResp.ok || tokenData.error) {
            const desc = tokenData.error_description || tokenData.error || 'Token exchange failed';
            setStatus('error'); setErr(`Microsoft: ${desc.split('.')[0]}`); return;
          }
          const idToken = tokenData.id_token;
          if (!idToken) {
            setStatus('error'); setErr('Microsoft did not return an ID token.'); return;
          }
          sessionStorage.removeItem('ms_code_verifier');
          sessionStorage.removeItem('ms_state');
          const res = await axios.post(`${API}/api/auth/social/microsoft-token`, { id_token: idToken });
          handleSocialResponse(res.data);
        }
      } else {
        setStatus('error');
        setErr('No authentication data found. Please try signing in again.');
      }
    } catch (e) {
      if (e.response?.status === 403 && e.response?.data?.detail?.includes('pending')) {
        setStatus('pending_operator');
      } else {
        setStatus('error');
        setErr(e.response?.data?.detail || 'Authentication failed. Please try again.');
      }
    }
  };

  const sendPhoneOtp = async () => {
    if (!phone.startsWith('+') || phone.length < 10) {
      setErr('Please enter a valid phone number with country code (e.g. +44...)');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await axios.post(`${API}/api/auth/send-otp`, { identifier: phone });
      setSetupStep('otp');
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to send OTP.');
    } finally {
      setBusy(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (otp.length !== 6) { setErr('Enter the 6-digit code.'); return; }
    setErr('');
    setBusy(true);
    try {
      const res = await axios.post(`${API}/api/auth/verify-otp`, { identifier: phone, code: otp });
      setPhoneToken(res.data.verification_token);
      // Complete signup
      const signupRes = await axios.post(`${API}/api/auth/social/signup-complete`, {
        email: socialData.email,
        name: socialData.name,
        role,
        provider: socialData.provider,
        phone,
        phone_verified_token: res.data.verification_token,
      });
      login(signupRes.data.access_token, signupRes.data.user);
      // Phase B: brand-new social signup → no passkeys yet, prompt enrol.
      if (passkeysSupported()) {
        (async () => {
          const count = await syncPasskeyFlagFromServer();
          if (count === 0) maybePromptPasskeyEnrollment();
        })();
      }
      navigate('/onboarding');
    } catch (e) {
      setErr(e.response?.data?.detail || 'Verification failed. Please check the code.');
    } finally {
      setBusy(false);
    }
  };

  // ─── Render States ───────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4" data-testid="auth-callback-loading">
        <div className="flex items-center gap-2 mb-4">
          <Waves size={28} className="text-cyan-400" />
          <span className="text-xl font-bold tracking-tight text-slate-900">Bottom Time</span>
        </div>
        <Loader2 size={32} className="text-cyan-400 animate-spin" />
        <p className="text-slate-500 text-sm mt-2">Signing you in...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 px-4" data-testid="auth-callback-error">
        <div className="flex items-center gap-2 mb-2">
          <Waves size={28} className="text-cyan-400" />
          <span className="text-xl font-bold tracking-tight text-slate-900">Bottom Time</span>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-sm w-full text-center">
          <AlertCircle size={32} className="text-red-500 mx-auto mb-3" />
          <p className="text-slate-900 font-semibold mb-1">Sign in failed</p>
          <p className="text-slate-500 text-sm">{err}</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-cyan-500 hover:underline"
        >
          Back to home
        </button>
      </div>
    );
  }

  if (status === 'pending_operator') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 px-4" data-testid="auth-callback-pending">
        <div className="flex items-center gap-2 mb-2">
          <Waves size={28} className="text-cyan-400" />
          <span className="text-xl font-bold tracking-tight text-slate-900">Bottom Time</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Application Under Review</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Your operator account is currently being reviewed by the
            <strong> Bottom Time Compliance team</strong>.
            We'll notify you via email once a decision has been made.
          </p>
          <p className="text-xs text-slate-400">This usually takes less than 48 hours.</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-cyan-500 hover:underline"
          data-testid="pending-home-btn"
        >
          Back to home
        </button>
      </div>
    );
  }

  // needs_setup
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col items-center justify-center px-4 py-12" data-testid="auth-callback-setup">
      <div className="flex items-center gap-2 mb-8">
        <Waves size={24} className="text-cyan-400" />
        <span className="text-lg font-bold tracking-tight text-slate-900">Bottom Time</span>
      </div>

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-50 rounded-full text-xs text-cyan-600 font-semibold mb-3">
            <Check size={12} />
            New account being created
          </div>
          <h2 className="text-xl font-bold text-slate-900">Almost there, {socialData?.name?.split(' ')[0] || 'there'}!</h2>
          <p className="text-slate-500 text-sm mt-1">
            No account found for <span className="text-slate-900 font-medium">{socialData?.email}</span> — we're creating one now.
          </p>
        </div>

        {/* Step: Role */}
        {setupStep === 'role' && (
          <div data-testid="setup-role-step">
            <p className="text-sm font-semibold text-slate-700 mb-3">I am a...</p>
            <div className="flex flex-col gap-2 mb-6">
              {ROLES.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${role === r.value ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 hover:border-slate-300'}`}
                  data-testid={`role-${r.value}`}
                >
                  <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${role === r.value ? 'border-cyan-400' : 'border-slate-300'}`}>
                    {role === r.value && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                    <p className="text-xs text-slate-500">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            {err && <p className="text-red-500 text-xs mb-3">{err}</p>}
            <button
              onClick={() => { if (!role) { setErr('Please select a role.'); return; } setErr(''); setSetupStep('phone'); }}
              className="btn-primary w-full"
              data-testid="role-continue-btn"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step: Phone */}
        {setupStep === 'phone' && (
          <div data-testid="setup-phone-step">
            <p className="text-sm font-semibold text-slate-700 mb-1">Verify your mobile number</p>
            <p className="text-xs text-slate-500 mb-4">We'll send a one-time code. Your number is used for booking confirmations only.</p>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+44 7700 900000"
              className="input-field mb-3"
              data-testid="phone-input"
            />
            {err && <p className="text-red-500 text-xs mb-3">{err}</p>}
            <button
              onClick={sendPhoneOtp}
              disabled={busy}
              className="btn-primary w-full disabled:opacity-50"
              data-testid="send-otp-btn"
            >
              {busy ? 'Sending...' : 'Send Code'}
            </button>
          </div>
        )}

        {/* Step: OTP */}
        {setupStep === 'otp' && (
          <div data-testid="setup-otp-step">
            <p className="text-sm font-semibold text-slate-700 mb-1">Enter the 6-digit code</p>
            <p className="text-xs text-slate-500 mb-4">Sent to <span className="text-slate-900 font-medium">{phone}</span></p>
            <input
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="input-field text-center tracking-[0.5em] font-mono mb-3"
              data-testid="otp-input"
            />
            {err && <p className="text-red-500 text-xs mb-3">{err}</p>}
            <button
              onClick={verifyPhoneOtp}
              disabled={busy || otp.length !== 6}
              className="btn-primary w-full disabled:opacity-50"
              data-testid="verify-otp-btn"
            >
              {busy ? 'Creating account...' : 'Create My Account'}
            </button>
            <button
              onClick={() => { setSetupStep('phone'); setOtp(''); setErr(''); }}
              className="w-full text-xs text-slate-400 hover:text-slate-600 mt-3"
            >
              Change number
            </button>
          </div>
        )}
      </div>

      <button onClick={() => navigate('/')} className="text-xs text-slate-400 hover:text-slate-600 mt-6">
        Cancel and go home
      </button>
    </div>
  );
}
