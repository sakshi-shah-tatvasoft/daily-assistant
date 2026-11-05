export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

export function fireNotification(title: string, body: string, tag?: string) {
  if (!canNotify()) return;
  new Notification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    requireInteraction: false,
  });
}
