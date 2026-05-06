import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(user) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [supported, setSupported] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  }, []);

  // Auto-subscribe if already granted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || !supported) return;
    if (Notification.permission === 'granted') {
      subscribeUser();
    }
  }, [user, supported]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subscribeUser = useCallback(async () => {
    if (!supported || !user) return false;
    try {
      const reg = await navigator.serviceWorker.ready;

      // Get VAPID key from backend
      const { data } = await axios.get('/push/vapid-key');
      if (!data.public_key) return false;

      const applicationServerKey = urlBase64ToUint8Array(data.public_key);

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Send subscription to backend
      await axios.post('/push/subscribe', subscription.toJSON());
      setPermission('granted');
      return true;
    } catch (err) {
      return false;
    }
  }, [supported, user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const requestPermission = useCallback(async () => {
    if (!supported) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      await subscribeUser();
    }
    return result;
  }, [supported, subscribeUser]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await axios.delete('/push/unsubscribe');
      setPermission('default');
    } catch (e) { /* silent */ }
  }, []);

  return { permission, supported, requestPermission, unsubscribe };
}
