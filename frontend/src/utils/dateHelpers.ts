import { TIMEZONE } from './constants';
import type { TaskInstance, DashboardStats } from '../types';

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export function getCurrentHourIST(): number {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: TIMEZONE, hour: 'numeric', hour12: false })
  );
}

export function getCurrentTimeIST(): string {
  const now = new Date();
  const h = now.toLocaleString('en-US', { timeZone: TIMEZONE, hour: '2-digit', hour12: false }).padStart(2, '0');
  const m = now.toLocaleString('en-US', { timeZone: TIMEZONE, minute: '2-digit' }).padStart(2, '0');
  return `${h}:${m}`;
}

export function getGreeting(): string {
  const hour = getCurrentHourIST();
  if (hour >= 5  && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 21) return 'Good Evening';
  return 'Good Night';
}

export function getTimeOfDay(timeStr: string): TimeOfDay {
  const h = parseInt(timeStr.split(':')[0]);
  if (h >= 5  && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function getTodayFormatted(): string {
  return formatDate(getTodayIST());
}

export function getDashboardStats(tasks: TaskInstance[]): DashboardStats {
  const total     = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const pending   = tasks.filter(t => t.status === 'pending').length;
  const skipped   = tasks.filter(t => t.status === 'skipped').length;
  const denom     = total - skipped;
  const percentage = denom > 0 ? Math.round((completed / denom) * 100) : 0;
  return { total, completed, pending, skipped, percentage };
}

export function shouldReminderRunToday(reminder: { repeat: string; date?: string; repeatDays?: number[] }): boolean {
  const jsDay = new Date().getDay();
  const appDay = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon … 6=Sun
  const today = getTodayIST();

  switch (reminder.repeat) {
    case 'daily':    return true;
    case 'once':     return reminder.date === today;
    case 'weekdays': return appDay < 5;
    case 'weekly':
    case 'custom':   return (reminder.repeatDays ?? []).includes(appDay);
    case 'monthly': {
      const day = new Date(today + 'T00:00:00').getDate();
      return (reminder.repeatDays ?? []).includes(day);
    }
    default: return true;
  }
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  const jsDay = new Date(year, month, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
}
