import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** POST to our backend with the user's Supabase session token. */
async function authedPost(path: string, body: unknown = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Not signed in', 401);

  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new ApiError(err?.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

// Only actions that need a server secret go through the backend.
// Everything else talks to Supabase directly, protected by row-level security.
export const api = {
  testNotification: () => authedPost('/api/push/test'),
  deleteAccount:    () => authedPost('/api/account/delete'),
};
