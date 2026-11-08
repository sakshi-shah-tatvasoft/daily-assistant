export const DEVICE_ID_KEY = 'da_device_id';

/** Random per-device identity (no user accounts). Shared by push + tasks. */
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
