import { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { INITIAL_REMINDERS, INITIAL_SETTINGS } from '../data/initialData';
import type { Reminder, TaskInstance, DailyLog, AppSettings } from '../types';
import { getTodayIST, shouldReminderRunToday, getCurrentTimeIST } from '../utils/dateHelpers';
import { NOTIFICATION_SLOTS, SLOT_ORDER } from '../utils/constants';
import { fireNotification, canNotify } from '../utils/notifications';

interface AppContextType {
  reminders:    Reminder[];
  setReminders: (v: Reminder[] | ((p: Reminder[]) => Reminder[])) => void;
  dailyLogs:    Record<string, DailyLog>;
  setDailyLogs: (v: Record<string, DailyLog> | ((p: Record<string, DailyLog>) => Record<string, DailyLog>)) => void;
  settings:     AppSettings;
  setSettings:  (v: AppSettings | ((p: AppSettings) => AppSettings)) => void;
  todayTasks:   TaskInstance[];
  completeTask: (id: string) => void;
  skipTask:     (id: string, reason?: string) => void;
  refreshToday: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

function migrateReminders(raw: unknown): Reminder[] {
  if (!Array.isArray(raw) || !raw.length) return INITIAL_REMINDERS;
  // If old schema (has scheduledTime but no slots), reset to initial
  if (raw[0] && 'scheduledTime' in raw[0] && !('slots' in raw[0])) return INITIAL_REMINDERS;
  return raw as Reminder[];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [rawReminders, setReminders] = useLocalStorage<unknown>('da_reminders_v2', INITIAL_REMINDERS);
  const [dailyLogs,   setDailyLogs]  = useLocalStorage<Record<string, DailyLog>>('da_logs_v2', {});
  const [settings,    setSettings]   = useLocalStorage<AppSettings>('da_settings_v2', INITIAL_SETTINGS);

  const reminders = migrateReminders(rawReminders) as Reminder[];

  const today = getTodayIST();

  // Build today's task instances from reminders
  const buildTodayTasks = useCallback(() => {
    const tasks: TaskInstance[] = [];
    const activeToday = reminders.filter(r => r.isActive && shouldReminderRunToday(r));

    for (const r of activeToday) {
      if (r.slots.length > 0) {
        for (const slot of r.slots) {
          const time = settings.notificationSlotTimes[slot];
          tasks.push({
            id: `${r.id}__${slot}__${today}`,
            reminderId: r.id,
            date: today,
            scheduledTime: time,
            slot,
            title: r.title,
            category: r.category,
            status: 'pending',
          });
        }
      } else if (r.customTime) {
        tasks.push({
          id: `${r.id}__custom__${today}`,
          reminderId: r.id,
          date: today,
          scheduledTime: r.customTime,
          title: r.title,
          category: r.category,
          status: 'pending',
        });
      }
    }

    setDailyLogs(prev => ({ ...prev, [today]: { date: today, taskInstances: tasks } }));
  }, [reminders, today, settings.notificationSlotTimes]);

  // Auto-generate today's log on first load
  useEffect(() => {
    if (!dailyLogs[today]) buildTodayTasks();
  }, [today, dailyLogs, buildTodayTasks]);

  // Apply theme
  useEffect(() => {
    const { theme } = settings;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      return;
    }
    if (theme === 'light') {
      root.classList.remove('dark');
      return;
    }
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', isDark);
    const handler = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.theme]);

  // Fire browser notifications at slot times
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!settings.pushNotificationsEnabled || !canNotify()) return;

    const check = () => {
      const now = getCurrentTimeIST();
      const todayTasks = dailyLogs[today]?.taskInstances ?? [];

      for (const slot of SLOT_ORDER) {
        const slotTime = settings.notificationSlotTimes[slot];
        const key = `${today}-${slot}`;
        if (now === slotTime && !firedRef.current.has(key)) {
          firedRef.current.add(key);
          const due = todayTasks.filter(t => t.slot === slot && t.status === 'pending');
          if (due.length > 0) {
            const def = NOTIFICATION_SLOTS[slot];
            fireNotification(
              `${def.emoji} ${def.label} Reminder`,
              due.map(t => `• ${t.title}`).join('\n'),
              key,
            );
          }
        }
      }
    };

    check();
    const interval = setInterval(check, 30_000); // check every 30s
    return () => clearInterval(interval);
  }, [settings, dailyLogs, today]);

  const todayTasks = (dailyLogs[today]?.taskInstances ?? [])
    .slice()
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const updateTask = (id: string, patch: Partial<TaskInstance>) => {
    setDailyLogs(prev => {
      const log = prev[today];
      if (!log) return prev;
      return {
        ...prev,
        [today]: {
          ...log,
          taskInstances: log.taskInstances.map(t => t.id === id ? { ...t, ...patch } : t),
        },
      };
    });
  };

  const completeTask = (id: string) =>
    updateTask(id, { status: 'completed', completedAt: new Date().toISOString() });

  const skipTask = (id: string, reason?: string) =>
    updateTask(id, { status: 'skipped', skippedReason: reason });

  return (
    <AppContext.Provider value={{
      reminders, setReminders: setReminders as (v: Reminder[] | ((p: Reminder[]) => Reminder[])) => void,
      dailyLogs, setDailyLogs,
      settings, setSettings,
      todayTasks,
      completeTask,
      skipTask,
      refreshToday: buildTodayTasks,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
