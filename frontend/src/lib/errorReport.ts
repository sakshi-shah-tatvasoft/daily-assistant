import { supabase } from './supabase';

/**
 * Send app errors to the owner (free, no extra service): saved to `client_errors` (insert-only, own rows),
 * then emailed as an hourly digest by the server. Only the error text + page — never medicine details or form data.
 */
const IGNORE = /ResizeObserver loop|Failed to fetch|Load failed|NetworkError|network error|AbortError|The operation was aborted|Importing a module script failed/i;
const MAX_PER_SESSION = 10;
const seen = new Set<string>();

export async function reportError(err: unknown, where = '') {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
    const message = `${where ? `[${where}] ` : ''}${e.message || 'Unknown error'}`.slice(0, 500);
    if (IGNORE.test(message) || seen.has(message) || seen.size >= MAX_PER_SESSION) return;
    seen.add(message);
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;                       // only signed-in users can report
    await supabase.from('client_errors').insert({
      user_id: data.session.user.id,
      message,
      stack: (e.stack ?? '').slice(0, 4000) || null,
      page: location.pathname.replace(/[0-9a-f-]{8,}|r-\d+-\w+/gi, ':id').slice(0, 200),   // no ids in the report
      app_version: `${__BUILD_TIME__.slice(0, 16)} ${__COMMIT__}`.slice(0, 80),
      user_agent: navigator.userAgent.slice(0, 300),
    });
  } catch { /* never let error reporting cause errors */ }
}

export function installErrorReporting() {
  window.addEventListener('error', ev => { if (ev.error || ev.message) reportError(ev.error ?? ev.message, 'window'); });
  window.addEventListener('unhandledrejection', ev => reportError(ev.reason, 'promise'));
}
