import { isDemo, endDemo } from '../lib/demo';

/** Thin bar at the top of every screen in demo mode. */
export default function DemoBanner() {
  if (!isDemo()) return null;
  return (
    <div className="sticky top-0 z-40 -mb-px bg-saffron-500 text-white text-xs print:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} role="note">
      <div className="max-w-[520px] mx-auto px-4 py-1.5 flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate"><b>Demo</b> · sample data, nothing is saved or sent</span>
        <button onClick={endDemo} className="font-semibold underline underline-offset-2 flex-shrink-0">Exit demo</button>
      </div>
    </div>
  );
}
