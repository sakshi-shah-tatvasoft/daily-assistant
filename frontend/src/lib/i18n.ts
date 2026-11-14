/**
 * Languages: English (default), Hindi, Gujarati.
 * t('English text', { vars }) — the English text IS the key; locales/hi.ts and locales/gu.ts map it to a translation
 * (missing → English). Variables use {name}. Medicine names and anything the user typed are never translated.
 * The chosen language is kept on this device (and on the profile, so notifications use it too).
 */
import hi from '../locales/hi';
import gu from '../locales/gu';

export type Lang = 'en' | 'hi' | 'gu';
export const LANGS: { code: Lang; name: string; english: string }[] = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'gu', name: 'ગુજરાતી', english: 'Gujarati' },
];
const KEY = 'da_lang';
const DICTS: Record<Lang, Record<string, string>> = { en: {}, hi, gu };

export function savedLang(): Lang | null {
  try { const v = localStorage.getItem(KEY); return v === 'en' || v === 'hi' || v === 'gu' ? v : null; } catch { return null; }
}
let current: Lang = savedLang() ?? 'en';
export const getLang = () => current;
if (typeof document !== 'undefined') document.documentElement.lang = current === 'en' ? 'en' : `${current}-IN`;

/** Change language. The app reloads so every screen redraws in the new language. */
export function setLang(l: Lang, reload = true) {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  current = l;
  if (reload) window.location.reload();
}

export function t(text: string, vars?: Record<string, string | number>): string {
  return tIn(current, text, vars);
}

/** Translate into a specific language (e.g. the doctor report, which can be printed in English). */
export function tIn(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural-ish helper: picks the singular text when n === 1. */
export const tn = (n: number, one: string, many: string, vars: Record<string, string | number> = {}) =>
  t(n === 1 ? one : many, { n, ...vars });

/** Locale for dates and times (Indian formats, in the chosen language). */
export const localeFor = (l: Lang) => (l === 'hi' ? 'hi-IN' : l === 'gu' ? 'gu-IN' : 'en-IN');
export const locale = () => localeFor(current);
