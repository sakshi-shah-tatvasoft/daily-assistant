import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWaterToday, nextWaterTime } from '../lib/water';
import { formatTime, getCurrentTimeIST } from '../utils/dateHelpers';
import { celebrate } from './ui/Celebration';
import type { WaterSettings } from '../types';
import { t } from '../lib/i18n';

/** Today screen: glass counter for water reminders (not part of the medicine score). */
export default function WaterCard({ water }: { water: WaterSettings }) {
  const { glasses, loaded, add, remove } = useWaterToday();
  const goal = water.goal;
  const next = nextWaterTime(water, getCurrentTimeIST());
  const reached = glasses >= goal;

  const onAdd = async () => {
    try {
      const n = await add();
      if (n === goal) celebrate(t('Water goal reached! 💧'));
    } catch { toast.error(t("Couldn't add the glass — check your connection"), { id: 'water' }); }
  };
  const onUndo = async () => {
    try { await remove(); } catch { toast.error(t("Couldn't undo — check your connection"), { id: 'water' }); }
  };

  return (
    <div className="mb-5 rounded-2xl px-4 py-3.5 border bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/25">
      <div className="flex items-center justify-between">
        <Link to="/water" className="text-[15px] font-semibold text-gray-900 dark:text-white">💧 {t('Water')}</Link>
        {loaded ? (
          <span className="text-[13px] font-semibold text-sky-700 dark:text-sky-300">
            {t(goal === 1 ? '{n} of {goal} glass' : '{n} of {goal} glasses', { n: glasses, goal })}{glasses > goal ? ` (+${glasses - goal})` : ''}
          </span>
        ) : <span className="h-3.5 w-24 rounded-lg bg-sky-200/60 dark:bg-sky-500/15 animate-pulse" aria-label={t('Loading')} />}
      </div>
      <div className="flex gap-1.5 my-3" aria-hidden="true">
        {Array.from({ length: goal }, (_, i) => (
          <span key={i} className={`flex-1 h-6 rounded-md transition-colors ${loaded && i < glasses ? 'bg-sky-500' : 'bg-sky-100 dark:bg-sky-500/15'} ${loaded ? '' : 'animate-pulse'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-0 truncate">
          {reached ? t('Goal reached — well done!') : next ? t('Next reminder {time}', { time: formatTime(next) }) : t('No more reminders today')}
        </span>
        <span className="flex gap-2 flex-shrink-0">
          {glasses > 0 && (
            <button onClick={onUndo} className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] text-[13px] text-gray-500 dark:text-gray-400">{t('Undo')}</button>
          )}
          <button onClick={onAdd} className="px-4 py-1.5 rounded-xl bg-sky-700 text-white text-sm font-semibold">{t('+ Glass')}</button>
        </span>
      </div>
    </div>
  );
}
