import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import axios from 'axios';
import { toast } from 'sonner';
import { useOTPTimers } from './useOTPTimers';

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

  const timers = useOTPTimers();

  const navigateAfterAuth = useCallback((u) => {
    if (!u.onboarding_complete) navigate('/onboarding');
    else if (u.role === 'operator' || u.role === 'instructor') navigate('/operator');
    else if (u.role === 'admin') navigate('/admin');
  }, [navigate]);

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
        email, phone, email_verified_token: emailVerifiedToken, phone_verified_token: phoneToken
      });
      login(response.data.access_token, response.data.user);
      toast.success(isSignup ? 'Welcome to Bottom Time!' : 'Welcome back!');
      onClose();
      navigateAfterAuth(response.data.user);
    } catch (error) { toast.error(error.response?.data?.detail || 'Authentication failed'); }
    finally { setLoading(false); }
  }, [email, phone, emailVerifiedToken, isSignup, login, onClose, navigateAfterAuth]);

  const handleVerifyEmailOTP = useCallback(async () => {
    if (emailOTP.length !== 6) { toast.error('Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const response = await axios.post('/auth/verify-otp', { identifier: email, code: emailOTP });
      const emailToken = response.data.verification_token;
      toast.success('Email verified!');
      if (!isSignup) {
        try {
          const loginResp = await axios.post('/auth/login-complete', { email, email_verified_token: emailToken });
          login(loginResp.data.access_token, loginResp.data.user);
          toast.success('Welcome back!');
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
  }, [emailOTP, email, isSignup, login, onClose, navigateAfterAuth]);

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
    switchToSignin, switchToSignup, getStepTitle,
  };
}
