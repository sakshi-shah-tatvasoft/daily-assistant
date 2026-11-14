/**
 * Demo mode ("Try the demo" on the login screen): the full app with realistic sample data that lives ONLY in this
 * browser. No account, no email, nothing is sent to the server. "Exit demo" wipes it.
 * Every data layer checks isDemo() and uses the local stores below instead of Supabase.
 */
import type { Reminder, TaskInstance, Profile, NotificationSlot } from '../types';
import { getTodayIST, getCurrentTimeIST, shouldReminderRunToday } from '../utils/dateHelpers';
import { DEFAULT_SETTINGS } from '../utils/constants';
import { t } from './i18n';

const FLAG = 'da_demo_v1';
const PREFIX = 'da_demo_';
export const DEMO_USER_ID = '00000000-0000-4000-8000-00000000d3e0';
export const DEMO_EMAIL = 'demo@dailyassistant.app';

export const isDemo = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };

export function startDemo() {
  endDemoData();
  try { localStorage.setItem(FLAG, '1'); } catch { /* private mode: demo can't run */ }
  seed();
  window.location.replace('/');
}
export function endDemo() {
  endDemoData();
  try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
  window.location.replace('/');
}
function endDemoData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k === `da_cache_v3_${DEMO_USER_ID}` || k === 'da_task_checks_v1' || k.startsWith('da_water_v1_')) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

export function demoGet<T>(name: string, fallback: T): T {
  try { const v = localStorage.getItem(PREFIX + name); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
export function demoSet<T>(name: string, value: T) { try { localStorage.setItem(PREFIX + name, JSON.stringify(value)); } catch { /* ignore */ } }

export class DemoOnly extends Error { constructor(what = 'This') { super(t("{what} isn't available in the demo — it needs a real (invited) account.", { what: t(what) })); } }

// ── Sample data ────────────────────────────────────────────────────────────────
const shift = (date: string, n: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const iso = (date: string, hhmm: string, plusMin = 0) => new Date(Date.parse(`${date}T${hhmm}:00+05:30`) + plusMin * 60000).toISOString();
const weekday = (date: string) => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;     // 0 = Mon
/** Deterministic "random" so the demo looks the same every time. */
const roll = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 100) / 100; };

export interface DemoSnapshot { reminders: Reminder[]; logs: TaskInstance[]; profile: Profile }

function makeLogs(reminders: Reminder[], slotTimes: Record<NotificationSlot, string>, days: number, today: string, idPrefix = ''): TaskInstance[] {
  const out: TaskInstance[] = [];
  const now = getCurrentTimeIST();
  for (let i = days; i >= 0; i--) {
    const date = shift(today, -i);
    for (const r of reminders) {
      if (!r.isActive || r.medicine?.asNeeded || r.createdAt.slice(0, 10) > date || !shouldReminderRunToday(r, date)) continue;
      const occ = r.slots.length ? r.slots.map(s => ({ slot: s as NotificationSlot | undefined, time: slotTimes[s], id: `${r.id}__${s}__${date}` }))
        : r.customTime ? [{ slot: undefined, time: r.customTime, id: `${r.id}__custom__${date}` }] : [];
      for (const o of occ) {
        const base = { id: idPrefix + o.id, reminderId: r.id, date, scheduledTime: o.time, slot: o.slot, title: r.title, category: r.category };
        if (date === today) {
          if (o.time <= now && o.slot === 'morning' && !r.title.startsWith('Thyroid')) out.push({ ...base, status: 'completed', completedAt: iso(date, o.time, 12) });
          continue;   // the rest of today is still to do
        }
        const p = roll(o.id);
        const mondayMorning = weekday(date) === 0 && o.slot === 'morning';
        if (mondayMorning && p < 0.85) out.push({ ...base, status: 'skipped', skippedReason: 'missed' });
        else if (p < 0.82) out.push({ ...base, status: 'completed', completedAt: iso(date, o.time, Math.round(p * 40)) });
        else if (p < 0.9) out.push({ ...base, status: 'skipped', skippedReason: 'missed' });
        else if (p < 0.94) out.push({ ...base, status: 'skipped', skippedReason: 'skipped' });
      }
    }
  }
  return out;
}

function seed() {
  const today = getTodayIST();
  const slots = DEFAULT_SETTINGS.notificationSlotTimes;
  const created = shift(today, -30) + 'T09:00:00.000Z';
  const med = (o: Partial<Reminder> & Pick<Reminder, 'id' | 'title'>): Reminder => ({
    category: 'medicine', slots: ['morning'], repeat: 'daily', isActive: true, createdAt: created, ...o,
  } as Reminder);
  const reminders: Reminder[] = [
    med({ id: 'demo-iron', title: 'Iron Syrup', slots: ['morning', 'after_dinner'],
      medicine: { dosage: '10 ml', mealRelation: 'after', stock: { quantity: 170, unit: 'ml', perDose: 10, refilledAt: iso(shift(today, -6), '07:00'), lowDays: 5 } } }),
    med({ id: 'demo-b12', title: 'Vitamin B12', medicine: { dosage: '1 tablet', mealRelation: 'after', stock: { quantity: 30, unit: 'tablets', perDose: 1, refilledAt: iso(shift(today, -12), '07:00'), lowDays: 5 } } }),
    med({ id: 'demo-d3', title: 'Vitamin D3', repeat: 'weekly', repeatDays: [3], medicine: { dosage: '60,000 IU', mealRelation: 'after' } }),
    med({ id: 'demo-anti', title: 'Antibiotic', slots: ['morning', 'after_dinner'], createdAt: shift(today, -2) + 'T09:00:00.000Z',
      medicine: { dosage: '1 tablet', mealRelation: 'after', startDate: shift(today, -2), endDate: shift(today, 2) } }),
    med({ id: 'demo-pcm', title: 'Paracetamol', slots: [], medicine: { dosage: '1 tablet', mealRelation: 'after', asNeeded: true,
      stock: { quantity: 10, unit: 'tablets', perDose: 1, refilledAt: iso(shift(today, -10), '07:00'), lowDays: 3 } } }),
    { id: 'demo-walk', title: 'Morning walk', category: 'habit', slots: [], customTime: '07:00', repeat: 'daily', isActive: true, createdAt: created, description: '20 minutes' },
    { id: 'demo-read', title: 'Read 10 pages', category: 'habit', slots: ['after_dinner'], repeat: 'daily', isActive: true, createdAt: created },
    { id: 'demo-meditate', title: 'Meditate', category: 'routine', slots: ['morning'], repeat: 'weekdays', isActive: true, createdAt: created },
  ];
  const logs = makeLogs(reminders, slots, 13, today);
  for (const [n, t] of [[1, '14:10'], [4, '21:30'], [0, '13:05']] as const) {
    if (n === 0 && getCurrentTimeIST() < t) continue;
    const d = shift(today, -n);
    logs.push({ id: `demo-pcm__sos__${d}__${n}`, reminderId: 'demo-pcm', date: d, scheduledTime: t, title: 'Paracetamol', category: 'medicine', status: 'completed', completedAt: iso(d, t) });
  }
  const profile: Profile = {
    id: DEMO_USER_ID, display_name: 'Priya', timezone: 'Asia/Kolkata', theme: 'system', slot_times: slots,
    push_enabled: false, onboarded: true, legacy_imported: true, follow_up_minutes: 15,
    water: { on: true, every: 120, from: '08:00', to: '22:00', goal: 8 }, paused_until: null, is_admin: false,
  };
  demoSet<DemoSnapshot>('snapshot', { reminders, logs, profile });

  // Daily checklist (last 6 days submitted)
  const tasks = [['t1', 'Walk 20 minutes'], ['t2', 'Read 10 pages'], ['t3', 'No sugar after 8 pm'], ['t4', 'Sleep by 11']]
    .map(([id, name], i) => ({ id: `demo-${id}`, name, sortOrder: i, isActive: true }));
  const taskLogs = [];
  for (let i = 6; i >= 1; i--) {
    const date = shift(today, -i);
    for (const t of tasks) taskLogs.push({ taskId: t.id, date, completed: roll(t.id + date) < 0.75, submittedAt: iso(date, '22:30') });
  }
  demoSet('tasks', { tasks, logs: taskLogs });
  demoSet('water', { [today]: Math.min(3, Math.max(0, Math.floor((Date.now() / 3600000 + 5.5) % 24 / 3) - 2)) });

  // Family: following "Maa" (can manage), followed by "Rohan" (view only)
  const maaMeds: Reminder[] = [
    med({ id: 'maa-bp', title: 'BP tablet', medicine: { dosage: '1 tablet', mealRelation: 'after', stock: { quantity: 4, unit: 'tablets', perDose: 1, refilledAt: iso(shift(today, -1), '07:00'), lowDays: 5 } } }),
    med({ id: 'maa-thyroid', title: 'Thyroid tablet', medicine: { dosage: '50 mcg', mealRelation: 'before' } }),
    med({ id: 'maa-calcium', title: 'Calcium', slots: ['after_dinner'], medicine: { dosage: '1 tablet', mealRelation: 'after' } }),
  ];
  demoSet('family', {
    people: [
      { link_id: 'demo-link-maa', role: 'following', person_id: 'demo-maa', name: 'Asha', nickname: 'Maa', can_manage: true, alert_after: 60,
        slot_times: slots, timezone: 'Asia/Kolkata', paused_until: null, since: shift(today, -20) },
      { link_id: 'demo-link-rohan', role: 'follower', person_id: 'demo-rohan', name: 'Rohan', nickname: null, can_manage: false, alert_after: 60,
        slot_times: null, timezone: null, paused_until: null, since: shift(today, -8) },
    ],
    data: { 'demo-maa': { reminders: maaMeds, logs: makeLogs(maaMeds, slots, 13, today) } },
  });
}
