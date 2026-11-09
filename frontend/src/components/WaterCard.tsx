import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWaterToday, nextWaterTime } from '../lib/water';
import { formatTime, getCurrentTimeIST } from '../utils/dateHelpers';
import { celebrate } from './ui/Celebration';
import type { WaterSettings } from '../types';

/** Today screen: glass counter for water reminders (not part of the medicine score). */
export default function WaterCard({ water }: { water: WaterSettings }) {
  const { glasses, add, remove } = useWaterToday();
  const goal = water.goal;
  const next = nextWaterTime(water, getCurrentTimeIST());
  const reached = glasses >= goal;

  const onAdd = async () => {
    try {
      const n = await add();
      if (n === goal) celebrate('Water goal reached! 💧');
    } catch { toast.error("Couldn't add the glass — check your connection", { id: 'water' }); }
  };
  const onUndo = async () => {
    try { await remove(); } catch { toast.error("Couldn't undo — check your connection", { id: 'water' }); }
  };

  return (
    <div className="mb-5 rounded-2xl px-4 py-3.5 border bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/25">
      <div className="flex items-center justify-between">
        <Link to="/water" className="text-[15px] font-semibold text-gray-900 dark:text-white">💧 Water</Link>
        <span className="text-[13px] font-semibold text-sky-700 dark:text-sky-300">
          {glasses} of {goal} glass{goal === 1 ? '' : 'es'}{glasses > goal ? ` (+${glasses - goal})` : ''}
        </span>
      </div>
      <div className="flex gap-1.5 my-3" aria-hidden="true">
        {Array.from({ length: goal }, (_, i) => (
          <span key={i} className={`flex-1 h-6 rounded-md transition-colors ${i < glasses ? 'bg-sky-500' : 'bg-sky-100 dark:bg-sky-500/15'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-0 truncate">
          {reached ? 'Goal reached — well done!' : next ? `Next reminder ${formatTime(next)}` : 'No more reminders today'}
        </span>
        <span className="flex gap-2 flex-shrink-0">
          {glasses > 0 && (
            <button onClick={onUndo} className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] text-[13px] text-gray-500 dark:text-gray-400">Undo</button>
          )}
          <button onClick={onAdd} className="px-4 py-1.5 rounded-xl bg-sky-700 text-white text-sm font-semibold">+ Glass</button>
        </span>
      </div>
    </div>
  );
}
