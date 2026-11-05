import { useState, useCallback } from 'react';
import { api } from '../lib/api';

const DEVICE_ID_KEY = 'da_device_id';

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64     = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export type PushStatus = 'idle' | 'requesting' | 'subscribed' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>(() => {
    if (!('PushManager' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const id = localStorage.getItem(DEVICE_ID_KEY);
    if (id && localStorage.getItem('da_push_subscribed') === 'true') return 'subscribed';
    return 'idle';
  });

  const subscribe = useCallback(async (
    slotTimes: Record<string, string>,
    slotItems: Record<string, string[]>,
  ) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return false;
    }

    setStatus('requesting');

    try {
      // 1. Request notification permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus('denied'); return false; }

      // 2. Get the service worker registration
      const reg = await navigator.serviceWorker.ready;

      // 3. Subscribe to push manager with VAPID public key
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY is not set in .env.local');

      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      // 4. Send subscription to backend
      const deviceId = getOrCreateDeviceId();
      await api.subscribe({
        deviceId,
        subscription: pushSub.toJSON() as PushSubscriptionJSON,
        slotTimes,
        slotItems,
        timezone: 'Asia/Kolkata',
      });

      localStorage.setItem('da_push_subscribed', 'true');
      setStatus('subscribed');
      return true;
    } catch (err) {
      console.error('[push] Subscribe failed:', err);
      setStatus('idle');
      return false;
    }
  }, []);

  const updateSchedule = useCallback(async (
    slotTimes: Record<string, string>,
    slotItems: Record<string, string[]>,
  ) => {
    const deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId || localStorage.getItem('da_push_subscribed') !== 'true') return;
    try {
      await api.updateSchedule({ deviceId, slotTimes, slotItems });
    } catch (err) {
      console.error('[push] Update schedule failed:', err);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    const deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe();
      await api.unsubscribe(deviceId);
      localStorage.removeItem('da_push_subscribed');
      setStatus('idle');
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err);
    }
  }, []);

  const sendTest = useCallback(async () => {
    const deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) return false;
    try {
      await api.testNotification(deviceId);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { status, subscribe, updateSchedule, unsubscribe, sendTest };
}
