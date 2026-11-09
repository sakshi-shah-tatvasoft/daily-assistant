// Server-only Supabase client with the SECRET key. Never imported by the browser app.
import { createClient } from '@supabase/supabase-js';

let client;
export function admin() {
  if (!client) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set');
    if (!key.startsWith('sb_secret_') && !key.startsWith('eyJ')) throw new Error('SUPABASE_SERVICE_KEY must be a Supabase secret key');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
