const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  subscribe(payload: {
    deviceId:     string;
    subscription: PushSubscriptionJSON;
    slotTimes:    Record<string, string>;
    slotItems:    Record<string, string[]>;
    timezone:     string;
  }) {
    return post('/api/push/subscribe', payload);
  },

  updateSchedule(payload: {
    deviceId:  string;
    slotTimes: Record<string, string>;
    slotItems: Record<string, string[]>;
  }) {
    return post('/api/push/update-schedule', payload);
  },

  unsubscribe(deviceId: string) {
    return post('/api/push/unsubscribe', { deviceId });
  },

  testNotification(deviceId: string) {
    return post('/api/push/test', { deviceId });
  },
};
