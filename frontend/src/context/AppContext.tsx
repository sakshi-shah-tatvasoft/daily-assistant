import { createContext, useContext, useEffect, useCallback, useRef, useState, useMemo } from 'react';
import type { Reminder, TaskInstance, DailyLog, AppSettings, Profile } from '../types';
import { getTodayIST, getCurrentTimeIST, shouldReminderRunToday, MISSED } from '../utils/dateHelpers';
import { isSos, isAsNeeded, isPausedOn } from '../utils/schedule';
import { DEFAULT_SETTINGS } from '../utils/constants';
import { supabase } from '../lib/supabase';
import { useAuth, userCacheKey } from './AuthContext';
import {
  reminderToRow, rowToReminder, logToRow, rowToLog, diffById, diffProfile, mergeSnapshot,
  groupLogs, flattenLogs, dedupeById, readLegacyData, archiveLegacyData, type ReminderRow, type LogRow,
} from '../lib/sync';

/**
 * Data flow:
 *   Supabase (source of truth, per-user via RLS)  ⇄  `synced` snapshot  →  `data` (what the UI shows)
 * Every change updates `data` instantly; a background flush pushes the difference between
 * `data` and `synced` to Supabase. If offline, the difference simply waits and is retried.
 * Both are cached in localStorage so the app opens instantly and survives being closed offline.
 */

interface Snapshot { reminders: Reminder[]; logs: TaskInstance[]; profile: Profile }
type SyncState = 'synced' | 'syncing' | 'offline';

interface AppContextType {
  status:       'loading' | 'ready' | 'error';
  loadError:    string | null;
  syncState:    SyncState;
  reload:       () => void;
  profile:      Profile;
  updateProfile:(patch: Partial<Profile>) => void;
  reminders:    Reminder[];
  setReminders: (v: Reminder[] | ((p: Reminder[]) => Reminder[])) => void;
  allLogs:      TaskInstance[];   // includes SOS doses (for stock)
  sosLogs:      TaskInstance[];
  logSos:       (r: Reminder) => string;
  removeSos:    (id: string) => void;
  dayInstances: (date: string) => TaskInstance[];
  setDayStatus: (inst: TaskInstance, status: 'completed' | 'missed' | 'skipped' | 'pending') => void;
  dailyLogs:    Record<string, DailyLog>;
  setDailyLogs: (v: Record<string, DailyLog> | ((p: Record<string, DailyLog>) => Record<string, DailyLog>)) => void;
  settings:     AppSettings;
  setSettings:  (v: AppSettings | ((p: AppSettings) => AppSettings)) => void;
  todayTasks:   TaskInstance[];
  completeTask: (id: string) => void;
  skipTask:     (id: string, reason?: string) => void;
  undoTask:     (id: string) => void;
  submitCheckIn:(doneIds: string[], missedIds: string[]) => void;
  refreshToday: () => void;
  legacyImported: boolean;
  importLegacy: () => boolean;
}

const AppContext = createContext<AppContextType | null>(null);

const LOG_HISTORY_DAYS = 400;
const PAGE = 1000;

function emptyProfile(id: string): Profile {
  return {
    id, display_name: null, timezone: DEFAULT_SETTINGS.timezone, theme: 'system',
    slot_times: DEFAULT_SETTINGS.notificationSlotTimes, push_enabled: false,
    onboarded: false, legacy_imported: false, follow_up_minutes: 15,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function readCache(uid: string): { current: Snapshot; synced: Snapshot } | null {
  try { return JSON.parse(localStorage.getItem(userCacheKey(uid)) ?? 'null'); } catch { return null; }
}
function writeCache(uid: string, current: Snapshot, synced: Snapshot) {
  try { localStorage.setItem(userCacheKey(uid), JSON.stringify({ current, synced })); } catch { /* quota */ }
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

async function fetchServer(uid: string): Promise<Snapshot> {
  const since = new Date(Date.now() - LOG_HISTORY_DAYS * 864e5).toISOString().slice(0, 10);
  const [profileRes, reminders, logs] = await Promise.all([
    supabase.from('profiles')
      .select('*')   // '*' so a not-yet-migrated column never breaks loading
      .eq('id', uid).single(),
    fetchAll<ReminderRow>((a, b) => supabase.from('reminders').select('*').order('created_at').range(a, b)),
    fetchAll<LogRow>((a, b) => supabase.from('dose_logs').select('*').gte('date', since).order('date').order('id').range(a, b)),
  ]);
  if (profileRes.error) throw profileRes.error;
  return {
    profile:   { ...emptyProfile(uid), ...profileRes.data } as Profile,
    reminders: dedupeById(reminders.map(rowToReminder)),
    logs:      dedupeById(logs.map(rowToLog)),
  };
}

/** A day's instances from reminders, keeping status of anything already logged that day.
 *  `paused` (holiday mode) → nothing new is due; already-marked items stay. SOS medicines are never scheduled. */
function buildDay(reminders: Reminder[], existing: TaskInstance[], slotTimes: Profile['slot_times'], today: string, paused = false): TaskInstance[] {
  const prevById = new Map(existing.map(t => [t.id, t]));
  const fresh: TaskInstance[] = [];
  const scheduled = paused ? [] : reminders.filter(r => r.isActive && !isAsNeeded(r) && shouldReminderRunToday(r, today));
  for (const r of scheduled) {
    const base = { reminderId: r.id, date: today, title: r.title, category: r.category, status: 'pending' as const };
    if (r.slots.length) {
      for (const slot of r.slots) {
        const id = `${r.id}__${slot}__${today}`;
        const prev = prevById.get(id);
        fresh.push(prev ? { ...prev, title: r.title, scheduledTime: slotTimes[slot] }
                        : { ...base, id, slot, scheduledTime: slotTimes[slot] });
      }
    } else if (r.customTime) {
      const id = `${r.id}__custom__${today}`;
      const prev = prevById.get(id);
      fresh.push(prev ? { ...prev, title: r.title, scheduledTime: r.customTime } : { ...base, id, scheduledTime: r.customTime });
    }
  }
  // Keep history: anything already completed/skipped today stays even if the reminder changed.
  const freshIds = new Set(fresh.map(t => t.id));
  const kept = existing.filter(t => !freshIds.has(t.id) && t.status !== 'pending');
  return [...fresh, ...kept];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user!.id;

  const cached = useMemo(() => readCache(uid), [uid]);
  const [data, setData]     = useState<Snapshot | null>(cached?.current ?? null);
  const syncedRef           = useRef<Snapshot | null>(cached?.synced ?? null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(cached ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('synced');
  const [legacyImported, setLegacyImported] = useState(false);
  const loadedFromServer = useRef(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const lastFetch = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  // ── Load from server ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const server = await fetchServer(uid);
      lastFetch.current = Date.now();
      const current = dataRef.current;
      const synced  = syncedRef.current;
      const pending = Boolean(current && synced && !same(current, synced));
      syncedRef.current = server;
      // Unsynced local edits: merge them onto the fresh server copy (never drop other devices' changes —
      // flush then pushes only this device's edits).
      let next: Snapshot = pending ? mergeSnapshot(synced!, current!, server) : server;
      // First login on a device that used the old account-less app → bring that data across.
      if (!pending && !server.profile.legacy_imported && server.reminders.length === 0) {
        const legacy = readLegacyData();
        if (legacy) {
          next = {
            reminders: legacy.reminders,
            logs: legacy.logs,
            profile: {
              ...server.profile,
              legacy_imported: true,
              theme: legacy.settings?.theme ?? server.profile.theme,
              slot_times: legacy.settings?.notificationSlotTimes ?? server.profile.slot_times,
            },
          };
          archiveLegacyData();   // backup kept; cached copy + flush carry the data to the server
          setLegacyImported(true);
        }
      }
      setData(next);
      loadedFromServer.current = true;
      setServerLoaded(true);
      setLoadError(null);
      setStatus('ready');
    } catch (e) {
      console.error('[sync] load failed', e);
      setLoadError(e instanceof Error ? e.message : 'Could not load your data');
      setStatus(s => (s === 'ready' ? 'ready' : 'error'));  // keep showing cached data if we have it
      setSyncState('offline');
    }
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  // ── Flush local changes to server ──────────────────────────────────────────
  const flushing = useRef(false);
  const flushAgain = useRef(false);
  const retryTimer = useRef<number>();

  const flush = useCallback(async () => {
    const current = dataRef.current;
    const synced  = syncedRef.current;
    if (!current || !synced || !loadedFromServer.current) return;
    if (same(current, synced)) { setSyncState('synced'); return; }
    if (flushing.current) { flushAgain.current = true; return; }
    flushing.current = true;
    setSyncState('syncing');
    try {
      const rem = diffById(synced.reminders, current.reminders);
      const log = diffById(synced.logs, current.logs);
      const profilePatch = diffProfile(synced.profile, current.profile);
      const now = new Date().toISOString();

      if (Object.keys(profilePatch).length) {
        let { error } = await supabase.from('profiles').update({ ...profilePatch, updated_at: now }).eq('id', uid);
        // A column whose migration hasn't been run yet → save everything else instead of failing the whole sync.
        const missing = (['water', 'paused_until'] as const).filter(k => k in profilePatch && error?.message.includes(k));
        if (error && missing.length) {
          const rest: Record<string, unknown> = { ...profilePatch };
          for (const k of missing) delete rest[k];
          ({ error } = Object.keys(rest).length
            ? await supabase.from('profiles').update({ ...rest, updated_at: now }).eq('id', uid) : { error: null });
        }
        if (error) throw error;
      }
      if (rem.upserts.length) {
        const rows = rem.upserts.map(r => ({ ...reminderToRow(r), user_id: uid, updated_at: now }));
        let { error } = await supabase.from('reminders').upsert(rows, { onConflict: 'user_id,id' });
        if (error && /remind_again/.test(error.message)) {   // column not added yet (migration pending)
          ({ error } = await supabase.from('reminders')
            .upsert(rows.map(({ remind_again: _omit, ...r }) => r), { onConflict: 'user_id,id' }));
        }
        if (error) throw error;
      }
      if (rem.deletes.length) {
        const { error } = await supabase.from('reminders').delete().in('id', rem.deletes);
        if (error) throw error;
      }
      for (let i = 0; i < log.upserts.length; i += 500) {
        const { error } = await supabase.from('dose_logs')
          .upsert(log.upserts.slice(i, i + 500).map(t => ({ ...logToRow(t), user_id: uid, updated_at: now })), { onConflict: 'user_id,id' });
        if (error) throw error;
      }
      if (log.deletes.length) {
        const { error } = await supabase.from('dose_logs').delete().in('id', log.deletes);
        if (error) throw error;
      }
      syncedRef.current = current;
      writeCache(uid, dataRef.current!, current);
      setSyncState(same(dataRef.current, current) ? 'synced' : 'syncing');
    } catch (e) {
      console.error('[sync] flush failed', e);
      setSyncState('offline');
      window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => flush(), 15_000);
    } finally {
      flushing.current = false;
      if (flushAgain.current) { flushAgain.current = false; flush(); }
    }
  }, [uid]);

  // Persist + debounce-flush on every change
  useEffect(() => {
    if (!data || !syncedRef.current) return;
    writeCache(uid, data, syncedRef.current);
    const t = window.setTimeout(flush, 400);
    return () => window.clearTimeout(t);
  }, [data, uid, flush]);

  // Retry when the network returns; refresh when the app comes back to the foreground
  useEffect(() => {
    const onOnline = () => flush();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const pending = dataRef.current && syncedRef.current && !same(dataRef.current, syncedRef.current);
      if (pending) flush();
      else if (Date.now() - lastFetch.current > 60_000) load();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flush, load]);

  // ── Derived values + setters (same API the pages already use) ──────────────
  const profile   = data?.profile ?? emptyProfile(uid);
  const reminders = data?.reminders ?? [];
  // Scored history (no SOS doses) for Today / Progress; allLogs also has SOS doses (stock counts them).
  const allLogs   = useMemo(() => data?.logs ?? [], [data?.logs]);
  const dailyLogs = useMemo(() => groupLogs(allLogs.filter(t => !isSos(t))), [allLogs]);
  const sosLogs   = useMemo(() => allLogs.filter(isSos), [allLogs]);
  const settings: AppSettings = useMemo(() => ({
    timezone: profile.timezone,
    theme: profile.theme,
    notificationSlotTimes: profile.slot_times,
    pushNotificationsEnabled: profile.push_enabled,
  }), [profile]);

  const update = useCallback((fn: (s: Snapshot) => Snapshot) => {
    setData(prev => (prev ? fn(prev) : prev));
  }, []);

  const setReminders: AppContextType['setReminders'] = v =>
    update(s => ({ ...s, reminders: typeof v === 'function' ? v(s.reminders) : v }));

  const setDailyLogs: AppContextType['setDailyLogs'] = v =>
    update(s => ({ ...s, logs: flattenLogs(typeof v === 'function' ? v(groupLogs(s.logs)) : v) }));

  const updateProfile = (patch: Partial<Profile>) =>
    update(s => ({ ...s, profile: { ...s.profile, ...patch } }));

  const setSettings: AppContextType['setSettings'] = v =>
    update(s => {
      const cur: AppSettings = {
        timezone: s.profile.timezone, theme: s.profile.theme,
        notificationSlotTimes: s.profile.slot_times, pushNotificationsEnabled: s.profile.push_enabled,
      };
      const next = typeof v === 'function' ? v(cur) : v;
      return { ...s, profile: { ...s.profile, timezone: next.timezone, theme: next.theme,
        slot_times: next.notificationSlotTimes, push_enabled: next.pushNotificationsEnabled } };
    });

  // ── Today's task instances ─────────────────────────────────────────────────
  const [today, setToday] = useState(getTodayIST());
  useEffect(() => {
    const t = window.setInterval(() => setToday(getTodayIST()), 60_000); // handle midnight while open
    return () => window.clearInterval(t);
  }, []);

  const refreshToday = useCallback(() => {
    update(s => {
      const others   = s.logs.filter(t => t.date !== today || isSos(t));
      const existing = s.logs.filter(t => t.date === today && !isSos(t));
      const day = buildDay(s.reminders, existing, s.profile.slot_times, today, isPausedOn(s.profile, today));
      return same(day, existing) ? s : { ...s, logs: [...others, ...day] };
    });
  }, [today, update]);

  // Rebuild today's list once server data is in, and whenever reminders / slot times change.
  useEffect(() => {
    if (serverLoaded) refreshToday();
  }, [serverLoaded, today, data?.reminders, data?.profile.slot_times, data?.profile.paused_until, refreshToday]);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (profile.theme !== 'system') { root.classList.toggle('dark', profile.theme === 'dark'); return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    root.classList.toggle('dark', mq.matches);
    const handler = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [profile.theme]);

  // App-icon badge: items whose time has come and are still pending (iOS 16.4+ home-screen apps).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge || !loadedFromServer.current) return;
    const update = () => {
      const now = getCurrentTimeIST();
      const n = (data?.logs ?? []).filter(t => t.date === today && !isSos(t) && t.status === 'pending' && t.scheduledTime <= now).length;
      (n ? nav.setAppBadge!(n) : nav.clearAppBadge?.())?.catch(() => {});
    };
    update();
    const t = window.setInterval(update, 60_000);
    return () => window.clearInterval(t);
  }, [data?.logs, today, serverLoaded]);

  const todayTasks = (dailyLogs[today]?.taskInstances ?? [])
    .slice()
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const updateTask = (id: string, patch: Partial<TaskInstance>) =>
    update(s => ({ ...s, logs: s.logs.map(t => (t.id === id ? { ...t, ...patch } : t)) }));

  const completeTask = (id: string) =>
    updateTask(id, { status: 'completed', completedAt: new Date().toISOString() });
  const skipTask = (id: string, reason?: string) =>
    updateTask(id, { status: 'skipped', skippedReason: reason });
  /** Check-in submit: ticked → completed, unticked → skipped with reason 'missed'. One update. */
  const submitCheckIn = (doneIds: string[], missedIds: string[]) => {
    const done = new Set(doneIds), missed = new Set(missedIds);
    const now = new Date().toISOString();
    update(s => ({ ...s, logs: s.logs.map(t =>
      done.has(t.id) ? (t.status === 'completed' ? t : { ...t, status: 'completed', completedAt: now, skippedReason: undefined })
      : missed.has(t.id) ? { ...t, status: 'skipped', skippedReason: MISSED, completedAt: undefined }
      : t) }));
  };
  const undoTask = (id: string) =>
    updateTask(id, { status: 'pending', completedAt: undefined, skippedReason: undefined });

  /** SOS medicine: log one dose now (counts against stock, never against scores). */
  const logSos = (r: Reminder) => {
    const now = new Date();
    const id = `${r.id}__sos__${today}__${now.getTime().toString(36)}`;
    const t: TaskInstance = { id, reminderId: r.id, date: today, scheduledTime: getCurrentTimeIST(), title: r.title,
      category: r.category, status: 'completed', completedAt: now.toISOString() };
    update(s => ({ ...s, logs: [...s.logs, t] }));
    return id;
  };
  const removeSos = (id: string) => update(s => ({ ...s, logs: s.logs.filter(t => t.id !== id) }));

  /** Any day's list for editing history: what was scheduled that day (current reminders, created by then)
   *  plus everything already logged. Not saved until a status is set. */
  const dayInstances = (date: string): TaskInstance[] => {
    const s = dataRef.current; if (!s) return [];
    const existing = s.logs.filter(t => t.date === date && !isSos(t));
    const born = s.reminders.filter(r => !r.createdAt || r.createdAt.slice(0, 10) <= date);
    return buildDay(born, existing, s.profile.slot_times, date, isPausedOn(s.profile, date))
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  };
  /** Fix a past (or today's) entry. Taken doses are stamped at their scheduled time so stock maths stays right. */
  const setDayStatus = (inst: TaskInstance, status: 'completed' | 'missed' | 'skipped' | 'pending') => {
    const stamp = new Date(`${inst.date}T${inst.scheduledTime}:00+05:30`).toISOString();
    const next: TaskInstance = {
      ...inst,
      status: status === 'missed' ? 'skipped' : status,
      completedAt: status === 'completed' ? (inst.status === 'completed' && inst.completedAt ? inst.completedAt : (inst.date === today ? new Date().toISOString() : stamp)) : undefined,
      skippedReason: status === 'missed' ? MISSED : status === 'skipped' ? 'skipped' : undefined,
    };
    update(s => ({ ...s, logs: s.logs.some(t => t.id === inst.id) ? s.logs.map(t => (t.id === inst.id ? next : t)) : [...s.logs, next] }));
  };

  /** Manual import (Settings) — merges old-version data on this device into the account. */
  const importLegacy = () => {
    const legacy = readLegacyData();
    if (!legacy) return false;
    archiveLegacyData();
    update(s => {
      const remIds = new Set(s.reminders.map(r => r.id));
      const logIds = new Set(s.logs.map(t => t.id));
      return {
        ...s,
        reminders: [...s.reminders, ...legacy.reminders.filter(r => !remIds.has(r.id))],
        logs: [...s.logs, ...legacy.logs.filter(t => !logIds.has(t.id))],
        profile: { ...s.profile, legacy_imported: true },
      };
    });
    return true;
  };

  return (
    <AppContext.Provider value={{
      status, loadError, syncState, reload: load,
      profile, updateProfile,
      reminders, setReminders,
      dailyLogs, setDailyLogs, allLogs, sosLogs, logSos, removeSos, dayInstances, setDayStatus,
      settings, setSettings,
      todayTasks, completeTask, skipTask, undoTask, submitCheckIn, refreshToday,
      legacyImported, importLegacy,
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
