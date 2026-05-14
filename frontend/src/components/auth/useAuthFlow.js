import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore, { buildDevicePayload } from '../../stores/authStore';
import axios from 'axios';
import { toast } from 'sonner';
import { useOTPTimers } from './useOTPTimers';
import { authenticatePasskey, passkeysSupported, hasPasskeyOnDeviceFlag, setPasskeyOnDeviceFlag, PASSKEY_AUTH_NO_CREDENTIAL, PASSKEY_AUTH_UNEXPECTED } from '../../api/webauthnClient';
import { runPostLoginPasskeyHook } from './passkeyEnrollPrompt';

export function useAuthFlow({ onClose, initialMode = 'signin' }) {
  const login = useAuthStore(s => s.login);
  const navigate = useNavigate();

  const [step, setStep] = useState(initialMode === 'signup' ? 1 : 2);
  const [isSignup, setIsSignup] = useState(initialMode === 'signup');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [emailOTP, setEmailOTP] = useState('');
  const [phoneOTP, setPhoneOTP] = useState('');
  const [emailVerifiedToken, setEmailVerifiedToken] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingOperator, setPendingOperator] = useState(false);
  // Controlled state for the "No passkey on this device" AlertDialog so it
  // can be opened both from StepLogin's local tap-on-muted-button handler
  // AND from a failed authenticatePasskey ceremony (stale credential id
  // on this device — see handlePasskeyLogin below).
  const [showNoPasskeyDialog, setShowNoPasskeyDialog] = useState(false);

  const timers = useOTPTimers();

  const navigateAfterAuth = useCallback((u) => {
    if (!u.onboarding_complete) navigate('/onboarding');
    else if (u.role === 'operator' || u.role === 'instructor') navigate('/operator');
    else if (u.role === 'admin') navigate('/admin');
  }, [navigate]);

  // Post-login passkey hook (Phase B):
  //  - If logged in via passkey: ensure the local "has passkey" flag stays set.
  //  - Otherwise: ask the server how many passkeys the user has. If zero,
  //    prompt them to enrol. If non-zero, set the local flag so the next
  //    login on this browser shows the passkey button (covers iCloud-synced
  //    passkeys appearing on a new Mac, Chrome-profile-synced passkeys on a
  //    new Windows machine, etc.).
  const postLoginPasskeyHook = useCallback(async (loggedInViaPasskey) => {
    // Delegates to the shared helper so the OAuth callback path (which can't
    // call this hook because it lives outside the AuthModal) uses the same
    // logic. Keep the local function name for the existing call-sites.
    await runPostLoginPasskeyHook(!!loggedInViaPasskey);
  }, []);

  const handleRoleSelect = useCallback((selectedRole) => {
    setRole(selectedRole);
    setStep(2);
  }, []);

  const handleSendEmailOTP = useCallback(async () => {
    if (!email) { toast.error('Please enter your email'); return; }
    if (isSignup && !name) { toast.error('Please enter your name'); return; }
    setLoading(true);
    try {
      if (isSignup) await axios.post('/auth/store-signup-data', { email, name, role });
      else await axios.post('/auth/login-init', { email });
      const response = await axios.post('/auth/send-otp', { identifier: email });
      timers.setEmailExpiresAt(response.data.expires_at);
      timers.setEmailResendCooldown(60);
      toast.success('Code sent to your email');
      setStep(3);
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to send code'); }
    finally { setLoading(false); }
  }, [email, isSignup, name, role, timers]);

  const completeAuth = useCallback(async (phoneToken) => {
    try {
      const response = await axios.post('/auth/signup-complete', {
        email, phone, email_verified_token: emailVerifiedToken, phone_verified_token: phoneToken,
        device: buildDevicePayload(),
      });
      const data = response.data;
      login(data.access_token, data.user, {
        refresh_token: data.refresh_token,
        session_id: data.session_id,
        refresh_expires_at: data.refresh_expires_at,
      });
      toast.success(isSignup ? 'Welcome to Bottom Time!' : 'Welcome back!');
      postLoginPasskeyHook(false);
      onClose();
      navigateAfterAuth(response.data.user);
    } catch (error) { toast.error(error.response?.data?.detail || 'Authentication failed'); }
    finally { setLoading(false); }
  }, [email, phone, emailVerifiedToken, isSignup, login, onClose, navigateAfterAuth, postLoginPasskeyHook]);

  const handleVerifyEmailOTP = useCallback(async () => {
    if (emailOTP.length !== 6) { toast.error('Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const response = await axios.post('/auth/verify-otp', { identifier: email, code: emailOTP });
      const emailToken = response.data.verification_token;
      toast.success('Email verified!');
      if (!isSignup) {
        try {
          const loginResp = await axios.post('/auth/login-complete', {
            email,
            email_verified_token: emailToken,
            device: buildDevicePayload(),
          });
          const data = loginResp.data;
          login(data.access_token, data.user, {
            refresh_token: data.refresh_token,
            session_id: data.session_id,
            refresh_expires_at: data.refresh_expires_at,
          });
          toast.success('Welcome back!');
          postLoginPasskeyHook(false);
          onClose();
          navigateAfterAuth(loginResp.data.user);
        } catch (loginErr) {
          if (loginErr.response?.status === 403 && loginErr.response?.data?.detail?.includes('pending')) {
            setPendingOperator(true);
          } else {
            toast.error(loginErr.response?.data?.detail || 'Login failed');
          }
        }
      } else {
        setEmailVerifiedToken(emailToken);
        setStep(4);
      }
    } catch (error) { toast.error(error.response?.data?.detail || 'Invalid code'); }
    finally { setLoading(false); }
  }, [emailOTP, email, isSignup, login, onClose, navigateAfterAuth, postLoginPasskeyHook]);

  const handleSendPhoneOTP = useCallback(async () => {
    if (!phone) { toast.error('Please enter your phone number'); return; }
    setLoading(true);
    try {
      const response = await axios.post('/auth/send-otp', { identifier: phone });
      timers.setPhoneExpiresAt(response.data.expires_at);
      timers.setPhoneResendCooldown(60);
      toast.success('Code sent to your phone');
      setStep(5);
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to send code'); }
    finally { setLoading(false); }
  }, [phone, timers]);

  const handleVerifyPhoneOTP = useCallback(async () => {
    if (phoneOTP.length !== 6) { toast.error('Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const response = await axios.post('/auth/verify-otp', { identifier: phone, code: phoneOTP });
      toast.success('Phone verified!');
      await completeAuth(response.data.verification_token);
    } catch (error) { toast.error(error.response?.data?.detail || 'Invalid code'); setLoading(false); }
  }, [phoneOTP, phone, completeAuth]);

  const switchToSignin = useCallback(() => { setIsSignup(false); setStep(2); }, []);
  const switchToSignup = useCallback(() => { setIsSignup(true); setStep(1); }, []);

  // Phase B — passkey sign-in. Email is optional (usernameless flow uses
  // the discoverable credential; email-first uses allow-list).
  const handlePasskeyLogin = useCallback(async () => {
    if (!passkeysSupported()) return;
    setLoading(true);
    try {
      const result = await authenticatePasskey({ email: email || undefined });
      if (result.ok) {
        login(result.access_token, result.user, {
          refresh_token: result.refresh_token,
          session_id: result.session_id,
          refresh_expires_at: result.refresh_expires_at,
        });
        toast.success('Welcome back!');
        postLoginPasskeyHook(true);
        onClose();
        navigateAfterAuth(result.user);
        return;
      }
      // No credential resident on this device (or server doesn't recognise
      // it) — clearPasskeyOnDeviceFlag has already fired inside
      // authenticatePasskey, so the next render will read passkeyOnDevice
      // as false and re-render the button in its muted state. Open the
      // custom AlertDialog so the user is steered to enrol fresh.
      if (result.reason === PASSKEY_AUTH_NO_CREDENTIAL) {
        setShowNoPasskeyDialog(true);
        return;
      }
      // Reason === PASSKEY_AUTH_UNEXPECTED — show a generic toast.
      const err = result.error;
      const msg = err?.response?.data?.detail || err?.message || 'Passkey sign-in failed';
      toast.error(typeof msg === 'string' ? msg : 'Passkey sign-in failed');
    } finally {
      setLoading(false);
    }
  }, [email, login, onClose, navigateAfterAuth, postLoginPasskeyHook]);

  const getStepTitle = useCallback(() => {
    const titles = { 1: 'Get Started', 2: isSignup ? 'Create Account' : 'Dive in', 3: 'Verify Email', 4: 'Your Phone', 5: 'Verify Phone' };
    return titles[step] || '';
  }, [step, isSignup]);

  return {
    step, isSignup, role, email, setEmail, phone, setPhone, name, setName,
    emailOTP, setEmailOTP, phoneOTP, setPhoneOTP, userPhone, loading, timers,
    pendingOperator,
    handleRoleSelect, handleSendEmailOTP, handleVerifyEmailOTP,
    handleSendPhoneOTP, handleVerifyPhoneOTP,
    handlePasskeyLogin,
    passkeysAvailable: passkeysSupported(),
    passkeyOnDevice: hasPasskeyOnDeviceFlag(),
    showNoPasskeyDialog, setShowNoPasskeyDialog,
    switchToSignin, switchToSignup, getStepTitle,
  };
}
