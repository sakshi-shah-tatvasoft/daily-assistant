import type { TaskInstance } from '../types';
import { MISSED } from './dateHelpers';
import { isSos } from './schedule';

// Same rules as the server's Sunday summary (api/_lib/scheduleLogic.js → weeklySummary).
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT_WORDS: Record<string, string> = { morning: 'mornings', afternoon: 'afternoons', after_dinner: 'after-dinner doses', overall: 'night check-ins' };
const shift = (date: string, n: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = (date: string) => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;

export interface WeekSummary { done: number; total: number; pct: number; pattern: string | null }

/** Missed = unticked at check-in, or left pending on a past day. Deliberate skips and SOS doses don't count. */
export const isMissedEntry = (t: TaskInstance, today: string) =>
  (t.status === 'skipped' && t.skippedReason === MISSED) || (t.status === 'pending' && t.date < today);

export function weeklySummary(logs: TaskInstance[], today: string): WeekSummary | null {
  const scored = logs.filter(t => !isSos(t) && t.date <= today);
  const week = scored.filter(t => t.date >= shift(today, -6));
  const done = week.filter(t => t.status === 'completed').length;
  const missed = week.filter(t => isMissedEntry(t, today)).length;
  const total = done + missed;
  if (total < 3) return null;

  const datesBy = (list: TaskInstance[], keyOf: (t: TaskInstance) => string) => {
    const m = new Map<string, Set<string>>();
    for (const t of list.filter(x => isMissedEntry(x, today))) { const k = keyOf(t); if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(t.date); }
    return [...m.entries()].map(([k, d]) => [k, d.size] as const).sort((a, b) => b[1] - a[1]);
  };
  let pattern: string | null = null;
  const [topDay] = datesBy(scored.filter(t => t.date >= shift(today, -27)), t => `${weekdayOf(t.date)}|${t.slot ?? ''}`);
  if (topDay && topDay[1] >= 2) {
    const [wd, slot] = topDay[0].split('|');
    pattern = `${DAY_NAMES[Number(wd)]} ${SLOT_WORDS[slot] ?? 'reminders'}`;
  } else {
    const [topSlot] = datesBy(week, t => t.slot ?? '');
    if (topSlot && topSlot[1] >= 2) pattern = SLOT_WORDS[topSlot[0]] ?? 'exact-time reminders';
  }
  return { done, total, pct: Math.round((done / total) * 100), pattern };
}
