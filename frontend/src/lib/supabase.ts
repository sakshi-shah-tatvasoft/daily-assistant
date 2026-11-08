import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Browser Supabase client. Uses the PUBLIC anon key only — every table is protected by
 * row-level security, so a signed-in user can only reach their own rows.
 */
export const supabase = createClient(url ?? 'http://missing.invalid', anonKey ?? 'missing', {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,   // we use typed 6-digit codes, never redirect links
    storageKey:         'da_auth',
  },
});
