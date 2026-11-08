import type { Reminder, TaskInstance, StockUnit } from '../types';
import { getTodayIST } from './dateHelpers';

/** Average doses per day from the schedule (used for "days left"). */
export function dosesPerDay(r: Reminder): number {
  const perOccurrence = r.slots.length || (r.customTime ? 1 : 0);
  if (!perOccurrence) return 0;
  switch (r.repeat) {
    case 'daily':    return perOccurrence;
    case 'weekdays': return perOccurrence * 5 / 7;
    case 'weekly':
    case 'custom':   return perOccurrence * (r.repeatDays?.length ?? 0) / 7;
    case 'monthly':  return perOccurrence * (r.repeatDays?.length ?? 0) / 30;
    default:         return 0;   // 'once' — no ongoing use
  }
}

const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

export interface StockStatus {
  remaining: number; unit: StockUnit; daysLeft: number | null;
  low: boolean; out: boolean; endsBeforeEmpty: boolean;
}

/** Remaining stock from doses actually completed since the last refill. Undo/missed never count. */
export function stockStatus(r: Reminder, logs: TaskInstance[], today = getTodayIST()): StockStatus | null {
  const s = r.medicine?.stock;
  if (!s || !(s.perDose > 0)) return null;
  const taken = logs.filter(t => t.reminderId === r.id && t.status === 'completed' && t.completedAt && t.completedAt >= s.refilledAt).length;
  const remaining = Math.max(0, round1(s.quantity - taken * s.perDose));
  const perDay = dosesPerDay(r) * s.perDose;
  const daysLeft = perDay > 0 ? Math.floor(remaining / perDay) : null;
  const course = courseStatus(r, today);
  const daysOfCourseLeft = r.medicine?.endDate ? daysBetween(today, r.medicine.endDate) + 1 : null;
  // If the course finishes before the stock runs out, there's nothing to refill.
  const endsBeforeEmpty = daysOfCourseLeft !== null && daysLeft !== null && daysOfCourseLeft <= daysLeft;
  const active = r.isActive && course?.state !== 'finished';
  const out = active && remaining < s.perDose;
  const low = active && !out && !endsBeforeEmpty && daysLeft !== null && daysLeft <= s.lowDays;
  return { remaining, unit: s.unit, daysLeft, low, out: out && !endsBeforeEmpty, endsBeforeEmpty };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface CourseStatus { state: 'upcoming' | 'active' | 'finished'; day: number; total: number | null; startDate: string; endDate?: string }

/** Course window for medicines with a start/end date. null = ongoing with no dates. */
export function courseStatus(r: Reminder, today = getTodayIST()): CourseStatus | null {
  const start = r.medicine?.startDate, end = r.medicine?.endDate;
  if (!start && !end) return null;
  const startDate = start ?? today;
  const total = end ? daysBetween(startDate, end) + 1 : null;
  if (today < startDate) return { state: 'upcoming', day: 0, total, startDate, endDate: end };
  if (end && today > end) return { state: 'finished', day: total ?? 0, total, startDate, endDate: end };
  return { state: 'active', day: daysBetween(startDate, today) + 1, total, startDate, endDate: end };
}

export const courseEndFromDays = (start: string, days: number) => addDays(start, Math.max(1, days) - 1);

/** "10 ml" → { amount: 10, unit: 'ml' }; "1 tablet" → { 1, 'tablets' }; best effort for pre-filling. */
export function parseDosage(text?: string): { amount?: number; unit?: StockUnit } {
  if (!text) return {};
  const m = text.replace(',', '').match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]*)/);
  if (!m) return {};
  const amount = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  const unit: StockUnit | undefined =
    u.startsWith('ml') ? 'ml' : u.startsWith('tab') ? 'tablets' : u.startsWith('cap') ? 'capsules'
    : u.startsWith('sach') ? 'sachets' : u.startsWith('drop') ? 'drops' : undefined;
  // "60000 IU" is a strength, not an amount you count — treat as 1 dose.
  if (u === 'iu' || u === 'mg' || u === 'mcg' || u === 'g') return { amount: 1, unit: 'doses' };
  return { amount, unit };
}
