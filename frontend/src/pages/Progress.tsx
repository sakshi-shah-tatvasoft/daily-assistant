import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import Reports from './Reports';
import CalendarPage from './CalendarPage';
import { useApp } from '../context/AppContext';
import { ProgressSkeleton } from '../components/ui/Skeleton';
import { t } from '../lib/i18n';

const VIEWS = [{ key: 'overview', label: t('Overview') }, { key: 'calendar', label: t('Calendar') }] as const;

export default function Progress() {
  const [view, setView] = useState<'overview' | 'calendar'>('overview');
  const { fresh, dailyLogs } = useApp();
  const waiting = !fresh && Object.keys(dailyLogs).length === 0;
  return (
    <div className="page pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-title">{t('Progress')}</h1>
        <Link to="/tasks/week" className="text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1">
          <CalendarDays size={14} /> {t('Daily tasks week')}
        </Link>
      </div>
      <div className="flex p-1 mb-5 rounded-xl bg-gray-100 dark:bg-[#2C2C2E]">
        {VIEWS.map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              view === v.key ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
            {v.label}
          </button>
        ))}
      </div>
      {waiting ? <ProgressSkeleton /> : view === 'overview' ? <Reports embedded /> : <CalendarPage embedded />}
    </div>
  );
}
