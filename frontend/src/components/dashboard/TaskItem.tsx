import { Check, SkipForward } from 'lucide-react';
import type { TaskInstance } from '../../types';
import { formatTime } from '../../utils/dateHelpers';
import { CATEGORIES } from '../../utils/constants';

interface Props {
  task: TaskInstance;
  onComplete: () => void;
  onSkip: () => void;
}

export default function TaskItem({ task, onComplete, onSkip }: Props) {
  const cat = CATEGORIES[task.category];
  const done = task.status === 'completed';
  const inactive = done || task.status === 'skipped';

  return (
    <div className={`card p-3.5 flex items-center gap-3 transition-opacity ${inactive ? 'opacity-60' : ''}`}>
      {/* Tick */}
      <button
        onClick={!inactive ? onComplete : undefined}
        disabled={inactive}
        className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 active:scale-90
          ${done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-gray-600 hover:border-brand-400'}`}
        aria-label="Mark complete"
      >
        {done && <Check size={11} className="text-white" strokeWidth={3} />}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight ${done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(task.scheduledTime)}</span>
          <span className="badge text-xs" style={{ backgroundColor: cat.bg, color: cat.color }}>
            {cat.label}
          </span>
          {task.status === 'skipped' && (
            <span className="badge bg-gray-100 text-gray-400 dark:bg-gray-800/50">Skipped</span>
          )}
          {task.isLate && task.status === 'completed' && (
            <span className="badge bg-amber-50 text-amber-500 dark:bg-amber-900/20">Late</span>
          )}
        </div>
      </div>

      {/* Skip */}
      {!inactive && (
        <button onClick={onSkip} className="btn-icon flex-shrink-0" aria-label="Skip task">
          <SkipForward size={14} />
        </button>
      )}
    </div>
  );
}
