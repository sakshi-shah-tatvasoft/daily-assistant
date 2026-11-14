import type { Reminder, TaskInstance, Profile, AppSettings, DailyLog } from '../types';
import { LEGACY_DEFAULT_REMINDERS } from '../data/initialData';

// ── Row ⇄ model mapping ──────────────────────────────────────────────────────

export interface ReminderRow {
  id: string; title: string; description: string | null; category: Reminder['category'];
  slots: string[]; custom_time: string | null; repeat: Reminder['repeat']; repeat_days: number[];
  once_date: string | null; notes: string | null; is_active: boolean;
  medicine: Reminder['medicine'] | null; created_at: string;
  remind_again?: { every: number; times: number } | null;
}

export function reminderToRow(r: Reminder): ReminderRow {
  return {
    id: r.id, title: r.title, description: r.description ?? null, category: r.category,
    slots: r.slots ?? [], custom_time: r.customTime ?? null, repeat: r.repeat,
    repeat_days: r.repeatDays ?? [], once_date: r.date ?? null, notes: r.notes ?? null,
    is_active: r.isActive, medicine: r.medicine ?? null, created_at: r.createdAt,
    ...(r.remindAgain !== undefined && { remind_again: r.remindAgain }),
  };
}

export function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id, title: row.title, description: row.description ?? undefined, category: row.category,
    slots: (row.slots ?? []) as Reminder['slots'], customTime: row.custom_time ?? undefined,
    repeat: row.repeat, repeatDays: row.repeat_days?.length ? row.repeat_days : undefined,
    date: row.once_date ?? undefined, notes: row.notes ?? undefined, isActive: row.is_active,
    medicine: row.medicine ?? undefined, createdAt: row.created_at,
    remindAgain: row.remind_again ?? undefined,
  };
}

export interface LogRow {
  id: string; reminder_id: string; date: string; scheduled_time: string; slot: string | null;
  title: string; category: string; status: TaskInstance['status']; completed_at: string | null;
  skipped_reason: string | null; is_late: boolean | null;
}

export function logToRow(t: TaskInstance): LogRow {
  return {
    id: t.id, reminder_id: t.reminderId, date: t.date, scheduled_time: t.scheduledTime,
    slot: t.slot ?? null, title: t.title, category: t.category, status: t.status,
    completed_at: t.completedAt ?? null, skipped_reason: t.skippedReason ?? null, is_late: t.isLate ?? null,
  };
}

export function rowToLog(row: LogRow): TaskInstance {
  return {
    id: row.id, reminderId: row.reminder_id, date: String(row.date).slice(0, 10), scheduledTime: row.scheduled_time,
    slot: (row.slot ?? undefined) as TaskInstance['slot'], title: row.title,
    category: row.category as TaskInstance['category'], status: row.status,
    completedAt: row.completed_at ?? undefined, skippedReason: row.skipped_reason ?? undefined,
    isLate: row.is_late ?? undefined,
  };
}

// ── Diffing ──────────────────────────────────────────────────────────────────

/** Last occurrence wins — guards against ever sending the same row twice in one batch. */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map(x => [x.id, x])).values()];
}

/** Rows to upsert / ids to delete to turn `prev` into `next`. */
export function diffById<T extends { id: string }>(prev: T[], nextRaw: T[]) {
  const next = dedupeById(nextRaw);
  const prevMap = new Map(prev.map(x => [x.id, JSON.stringify(x)]));
  const nextIds = new Set(next.map(x => x.id));
  return {
    upserts: next.filter(x => prevMap.get(x.id) !== JSON.stringify(x)),
    deletes: prev.filter(x => !nextIds.has(x.id)).map(x => x.id),
  };
}

/**
 * Three-way merge by id: start from the server copy, then re-apply only what THIS device changed since it last
 * synced (`base` → `local`). Changes made on other devices are kept; local edits win on the same item.
 */
export function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const { upserts, deletes } = diffById(base, local);
  const del = new Set(deletes);
  const up = new Map(upserts.map(x => [x.id, x]));
  const merged = remote.filter(x => !del.has(x.id)).map(x => up.get(x.id) ?? x);
  const have = new Set(merged.map(x => x.id));
  return [...merged, ...upserts.filter(x => !have.has(x.id))];
}

export function mergeSnapshot<S extends { reminders: Reminder[]; logs: TaskInstance[]; profile: Profile }>(base: S, local: S, remote: S): S {
  return {
    ...remote,
    reminders: mergeById(base.reminders, local.reminders, remote.reminders),
    logs:      mergeById(base.logs, local.logs, remote.logs),
    profile:   { ...remote.profile, ...diffProfile(base.profile, local.profile) },
  };
}

export const PROFILE_SYNC_FIELDS = ['display_name', 'timezone', 'theme', 'slot_times', 'push_enabled', 'onboarded', 'legacy_imported', 'follow_up_minutes', 'water', 'paused_until', 'language'] as const;

export function diffProfile(prev: Profile, next: Profile): Partial<Profile> {
  const patch: Record<string, unknown> = {};
  for (const k of PROFILE_SYNC_FIELDS) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) patch[k] = next[k];
  }
  return patch as Partial<Profile>;
}

// ── Grouping helpers ─────────────────────────────────────────────────────────

export function groupLogs(logs: TaskInstance[]): Record<string, DailyLog> {
  const out: Record<string, DailyLog> = {};
  for (const t of logs) {
    (out[t.date] ??= { date: t.date, taskInstances: [] }).taskInstances.push(t);
  }
  return out;
}

export function flattenLogs(daily: Record<string, DailyLog>): TaskInstance[] {
  return dedupeById(Object.values(daily).flatMap(d => d.taskInstances));
}

// ── Legacy (pre-account) data on this device ─────────────────────────────────

export const LEGACY_KEYS = ['da_reminders_v2', 'da_logs_v2', 'da_settings_v2', 'da_device_id', 'da_push_subscribed', 'da_task_checks_v1'];
const LEGACY_BACKUP_KEY = 'da_legacy_backup_v2';

function readJSON<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
}

/** True if this device was used with the old, account-less version of the app. */
export function hasLegacyData(): boolean {
  return ['da_reminders_v2', 'da_logs_v2', 'da_settings_v2', 'da_device_id'].some(k => localStorage.getItem(k) !== null);
}

export function readLegacyData(): { reminders: Reminder[]; logs: TaskInstance[]; settings: AppSettings | null } | null {
  if (!hasLegacyData()) return null;
  const rawReminders = readJSON<Reminder[]>('da_reminders_v2');
  // The old app only saved reminders after an edit; otherwise it used the hard-coded defaults.
  const validReminders = Array.isArray(rawReminders) && rawReminders.length && 'slots' in rawReminders[0];
  const reminders = validReminders ? rawReminders! : LEGACY_DEFAULT_REMINDERS;
  const logsByDate = readJSON<Record<string, DailyLog>>('da_logs_v2') ?? {};
  const logs = flattenLogs(logsByDate).filter(t => t && t.id && t.date);
  return { reminders, logs, settings: readJSON<AppSettings>('da_settings_v2') };
}

/** Keep a backup copy, then remove the old keys so the import never runs twice. */
export function archiveLegacyData() {
  const backup: Record<string, string | null> = {};
  for (const k of LEGACY_KEYS) backup[k] = localStorage.getItem(k);
  localStorage.setItem(LEGACY_BACKUP_KEY, JSON.stringify({ archivedAt: new Date().toISOString(), data: backup }));
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
}
