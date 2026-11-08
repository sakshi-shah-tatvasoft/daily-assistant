import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayIST, getDaysInMonth, getFirstDayOfMonth, formatTime } from '../utils/dateHelpers';
import { CATEGORIES } from '../utils/constants';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Mo','Tu','We','Th','Fr','Sa','Su'];

export default function CalendarPage() {
  const { dailyLogs: logs } = useApp();
  const today = getTodayIST();
  const [year,  setYear]    = useState(() => parseInt(today.slice(0, 4)));
  const [month, setMonth]   = useState(() => parseInt(today.slice(5, 7)) - 1);
  const [selected, setSelected] = useState<string>(today);

  const daysInMonth  = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const firstDayOfMonth = useMemo(() => getFirstDayOfMonth(year, month), [year, month]);

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); };

  const dateStr = (d: number) => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  const getDotColor = (date: string): string | null => {
    const log = logs[date];
    if (!log || !log.taskInstances.length) return null;
    const total     = log.taskInstances.length;
    const completed = log.taskInstances.filter(t => t.status === 'completed').length;
    const skipped   = log.taskInstances.filter(t => t.status === 'skipped').length;
    const pct = total - skipped > 0 ? completed / (total - skipped) : 0;
    if (pct >= 0.7) return '#10b981'; // emerald
    if (pct >= 0.4) return '#f59e0b'; // amber
    return '#ef4444';                  // red
  };

  const selectedTasks = useMemo(() => logs[selected]?.taskInstances ?? [], [logs, selected]);

  return (
    <div className="page pt-6">
      <h1 className="page-title mb-4">Calendar</h1>

      {/* Month navigator */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="btn-icon"><ChevronLeft size={20} /></button>
        <span className="font-semibold text-gray-800 dark:text-white">
          {MONTHS[month]} {year}
        </span>
        <button onClick={nextMonth} className="btn-icon"><ChevronRight size={20} /></button>
      </div>

      {/* Grid */}
      <div className="card p-3 mb-4">
        {/* DOW headers */}
        <div className="grid grid-cols-7 mb-1">
          {DOW.map(d => (
            <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {/* Empty cells before 1st */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`e-${i}`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
            const ds  = dateStr(d);
            const dot = getDotColor(ds);
            const isToday    = ds === today;
            const isSelected = ds === selected;

            return (
              <button
                key={d}
                onClick={() => setSelected(ds)}
                className={`flex flex-col items-center py-1.5 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-brand-600 text-white'
                    : isToday
                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-semibold'
                    : 'hover:bg-gray-100 dark:hover:bg-[#21302D] text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="text-sm leading-none">{d}</span>
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ backgroundColor: dot ?? 'transparent' }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-5 px-1">
        {[
          { color: '#10b981', label: '≥ 70%' },
          { color: '#f59e0b', label: '40–70%' },
          { color: '#ef4444', label: '< 40%'  },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
            <span className="text-xs text-gray-400">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Selected day tasks */}
      <div>
        <p className="section-label mb-3">
          {new Date(selected + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        {selectedTasks.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-gray-400 text-sm">No tasks recorded</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map(t => {
              const cat = CATEGORIES[t.category];
              const done    = t.status === 'completed';
              const skipped = t.status === 'skipped';
              return (
                <div key={t.id} className={`card p-3.5 flex items-center gap-3 ${(done || skipped) ? 'opacity-70' : ''}`}>
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: done ? '#10b981' : skipped ? '#9ca3af' : cat.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white'}`}>
                      {t.title}
                    </p>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{formatTime(t.scheduledTime)}</span>
                      <span className="badge text-xs" style={{ backgroundColor: cat.bg, color: cat.color }}>{cat.label}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    done    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' :
                    skipped ? 'bg-gray-100 text-gray-400 dark:bg-gray-800/50' :
                              'bg-amber-50 text-amber-500 dark:bg-amber-900/20'
                  }`}>
                    {done ? 'Done' : skipped ? 'Skip' : 'Pending'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
