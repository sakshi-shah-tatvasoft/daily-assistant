import { useState } from 'react';
import { t } from '../lib/i18n';
import Rich from './ui/Rich';

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const STEPS = {
  iphone: [
    'Open the link in **Safari** (not Chrome or the WhatsApp browser — tap **⋯** → **Open in Safari** if needed).',
    'Tap the **Share** button (square with an arrow ↑) at the bottom.',
    'Scroll down and tap **Add to Home Screen**, then **Add**.',
    'Open **Daily Assistant** from your Home Screen icon — always use the icon from now on.',
  ],
  android: [
    'Open the link in **Chrome**.',
    'Tap the **⋮** menu at the top right.',
    'Tap **Install app** or **Add to Home screen**, then **Install**.',
    'Open **Daily Assistant** from your Home Screen icon.',
  ],
};

/** "Add to Home Screen" steps for iPhone / Android (iPhone only allows notifications for Home Screen apps). */
export default function InstallSteps() {
  const [tab, setTab] = useState<'iphone' | 'android'>(() => (/Android/i.test(navigator.userAgent) ? 'android' : 'iphone'));
  return (
    <div>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E] mb-3">
        {(['iphone', 'android'] as const).map(k => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`py-2 rounded-lg text-[13px] font-medium ${tab === k ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
            {k === 'iphone' ? 'iPhone' : 'Android'}
          </button>
        ))}
      </div>
      <ol className="space-y-2.5">
        {STEPS[tab].map((s, i) => (
          <li key={i} className="flex gap-3 text-sm text-gray-700 dark:text-gray-200">
            <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">{i + 1}</span>
            <span className="pt-0.5"><Rich text={t(s)} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
