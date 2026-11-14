import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Plus, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { family } from '../lib/family';
import { useFamilyPeople, usePersonData, personDay, displayName } from '../lib/useFamily';
import { formatTime, getTodayIST, getCurrentTimeIST, isMissed } from '../utils/dateHelpers';
import { NOTIFICATION_SLOTS } from '../utils/constants';
import { doseMeta } from '../utils/dose';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton, SkeletonList } from '../components/ui/Skeleton';
import type { TaskInstance } from '../types';

const ALERTS = [{ v: 0, l: 'Off' }, { v: 30, l: '30 min' }, { v: 60, l: '1 hour' }, { v: 120, l: '2 hours' }];
const shift = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** One person I follow: their day, their week, their medicines; tick / edit if they allowed "can manage". */
export default function FamilyPerson() {
  const { linkId = '' } = useParams<{ linkId: string }>();
  const navigate = useNavigate();
  const { list, reload: reloadPeople } = useFamilyPeople();
  const p = useMemo(() => list?.find(x => x.link_id === linkId && x.role === 'following'), [list, linkId]);
  const { data, setData, error } = usePersonData(p);
  const [alert, setAlert] = useState<number | null>(null);

  if (list && !p) {
    return (
      <div className="page pt-6 text-center">
        <p className="text-sm text-gray-500 mb-4">You don't follow this person (any more).</p>
        <Link to="/family" className="btn-secondary">Back to Family</Link>
      </div>
    );
  }
  if (!p || !data) {
    return (
      <div className="page pt-4" role="status" aria-label="Loading">
        <Skeleton className="w-10 h-10 rounded-xl mb-5" /><Skeleton className="h-6 w-40 mb-5" /><SkeletonList rows={3} />
        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
      </div>
    );
  }

  const d = personDay(p, data.reminders, data.logs);
  const name = displayName(p);
  const now = getCurrentTimeIST(), today = getTodayIST();
  const alertAfter = alert ?? p.alert_after;

  const mark = async (t: TaskInstance, done: boolean) => {
    const next: TaskInstance = { ...t, status: done ? 'completed' : 'pending', completedAt: done ? new Date().toISOString() : undefined, skippedReason: undefined };
    setData(s => s && ({ ...s, logs: [...s.logs.filter(x => x.id !== t.id), next] }));
    try { await family.saveLog(p.person_id, next); toast.success(done ? `Marked taken for ${name}` : 'Undone', { id: 'fam', duration: 1500 }); }
    catch (e) { toast.error((e as Error).message, { id: 'fam' }); setData(s => s && ({ ...s, logs: [...s.logs.filter(x => x.id !== t.id), t] })); }
  };
  const setAlertAfter = async (v: number) => {
    setAlert(v);
    try { await family.update(p.link_id, { alertAfter: v }); toast.success(v ? `Alert after ${ALERTS.find(a => a.v === v)!.l} if not taken` : 'Alerts off', { id: 'fam' }); reloadPeople(); }
    catch (e) { setAlert(null); toast.error((e as Error).message, { id: 'fam' }); }
  };
  const stop = async () => {
    const ok = await confirmDialog({ title: `Stop following ${name}?`, message: 'You will stop seeing their medicines and getting alerts.', confirmText: 'Stop', tone: 'danger' });
    if (!ok) return;
    try { await family.end(p.link_id); navigate('/family', { replace: true }); } catch (e) { toast.error((e as Error).message); }
  };

  // last 7 days: % taken per day (missed = unticked or never marked)
  const days = Array.from({ length: 7 }, (_, i) => shift(today, i - 6)).map(date => {
    const items = data.logs.filter(t => t.date === date && !t.id.includes('__sos__'));
    const done = items.filter(t => t.status === 'completed').length;
    const counted = items.filter(t => t.status === 'completed' || isMissed(t) || (t.status === 'pending' && date < today)).length;
    return { date, pct: counted ? Math.round((done / counted) * 100) : null };
  });

  return (
    <div className="page pt-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/family')} className="btn-icon" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="page-title truncate">{name}</h1>
          <p className="text-xs text-gray-400">{p.can_manage ? 'You can see and manage their medicines' : 'You can see their medicines'}</p>
        </div>
      </div>

      {d.paused && <div className="rounded-2xl px-4 py-3 mb-4 bg-saffron-500/10 border border-saffron-400/40 text-sm text-saffron-700">🌴 {name} is on holiday — reminders paused{p.paused_until ? ` until ${new Date(p.paused_until + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.</div>}

      <p className="section-label mb-2 px-1">Today · {d.taken} of {d.today.length} taken</p>
      {d.today.length === 0 ? <p className="card p-4 text-sm text-gray-400 mb-4">No medicines scheduled today.</p> : (
        <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden mb-4">
          {d.today.map(t => {
            const r = data.reminders.find(x => x.id === t.reminderId);
            const done = t.status === 'completed', missed = isMissed(t), late = t.status === 'pending' && t.scheduledTime <= now;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] font-medium truncate ${done ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>{t.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {t.slot ? NOTIFICATION_SLOTS[t.slot].label : 'At'} {formatTime(t.scheduledTime)}{doseMeta(r) ? ` · ${doseMeta(r)}` : ''}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${done ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                  : missed ? 'bg-red-50 text-red-500 dark:bg-red-500/10' : late ? 'bg-saffron-500/15 text-saffron-600' : 'bg-gray-100 text-gray-500 dark:bg-[#2C2C2E]'}`}>
                  {done ? `Taken${t.completedAt ? ' ' + new Date(t.completedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : ''}` : missed ? 'Missed' : late ? 'Not yet' : 'Later'}
                </span>
                {p.can_manage && (
                  <button onClick={() => mark(t, !done)} aria-label={done ? `Undo ${t.title} for ${name}` : `Mark ${t.title} taken for ${name}`}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${done ? 'bg-brand-600 border-brand-600' : 'border-gray-300 dark:border-gray-600'}`}>
                    {done && <Check size={14} className="text-white" strokeWidth={3} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {d.low.length > 0 && (
        <div className="space-y-2 mb-4">
          {d.low.map(l => (
            <div key={l.r.id} className={`rounded-2xl px-4 py-3 border text-sm ${l.out ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-500/10' : 'bg-saffron-500/10 border-saffron-400/40 text-saffron-700'}`}>
              🧴 {l.r.title}: {l.out ? 'out of stock' : `only ${l.remaining} ${l.unit} left`}
            </div>
          ))}
        </div>
      )}

      <p className="section-label mb-2 px-1">Last 7 days{d.week ? ` · ${d.week.pct}%` : ''}</p>
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {days.map(x => (
            <div key={x.date}>
              <div className={`h-9 rounded-lg flex items-center justify-center text-[11px] font-semibold ${x.pct === null ? 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-400'
                : x.pct >= 80 ? 'bg-brand-600 text-white' : x.pct >= 50 ? 'bg-saffron-500 text-white' : 'bg-red-400 text-white'}`}>{x.pct === null ? '–' : `${x.pct}`}</div>
              <span className="text-[10px] text-gray-400">{new Date(x.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        {d.week?.pattern && <p className="text-xs text-saffron-600 mt-3">💡 Most often missed: {d.week.pattern}</p>}
      </div>

      <div className="flex items-center justify-between mb-2 px-1">
        <p className="section-label">Their medicines</p>
        {p.can_manage && <Link to={`/family/${p.link_id}/add`} className="text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1"><Plus size={13} /> Add medicine</Link>}
      </div>
      <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden mb-5">
        {data.reminders.length === 0 && <p className="p-4 text-sm text-gray-400">No medicines yet.</p>}
        {data.reminders.map(r => (
          <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.isActive ? '' : 'opacity-50'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.title}</p>
              <p className="text-xs text-gray-400 truncate">{[doseMeta(r), r.medicine?.asNeeded ? 'Only when needed' : r.slots.map(s => NOTIFICATION_SLOTS[s].label).join(' & ') || (r.customTime ? formatTime(r.customTime) : ''), r.isActive ? '' : 'Paused'].filter(Boolean).join(' · ')}</p>
            </div>
            {p.can_manage && <Link to={`/family/${p.link_id}/edit/${r.id}`} aria-label={`Edit ${r.title}`} className="btn-icon w-8 h-8"><Pencil size={14} /></Link>}
          </div>
        ))}
      </div>

      <p className="section-label mb-2 px-1">Alert me if a dose isn't marked</p>
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E] mb-2">
        {ALERTS.map(a => (
          <button key={a.v} type="button" onClick={() => setAlertAfter(a.v)} aria-pressed={alertAfter === a.v}
            className={`py-2 rounded-lg text-[13px] font-medium ${alertAfter === a.v ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{a.l}</button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mb-6 px-1">You'll get a notification if {name} hasn't ticked a medicine this long after its time. Low-stock warnings come every morning.</p>

      <button onClick={stop} className="w-full py-3 text-sm font-medium text-red-500">Stop following {name}</button>
    </div>
  );
}
