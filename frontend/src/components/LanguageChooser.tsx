import { LANGS, getLang, setLang, type Lang } from '../lib/i18n';

/** Big, simple buttons — each language written in its own script so anyone can find theirs. */
function LangButtons({ current, onPick }: { current?: Lang; onPick: (l: Lang) => void }) {
  return (
    <div className="space-y-2.5">
      {LANGS.map(l => (
        <button key={l.code} type="button" onClick={() => onPick(l.code)} aria-pressed={current === l.code}
          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 text-left transition-all ${
            current === l.code ? 'border-brand-500 bg-brand-50 dark:bg-white/[0.06]' : 'border-gray-200 dark:border-[#2C2C2E] bg-white dark:bg-[#1C1C1E]'}`}>
          <span className="text-lg font-semibold text-gray-900 dark:text-white" lang={l.code === 'en' ? 'en' : `${l.code}-IN`}>{l.name}</span>
          {l.code !== 'en' && <span className="text-sm text-gray-400">{l.english}</span>}
        </button>
      ))}
    </div>
  );
}

/** First open on a device: pick the language before anything else (the choice is kept on this phone). */
export default function LanguageChooser() {
  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 max-w-[420px] mx-auto">
      <img src="/icon-192.png" alt="" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-sm" />
      <h1 className="text-xl font-bold text-gray-900 dark:text-white text-center">Choose your language</h1>
      <p className="text-base text-gray-500 dark:text-gray-400 text-center mb-1" lang="hi-IN">अपनी भाषा चुनें</p>
      <p className="text-base text-gray-500 dark:text-gray-400 text-center mb-6" lang="gu-IN">તમારી ભાષા પસંદ કરો</p>
      <LangButtons onPick={l => setLang(l)} />
      <p className="text-xs text-gray-400 text-center mt-6">You can change this later in Settings · सेटिंग्स · સેટિંગ્સ</p>
    </div>
  );
}

/** Settings card. Changing the language reloads the app so every screen redraws. */
export function LanguageCard() {
  const current = getLang();
  return (
    <div className="card p-4 mb-4">
      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">Language · भाषा · ભાષા</p>
      <p className="text-xs text-gray-400 mb-3">{current === 'en' ? 'Screens and notifications' : current === 'hi' ? 'स्क्रीन और नोटिफिकेशन' : 'સ્ક્રીન અને નોટિફિકેશન'}</p>
      <LangButtons current={current} onPick={l => { if (l !== current) setLang(l); }} />
    </div>
  );
}
