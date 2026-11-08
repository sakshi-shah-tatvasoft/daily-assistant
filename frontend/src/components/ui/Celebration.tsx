import { useEffect, useState } from 'react';

/** Fire from anywhere: celebrate('Day complete!') */
export function celebrate(message: string) {
  window.dispatchEvent(new CustomEvent('da:celebrate', { detail: message }));
}

const COLORS = ['#F5A524', '#0F766E', '#78BFB4', '#F7B84B', '#14857A'];

/** Mounted once in the app shell. Shows a short burst of dots around the nudge bubble. */
export default function CelebrationLayer() {
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const on = (e: Event) => { setMsg((e as CustomEvent<string>).detail); setKey(k => k + 1); };
    window.addEventListener('da:celebrate', on);
    return () => window.removeEventListener('da:celebrate', on);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 1900);
    return () => window.clearTimeout(t);
  }, [msg, key]);

  if (!msg) return null;
  return (
    <div key={key} className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center" role="status" aria-live="polite">
      <div className="relative celebrate-pop">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="celebrate-dot"
            style={{ '--a': `${(360 / 14) * i}deg`, background: COLORS[i % COLORS.length] } as React.CSSProperties} />
        ))}
        <div className="bg-white dark:bg-[#15211F] rounded-3xl shadow-xl px-6 py-5 text-center border border-brand-100 dark:border-brand-900">
          <svg viewBox="0 0 512 512" className="w-14 h-14 mx-auto mb-2 rounded-2xl" aria-hidden="true">
            <rect width="512" height="512" fill="#0F766E" />
            <path d="M188 124 H328 A76 76 0 0 1 404 200 V264 A76 76 0 0 1 328 340 H262 L168 398 Q150 409 154 390 L176 338 A76 76 0 0 1 108 264 V200 A76 76 0 0 1 188 124 Z" fill="#FBF7F0" />
            <path d="M200 236 L240 274 L314 196" stroke="#0F766E" strokeWidth="34" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="392" cy="136" r="36" fill="#F5A524" stroke="#0F766E" strokeWidth="16" />
          </svg>
          <p className="text-base font-semibold text-gray-900 dark:text-white">{msg}</p>
        </div>
      </div>
    </div>
  );
}
