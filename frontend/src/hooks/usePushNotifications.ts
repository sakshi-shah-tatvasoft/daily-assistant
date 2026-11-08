import { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64     = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export type PushStatus = 'checking' | 'idle' | 'requesting' | 'subscribed' | 'denied' | 'unsupported';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registerDevice(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push_device', {
    p_endpoint:   json.endpoint,
    p_p256dh:     json.keys?.p256dh,
    p_auth:       json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

/**
 * Push notifications for the signed-in user. Each browser install registers its own
 * subscription, so a user can get reminders on several devices.
 */
export function usePushNotifications() {
  const { profile, updateProfile } = useApp();
  const [status, setStatus] = useState<PushStatus>(() => {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return 'checking';
  });

  // Is this device subscribed? If the browser has a subscription and the account wants push,
  // make sure the server knows about it (self-heals after reinstalls / account switches).
  useEffect(() => {
    if (status !== 'checking') return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub && profile.push_enabled && Notification.permission === 'granted') {
          await registerDevice(sub);
          if (!cancelled) setStatus('subscribed');
        } else if (!cancelled) setStatus('idle');
      } catch {
        if (!cancelled) setStatus('idle');
      }
    })();
    return () => { cancelled = true; };
  }, [status, profile.push_enabled]);

  const subscribe = useCallback(async () => {
    if (!supported()) { setStatus('unsupported'); return false; }
    setStatus('requesting');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'denied' : 'idle'); return false; }

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY is not set');

      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });
      await registerDevice(sub);          // also sets push_enabled = true on the server
      updateProfile({ push_enabled: true });
      setStatus('subscribed');
      return true;
    } catch (err) {
      console.error('[push] Subscribe failed:', err);
      setStatus('idle');
      return false;
    }
  }, [updateProfile]);

  /** Turn off push on THIS device. If it was the last device, turn it off for the account. */
  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_devices').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      const { count } = await supabase.from('push_devices').select('id', { count: 'exact', head: true });
      if (!count) updateProfile({ push_enabled: false });
      setStatus('idle');
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err);
    }
  }, [updateProfile]);

  /** Returns null on success, or a human-readable reason. */
  const sendTest = useCallback(async (): Promise<string | null> => {
    try { await api.testNotification(); return null; }
    catch (e) {
      if (e instanceof TypeError) return "Can't reach the reminder server. Check your internet and try again.";
      return e instanceof Error ? e.message : 'Unknown error';
    }
  }, []);

  return { status, subscribe, unsubscribe, sendTest };
}
