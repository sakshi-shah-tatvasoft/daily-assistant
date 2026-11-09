import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getTodayIST, formatTime, isMissed } from '../utils/dateHelpers';
import { doseMeta } from '../utils/dose';
import { isMissedEntry } from '../utils/insights';
import type { TaskInstance } from '../types';

const RANGES = [7, 30, 90];
const shift = (date: string, n: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const long = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dayLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const clock = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '';

/** A plain, printable record of what was taken and missed — for showing a doctor. Made on the phone, nothing is sent anywhere. */
export default function Report() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dailyLogs, sosLogs, reminders, profile } = useApp();
  const [days, setDays] = useState(30);
  const [habits, setHabits] = useState(false);
  const today = getTodayIST();
  const from = shift(today, -(days - 1));
  const byId = useMemo(() => new Map(reminders.map(r => [r.id, r])), [reminders]);
  const keep = (t: TaskInstance) => t.date >= from && t.date <= today && (habits || t.category === 'medicine');

  const entries = useMemo(() => Object.values(dailyLogs).flatMap(d => d.taskInstances).filter(keep)
    // Today's not-yet-due items aren't part of the record yet.
    .filter(t => !(t.date === today && t.status === 'pending'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.scheduledTime.localeCompare(b.scheduledTime)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [dailyLogs, from, today, habits]);
  const sos = useMemo(() => sosLogs.filter(keep).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sosLogs, from, today, habits]);

  const rows = useMemo(() => {
    const m = new Map<string, { title: string; detail: string; taken: number; missed: number; skipped: number }>();
    for (const t of entries) {
      const r = byId.get(t.reminderId);
      const row = m.get(t.reminderId) ?? { title: t.title, detail: doseMeta(r), taken: 0, missed: 0, skipped: 0 };
      if (t.status === 'completed') row.taken++;
      else if (isMissedEntry(t, today)) row.missed++;
      else if (t.status === 'skipped') row.skipped++;
      row.title = t.title;
      m.set(t.reminderId, row);
    }
    return [...m.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [entries, byId, today]);
  const totals = rows.reduce((s, r) => ({ taken: s.taken + r.taken, missed: s.missed + r.missed }), { taken: 0, missed: 0 });
  const pct = (taken: number, missed: number) => taken + missed ? `${Math.round((taken / (taken + missed)) * 100)}%` : '—';

  const byDay = useMemo(() => {
    const m = new Map<string, TaskInstance[]>();
    for (const t of entries) { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date)!.push(t); }
    return [...m.entries()].reverse();
  }, [entries]);

  const statusText = (t: TaskInstance) =>
    t.status === 'completed' ? `Taken${t.completedAt ? ` · ${clock(t.completedAt)}` : ''}`
    : isMissed(t) || isMissedEntry(t, today) ? (t.status === 'pending' ? 'Not marked' : 'Missed') : 'Skipped';

  return (
    <div className="page pt-4">
      <div className="flex items-center gap-3 mb-4 print:hidden">
        <button onClick={() => navigate(-1)} className="btn-icon" aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="page-title">Doctor report</h1>
      </div>

      <div className="print:hidden mb-4 space-y-3">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E]">
          {RANGES.map(n => (
            <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n}
              className={`py-2 rounded-lg text-[13px] font-medium ${days === n ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              Last {n} days
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={habits} onChange={e => setHabits(e.target.checked)} className="w-4 h-4 accent-brand-600" />
          Include habits & routines
        </label>
        <button onClick={() => window.print()} className="btn-primary w-full"><Printer size={16} /> Print or save as PDF</button>
        <p className="text-[11px] text-gray-400 text-center">On iPhone: tap Print, then Share → Save to Files to keep a PDF.</p>
      </div>

      {/* The report itself (white, also on screen, so it looks like the printout) */}
      <article className="bg-white text-gray-900 rounded-2xl border border-gray-200 p-4 print:border-0 print:p-0 print:rounded-none text-[13px] leading-snug">
        <header className="border-b border-gray-200 pb-3 mb-3">
          <h2 className="text-lg font-bold">Medication record{habits ? ' & habits' : ''}</h2>
          <p>{profile.display_name || user?.email}</p>
          <p className="text-gray-500">{long(from)} – {long(today)} · made {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
        </header>

        {rows.length === 0 && sos.length === 0 ? (
          <p className="text-gray-500 py-6 text-center">Nothing recorded in this period.</p>
        ) : (
          <>
            {rows.length > 0 && (
              <section className="mb-4">
                <h3 className="font-semibold mb-1.5">Summary</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-gray-500 text-[11px] uppercase">
                      <th className="py-1 pr-2 font-medium">Name</th>
                      <th className="py-1 px-1 font-medium text-right">Taken</th>
                      <th className="py-1 px-1 font-medium text-right">Missed</th>
                      <th className="py-1 pl-1 font-medium text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.title} className="border-t border-gray-100 align-top">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{r.title}</span>
                          {r.detail && <span className="block text-[11px] text-gray-500">{r.detail}</span>}
                          {r.skipped > 0 && <span className="block text-[11px] text-gray-500">{r.skipped} skipped on purpose</span>}
                        </td>
                        <td className="py-1.5 px-1 text-right">{r.taken}</td>
                        <td className="py-1.5 px-1 text-right">{r.missed}</td>
                        <td className="py-1.5 pl-1 text-right font-semibold">{pct(r.taken, r.missed)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td className="py-1.5 pr-2">All</td>
                      <td className="py-1.5 px-1 text-right">{totals.taken}</td>
                      <td className="py-1.5 px-1 text-right">{totals.missed}</td>
                      <td className="py-1.5 pl-1 text-right">{pct(totals.taken, totals.missed)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-500 mt-1">Missed = not ticked at the reminder, or never marked.</p>
              </section>
            )}

            {sos.length > 0 && (
              <section className="mb-4">
                <h3 className="font-semibold mb-1.5">Taken only when needed (SOS)</h3>
                <ul className="space-y-0.5">
                  {sos.map(t => (
                    <li key={t.id}>{dayLabel(t.date)}, {clock(t.completedAt)} — {t.title}{byId.get(t.reminderId)?.medicine?.dosage ? ` (${byId.get(t.reminderId)!.medicine!.dosage})` : ''}</li>
                  ))}
                </ul>
              </section>
            )}

            {byDay.length > 0 && (
              <section>
                <h3 className="font-semibold mb-1.5">Day by day</h3>
                {byDay.map(([date, list]) => (
                  <div key={date} className="mb-2 break-inside-avoid">
                    <p className="font-medium text-gray-700">{dayLabel(date)}</p>
                    <ul>
                      {list.map(t => (
                        <li key={t.id} className="flex justify-between gap-3 py-0.5 border-b border-gray-50">
                          <span className="min-w-0">{formatTime(t.scheduledTime)} · {t.title}</span>
                          <span className={`flex-shrink-0 ${t.status === 'completed' ? 'text-emerald-700' : t.status === 'skipped' && !isMissed(t) ? 'text-gray-500' : 'text-red-600'}`}>{statusText(t)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        <footer className="border-t border-gray-200 mt-4 pt-2 text-[11px] text-gray-500">
          Made with Daily Assistant from reminders the user entered and ticked themselves. It shows what was marked in the
          app — not a medical record, diagnosis or advice.
        </footer>
      </article>
    </div>
  );
}
