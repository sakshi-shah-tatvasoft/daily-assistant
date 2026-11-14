import { supabase } from './supabase';
import { reminderToRow, rowToReminder, logToRow, rowToLog, type ReminderRow, type LogRow } from './sync';
import type { Reminder, TaskInstance, NotificationSlotTimes } from '../types';
import { APP_URL } from './admin';
import { isDemo, demoGet, demoSet, DemoOnly } from './demo';
import { t } from './i18n';

// Demo mode: Maa (followed) and Rohan (follower) live in a local store.
interface DemoFamily { people: FamilyPerson[]; data: Record<string, { reminders: Reminder[]; logs: TaskInstance[] }> }
const dGet = () => demoGet<DemoFamily>('family', { people: [], data: {} });
const dSet = (v: DemoFamily) => demoSet('family', v);
const dPerson = (ownerId: string) => dGet().data[ownerId] ?? { reminders: [], logs: [] };

export interface FamilyPerson {
  link_id: string; role: 'following' | 'follower'; person_id: string; name: string | null; nickname: string | null;
  can_manage: boolean; alert_after: number; slot_times: NotificationSlotTimes | null; timezone: string | null;
  paused_until: string | null; since: string | null;
}
export interface PendingInvite { id: string; code: string; role: 'owner' | 'carer'; can_manage: boolean; invite_email: string | null; expires_at: string }
export interface InvitePreview { inviter_name: string | null; inviter_role: 'owner' | 'carer' | null; can_manage: boolean; valid: boolean; reason: string | null }

const MESSAGES: Record<string, string> = {
  NOT_FOUND: 'This invite link is not valid', USED: 'This invite has already been used', EXPIRED: 'This invite has expired — ask for a new one',
  OWN_INVITE: 'This is your own invite — send it to your family member', ALREADY_LINKED: 'You are already connected',
  BAD_EMAIL: 'That doesn’t look like an email address', FAMILY_INVITE_LIMIT: 'You can invite up to 5 family members by email',
  TOO_MANY_INVITES: 'Too many open invites — cancel some first', ONLY_OWNER: 'Only the person taking the medicines can change this',
};
const friendly = (msg: string) => {
  const code = Object.keys(MESSAGES).find(k => msg.includes(k));
  if (code) return t(MESSAGES[code]);
  if (/care_|function|relation/.test(msg)) return t('Family needs a one-time database update first');
  return t('Something went wrong — check your connection');
};
const fail = (e: { message: string } | null) => { if (e) throw new Error(friendly(e.message)); };

export const joinUrl = (code: string) => `${APP_URL}/family/join/${code}`;
export const familyInviteMessage = (code: string, role: 'owner' | 'carer', myName: string) => (role === 'owner'
  ? t('{name} would like you to keep an eye on their medicines in Daily Assistant 💊', { name: myName })
  : t("{name} would like to follow your medicines in Daily Assistant, so they know you're okay 💊", { name: myName }))
  + `\n\n${t('Tap to accept:')} ${joinUrl(code)}\n\n(${t('New to the app? Install steps:')} ${APP_URL}/about)`;

export const family = {
  async people(): Promise<FamilyPerson[]> {
    if (isDemo()) return dGet().people;
    const { data, error } = await supabase.rpc('care_people'); fail(error);
    return (Array.isArray(data) ? data : []) as FamilyPerson[];
  },
  async pending(myId: string): Promise<PendingInvite[]> {
    if (isDemo()) return [];
    const { data, error } = await supabase.from('care_links').select('id, code, owner_id, can_manage, invite_email, expires_at')
      .eq('created_by', myId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
    fail(error);
    return (data ?? []).map((l: { id: string; code: string; owner_id: string | null; can_manage: boolean; invite_email: string | null; expires_at: string }) =>
      ({ id: l.id, code: l.code, role: l.owner_id ? 'owner' : 'carer', can_manage: l.can_manage, invite_email: l.invite_email, expires_at: l.expires_at }));
  },
  async createInvite(role: 'owner' | 'carer', opts: { email?: string; nickname?: string; canManage?: boolean } = {}) {
    if (isDemo()) throw new DemoOnly('Sending family invites');
    const { data, error } = await supabase.rpc('care_create_invite', {
      p_role: role, p_email: opts.email?.trim() || null, p_nickname: opts.nickname?.trim() || null, p_can_manage: !!opts.canManage,
    });
    fail(error);
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; code: string };
    return row;
  },
  async preview(code: string): Promise<InvitePreview> {
    if (isDemo()) return { inviter_name: null, inviter_role: null, can_manage: false, valid: false, reason: 'NOT_FOUND' };
    const { data, error } = await supabase.rpc('care_invite_preview', { p_code: code }); fail(error);
    return ((Array.isArray(data) ? data[0] : data) ?? { valid: false, reason: 'NOT_FOUND' }) as InvitePreview;
  },
  async accept(code: string, opts: { canManage?: boolean; nickname?: string } = {}) {
    if (isDemo()) throw new DemoOnly('Accepting invites');
    const { error } = await supabase.rpc('care_accept', { p_code: code, p_can_manage: opts.canManage ?? null, p_nickname: opts.nickname?.trim() || null });
    fail(error);
  },
  async end(linkId: string) {
    if (isDemo()) { const d = dGet(); dSet({ ...d, people: d.people.filter(p => p.link_id !== linkId) }); return; }
    const { error } = await supabase.rpc('care_end', { p_link: linkId }); fail(error); },
  async update(linkId: string, patch: { canManage?: boolean; alertAfter?: number; nickname?: string }) {
    if (isDemo()) {
      const d = dGet();
      dSet({ ...d, people: d.people.map(p => p.link_id !== linkId ? p : { ...p, can_manage: patch.canManage ?? p.can_manage,
        alert_after: patch.alertAfter ?? p.alert_after, nickname: patch.nickname ?? p.nickname }) });
      return;
    }
    const { error } = await supabase.rpc('care_update', {
      p_link: linkId, p_can_manage: patch.canManage ?? null, p_alert_after: patch.alertAfter ?? null, p_nickname: patch.nickname ?? null,
    });
    fail(error);
  },

  /** A followed person's medicines + their dose logs (recent days, and far enough back for stock maths). */
  async data(ownerId: string, today: string): Promise<{ reminders: Reminder[]; logs: TaskInstance[] }> {
    if (isDemo()) return dPerson(ownerId);
    const { data: rem, error } = await supabase.from('reminders').select('*').eq('user_id', ownerId).eq('category', 'medicine').order('created_at');
    fail(error);
    const reminders = ((rem ?? []) as ReminderRow[]).map(rowToReminder);
    const weekAgo = new Date(Date.parse(today + 'T00:00:00Z') - 13 * 864e5).toISOString().slice(0, 10);
    const refills = reminders.map(r => r.medicine?.stock?.refilledAt?.slice(0, 10)).filter(Boolean) as string[];
    const yearAgo = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const since = [weekAgo, ...refills].sort()[0] < yearAgo ? yearAgo : [weekAgo, ...refills].sort()[0];
    const { data: logs, error: lErr } = await supabase.from('dose_logs').select('*').eq('user_id', ownerId).eq('category', 'medicine').gte('date', since).order('date');
    fail(lErr);
    return { reminders, logs: ((logs ?? []) as LogRow[]).map(rowToLog) };
  },
  /** "Can manage": tick / undo a dose for them (saved as their log). */
  async saveLog(ownerId: string, t: TaskInstance) {
    if (isDemo()) { const d = dGet(), p = dPerson(ownerId); dSet({ ...d, data: { ...d.data, [ownerId]: { ...p, logs: [...p.logs.filter(x => x.id !== t.id), t] } } }); return; }
    const { error } = await supabase.from('dose_logs').upsert({ ...logToRow(t), user_id: ownerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,id' });
    fail(error);
  },
  /** "Can manage": add / change their medicines. */
  async saveReminders(ownerId: string, list: Reminder[]) {
    if (!list.length) return;
    if (isDemo()) {
      const d = dGet(), p = dPerson(ownerId), ids = new Set(list.map(r => r.id));
      dSet({ ...d, data: { ...d.data, [ownerId]: { ...p, reminders: [...p.reminders.filter(r => !ids.has(r.id)), ...list] } } });
      return;
    }
    const now = new Date().toISOString();
    const rows = list.map(r => ({ ...reminderToRow({ ...r, category: 'medicine' }), user_id: ownerId, updated_at: now }));
    let { error } = await supabase.from('reminders').upsert(rows, { onConflict: 'user_id,id' });
    if (error && /remind_again/.test(error.message)) ({ error } = await supabase.from('reminders').upsert(rows.map(({ remind_again: _o, ...r }) => r), { onConflict: 'user_id,id' }));
    fail(error);
  },
  async deleteReminder(ownerId: string, id: string) {
    if (isDemo()) { const d = dGet(), p = dPerson(ownerId); dSet({ ...d, data: { ...d.data, [ownerId]: { ...p, reminders: p.reminders.filter(r => r.id !== id) } } }); return; }
    const { error } = await supabase.from('reminders').delete().eq('user_id', ownerId).eq('id', id); fail(error);
  },
};

/** Pending family invite opened before logging in — finished after login. */
const PENDING_KEY = 'da_family_join';
export const rememberJoin = (code: string) => { try { localStorage.setItem(PENDING_KEY, code); } catch { /* ignore */ } };
export const takePendingJoin = () => { try { const c = localStorage.getItem(PENDING_KEY); localStorage.removeItem(PENDING_KEY); return c; } catch { return null; } };
