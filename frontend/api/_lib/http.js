// Small helpers shared by the API functions.
import { timingSafeEqual } from 'node:crypto';
import { admin } from './supabaseAdmin.js';

export const json = (res, status, body) => res.status(status).json(body);

/** Returns the signed-in user from "Authorization: Bearer <supabase access token>", or sends 401. */
export async function requireUser(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { json(res, 401, { error: 'Not signed in' }); return null; }
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) { json(res, 401, { error: 'Session expired — please sign in again' }); return null; }
  return data.user;
}

/** Constant-time check of "Authorization: Bearer <CRON_SECRET>". */
export function isCron(req) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (secret.length < 32 || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export function onlyPost(req, res) {
  if (req.method === 'POST') return true;
  res.setHeader('Allow', 'POST'); json(res, 405, { error: 'Method not allowed' }); return false;
}

/** Tiny per-instance limiter (serverless instances are short-lived; auth is the real gate). */
const hits = new Map();
export function limited(key, max, windowMs = 60_000) {
  const now = Date.now(), e = hits.get(key);
  if (!e || now - e.t > windowMs) { hits.set(key, { t: now, n: 1 }); return false; }
  e.n += 1; return e.n > max;
}
