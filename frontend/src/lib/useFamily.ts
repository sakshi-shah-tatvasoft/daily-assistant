import { useCallback, useEffect, useState } from 'react';
import { family, type FamilyPerson } from './family';
import { buildDay } from '../context/AppContext';
import { getTodayIST, getCurrentTimeIST, isMissed } from '../utils/dateHelpers';
import { stockStatus, isPausedOn } from '../utils/schedule';
import { weeklySummary } from '../utils/insights';
import { DEFAULT_SETTINGS } from '../utils/constants';
import type { Reminder, TaskInstance } from '../types';
import { t } from './i18n';

/** The people I follow / who follow me. `list` is null while loading. */
export function useFamilyPeople() {
  const [list, setList] = useState<FamilyPerson[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setList(await family.people()); setError(''); } catch (e) { setError((e as Error).message); setList(l => l ?? []); }
  }, []);
  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);
  return { list, error, reload: load };
}

export interface PersonDay {
  today: TaskInstance[]; taken: number; notYet: number; missed: number; upcoming: number;
  reminders: Reminder[]; logs: TaskInstance[];
  low: { r: Reminder; remaining: number; unit: string; out: boolean }[];
  week: ReturnType<typeof weeklySummary>; paused: boolean;
}

/** Compute a followed person's day from their medicines + logs (same rules as their own Today screen). */
export function personDay(p: FamilyPerson, reminders: Reminder[], logs: TaskInstance[]): PersonDay {
  const today = getTodayIST(), now = getCurrentTimeIST();
  const paused = isPausedOn({ paused_until: p.paused_until }, today);
  const slotTimes = p.slot_times ?? DEFAULT_SETTINGS.notificationSlotTimes;
  const scored = logs.filter(t => !t.id.includes('__sos__'));
  const todays = buildDay(reminders, scored.filter(t => t.date === today), slotTimes, today, paused)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const taken = todays.filter(t => t.status === 'completed').length;
  const missed = todays.filter(isMissed).length;
  const notYet = todays.filter(t => t.status === 'pending' && t.scheduledTime <= now).length;
  const upcoming = todays.filter(t => t.status === 'pending' && t.scheduledTime > now).length;
  const low = reminders.map(r => ({ r, s: stockStatus(r, logs) }))
    .filter(x => x.s && (x.s.low || x.s.out)).map(x => ({ r: x.r, remaining: x.s!.remaining, unit: x.s!.unit, out: x.s!.out }));
  return { today: todays, taken, notYet, missed, upcoming, reminders, logs, low, week: weeklySummary(scored, today), paused };
}

/** One followed person's live data. */
export function usePersonData(p: FamilyPerson | undefined) {
  const [data, setData] = useState<{ reminders: Reminder[]; logs: TaskInstance[] } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!p) return;
    try { setData(await family.data(p.person_id, getTodayIST())); setError(''); } catch (e) { setError((e as Error).message); }
  }, [p]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load, setData };
}

export const displayName = (p: Pick<FamilyPerson, 'nickname' | 'name'>) => p.nickname || p.name || t('Family member');
