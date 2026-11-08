import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

interface Options {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'primary' | 'danger';
  /** If set, the user must type this word to enable the confirm button (e.g. "DELETE"). */
  requireText?: string;
}

let open: ((o: Options, resolve: (v: boolean) => void) => void) | null = null;

/** App-styled replacement for window.confirm. Usage: if (await confirmDialog({...})) {...} */
export function confirmDialog(o: Options): Promise<boolean> {
  return new Promise(resolve => {
    if (open) open(o, resolve);
    else resolve(window.confirm([o.title, o.message].filter(Boolean).join('\n\n')));
  });
}

/** Mount once in the app shell. */
export default function ConfirmHost() {
  const [state, setState] = useState<{ o: Options; resolve: (v: boolean) => void } | null>(null);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    open = (o, resolve) => { setTyped(''); setState({ o, resolve }); };
    return () => { open = null; };
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    if (state.o.requireText) setTimeout(() => inputRef.current?.focus(), 250);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  if (!state) return null;
  const { o } = state;
  const danger = o.tone === 'danger';
  const blocked = !!o.requireText && typed.trim().toUpperCase() !== o.requireText.toUpperCase();

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => close(false)} />
      <div className="relative w-full max-w-[480px] bg-white dark:bg-[#1C1C1E] rounded-t-[28px] px-5 pt-5 animate-slide-up"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-[#3A3A3C] mx-auto mb-4" />
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
          danger ? 'bg-red-50 text-red-500 dark:bg-red-500/10' : 'bg-brand-50 text-brand-600 dark:bg-white/[0.06] dark:text-brand-400'}`}>
          {danger ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
        </div>
        <h2 id="confirm-title" className="text-lg font-semibold text-gray-900 dark:text-white">{o.title}</h2>
        {o.message && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed whitespace-pre-line">{o.message}</p>}
        {o.requireText && (
          <input ref={inputRef} className="input mt-4" value={typed} onChange={e => setTyped(e.target.value)}
            placeholder={`Type ${o.requireText} to confirm`} autoCapitalize="characters" autoComplete="off" />
        )}
        <div className="flex flex-col gap-2 mt-5">
          <button onClick={() => close(true)} disabled={blocked}
            className={`btn w-full py-3 text-[15px] text-white disabled:opacity-40 ${danger ? 'bg-red-500 active:bg-red-600' : 'bg-brand-600 active:bg-brand-700'}`}>
            {o.confirmText ?? 'Confirm'}
          </button>
          <button onClick={() => close(false)} className="btn-secondary w-full py-3 text-[15px]">
            {o.cancelText ?? 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
