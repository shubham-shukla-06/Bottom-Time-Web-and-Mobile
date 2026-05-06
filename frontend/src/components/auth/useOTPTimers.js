import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export function useOTPTimers() {
  const [emailExpiresAt, setEmailExpiresAt] = useState(null);
  const [phoneExpiresAt, setPhoneExpiresAt] = useState(null);
  const [emailTimeRemaining, setEmailTimeRemaining] = useState(0);
  const [phoneTimeRemaining, setPhoneTimeRemaining] = useState(0);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0);

  useEffect(() => {
    if (!emailExpiresAt) return;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((new Date(emailExpiresAt).getTime() - Date.now()) / 1000));
      setEmailTimeRemaining(remaining);
      if (remaining === 0) {
        toast.error('Email code expired');
        clearInterval(interval);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [emailExpiresAt]);

  useEffect(() => {
    if (!phoneExpiresAt) return;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((new Date(phoneExpiresAt).getTime() - Date.now()) / 1000));
      setPhoneTimeRemaining(remaining);
      if (remaining === 0) {
        toast.error('Phone code expired');
        clearInterval(interval);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [phoneExpiresAt]);

  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const interval = setInterval(() => setEmailResendCooldown(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [emailResendCooldown]);

  useEffect(() => {
    if (phoneResendCooldown <= 0) return;
    const interval = setInterval(() => setPhoneResendCooldown(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [phoneResendCooldown]);

  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  return {
    emailExpiresAt, setEmailExpiresAt,
    phoneExpiresAt, setPhoneExpiresAt,
    emailTimeRemaining, phoneTimeRemaining,
    emailResendCooldown, setEmailResendCooldown,
    phoneResendCooldown, setPhoneResendCooldown,
    formatTime,
  };
}
