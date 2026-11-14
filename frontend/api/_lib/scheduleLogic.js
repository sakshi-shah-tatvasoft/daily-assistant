// Pure scheduling helpers — no I/O, unit-tested (npm run test:api).
// (Moved from backend/src/scheduleLogic.js when the backend left Railway.)

import { tr } from './i18n.js';

const SLOT_LABELS = {
  morning:      '☀️ Morning',
  afternoon:    '🌤️ Afternoon',
  after_dinner: '🌙 After Dinner',
  overall:      '🔔 Overall',
};

/** Current local date (YYYY-MM-DD), time (HH:mm) and weekday (0=Mon…6=Sun) in a timezone. */
function localNow(timezone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value]),
  );
  const weekdays = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    date:    `${parts.year}-${parts.month}-${parts.day}`,
    time:    `${parts.hour}:${parts.minute}`,
    weekday: weekdays[parts.weekday],
    dayOfMonth: Number(parts.day),
  };
}

/** Does this reminder run on the given local day? Mirrors the frontend's shouldReminderRunToday. */
function runsOn(reminder, { date, weekday, dayOfMonth }) {
  const days = reminder.repeat_days || [];
  // Course window (medicines): nothing before the start or after the last day.
  const m = reminder.medicine || {};
  if (m.startDate && date < m.startDate) return false;
  if (m.endDate && date > m.endDate) return false;
  switch (reminder.repeat) {
    case 'daily':    return true;
    case 'once':     return reminder.once_date === date;
    case 'weekdays': return weekday < 5;
    case 'weekly':
    case 'custom':   return days.includes(weekday);
    case 'monthly':  return days.includes(dayOfMonth);
    default:         return true;
  }
}

/** Reminders due in `slot` today, excluding ones already marked done/skipped. */
function dueReminders(reminders, logsById, slot, day) {
  return reminders
    .filter(r => r.is_active && (r.slots || []).includes(slot) && runsOn(r, day))
    .filter(r => {
      const log = logsById.get(`${r.id}__${slot}__${day.date}`);
      return !log || log.status === 'pending';
    });
}
const dueTitles = (...args) => dueReminders(...args).map(r => r.title);

const MEAL = { after: 'after meal', before: 'before meal', with: 'with meal' };
/** "Iron Syrup — 10 ml, after meal" */
function reminderLine(r, lang = 'en') {
  const m = r.medicine || {};
  const details = [m.dosage, MEAL[m.mealRelation] && tr(lang, MEAL[m.mealRelation])].filter(Boolean).join(', ');
  return details ? `${r.title} — ${details}` : r.title;
}

/** 12-hour time for notification titles: "09:00" → "9:00 PM" */
function prettyTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "HH:mm" minus n minutes, or null if that crosses midnight (follow-ups don't wrap days). */
function minusMinutes(hhmm, n) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m - n;
  if (t < 0) return null;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function linesFor(due, lang = 'en') {
  const lines = due.slice(0, 4).map(r => reminderLine(r, lang));
  if (due.length > 4) lines.push(tr(lang, '+{n} more', { n: due.length - 4 }));
  return lines.join('\n');
}

/** Notification payload for a slot. Tapping opens that slot's check-in. */
function buildSlotNotification(slot, time, due, badge, lang = 'en') {
  return {
    title: `${tr(lang, SLOT_LABELS[slot] ?? slot)} · ${prettyTime(time)}`,
    body:  linesFor(due, lang),
    tag:   `da-${slot}`,
    url:   `/checkin/${slot}`,
    badge: badge ?? due.length,
  };
}

/** Second nudge when a slot is still not checked in. Replaces the first (same tag). */
function buildSlotFollowUp(slot, due, badge, lang = 'en') {
  return {
    title: tr(lang, 'Still pending · {slot}', { slot: tr(lang, SLOT_LABELS[slot] ?? slot).replace(/^\S+\s/, '') }),
    body:  linesFor(due, lang),
    tag:   `da-${slot}`,
    url:   `/checkin/${slot}`,
    badge: badge ?? due.length,
  };
}


/** Reminders set to a specific time ("Use a specific time instead") that are due right now. */
function dueCustom(reminders, logsById, day) {
  return reminders.filter(r =>
    r.is_active && r.custom_time === day.time && !(r.slots || []).length && runsOn(r, day) &&
    (() => { const log = logsById.get(`${r.id}__custom__${day.date}`); return !log || log.status === 'pending'; })());
}

function buildCustomNotification(r, time, badge, lang = 'en') {
  return { title: tr(lang, '⏰ Reminder · {time}', { time: prettyTime(time) }), body: reminderLine(r, lang), tag: `da-custom-${r.id}`, url: `/checkin/custom-${r.id}`, badge: badge ?? 1 };
}

function buildCustomFollowUp(r, badge, lang = 'en') {
  return { title: tr(lang, 'Still pending · Reminder'), body: reminderLine(r, lang), tag: `da-custom-${r.id}`, url: `/checkin/custom-${r.id}`, badge: badge ?? 1 };
}

/** Items still pending today whose time has already come (for the app-icon badge). */
function pendingDueCount(reminders, logsById, slotTimes, day) {
  let n = 0;
  for (const [slot, time] of Object.entries(slotTimes || {})) {
    if (time <= day.time) n += dueReminders(reminders, logsById, slot, day).length;
  }
  for (const r of reminders) {
    if (r.custom_time && r.custom_time <= day.time && !(r.slots || []).length) {
      n += dueCustom([r], logsById, { ...day, time: r.custom_time }).length;
    }
  }
  return n;
}

// ── Stock (mirrors frontend utils/schedule.ts) ────────────────────────────────
function dosesPerDay(r) {
  const per = (r.slots || []).length || (r.custom_time ? 1 : 0);
  const n = (r.repeat_days || []).length;
  switch (r.repeat) {
    case 'daily': return per;
    case 'weekdays': return per * 5 / 7;
    case 'weekly': case 'custom': return per * n / 7;
    case 'monthly': return per * n / 30;
    default: return 0;
  }
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/** completedAts: ISO timestamps of this reminder's completed doses. */
function stockStatus(r, completedAts, today) {
  const m = r.medicine || {}, s = m.stock;
  if (!s || !(s.perDose > 0)) return null;
  const taken = completedAts.filter(t => t >= s.refilledAt).length;
  const remaining = Math.max(0, Math.round((s.quantity - taken * s.perDose) * 10) / 10);
  if (m.asNeeded) {   // SOS: warn when this many doses are left (lowDays = doses)
    const out = r.is_active && remaining < s.perDose;
    return { remaining, unit: s.unit, daysLeft: null, low: r.is_active && !out && remaining / s.perDose <= s.lowDays, out };
  }
  const perDay = dosesPerDay(r) * s.perDose;
  const daysLeft = perDay > 0 ? Math.floor(remaining / perDay) : null;
  const finished = m.endDate && today > m.endDate;
  const courseDaysLeft = m.endDate ? daysBetween(today, m.endDate) + 1 : null;
  const endsBeforeEmpty = courseDaysLeft !== null && daysLeft !== null && courseDaysLeft <= daysLeft;
  const active = r.is_active && !finished;
  const out = active && remaining < s.perDose && !endsBeforeEmpty;
  const low = active && !out && !endsBeforeEmpty && daysLeft !== null && daysLeft <= s.lowDays;
  return { remaining, unit: s.unit, daysLeft, low, out };
}

function buildStockNotification(r, st, lang = 'en') {
  const unit = tr(lang, st.unit), v = { title: r.title, n: st.remaining, unit, days: st.daysLeft };
  return {
    title: tr(lang, st.out ? '🧴 Out of stock' : '🧴 Running low'),
    body: st.out ? tr(lang, "{title} — time to refill. Tap when you've bought more.", v)
      : st.daysLeft === null ? tr(lang, "{title} — only {n} {unit} left. Tap when you've bought more.", v)
      : tr(lang, st.daysLeft === 1 ? "{title} — {n} {unit} left (about 1 day). Tap when you've bought more." : "{title} — {n} {unit} left (about {days} days). Tap when you've bought more.", v),
    tag: `da-stock-${r.id}`,
    url: `/refill/${r.id}`,
  };
}

function buildSnoozeNotification(label, due, badge, url, lang = 'en') {
  return { title: tr(lang, '⏰ Snoozed · {label}', { label: tr(lang, label).replace(/^\S+\s/, '') }), body: linesFor(due, lang), tag: `da-snooze-${url}`, url, badge: badge ?? due.length };
}

// ── "Remind me again" (alarm-style repeats) ─────────────────────────────────
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Catch-up: the minutes to check on this tick — now and up to `back` minutes before, never crossing midnight.
 *  If a tick is late or one is skipped, those reminders still go out (every send is claimed once, so no doubles). */
const CATCH_UP_MINUTES = 5;
function recentTimes(time, back = CATCH_UP_MINUTES) {
  const now = toMin(time), out = [];
  for (let k = back; k >= 0; k--) if (now - k >= 0) out.push(fmtMin(now - k));
  return out;
}

// ── Water ────────────────────────────────────────────────────────────────────
const WATER_EVERY = [30, 60, 120, 180];
const fmtMin = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

/** Reminder times for water settings: every N min after "from", up to and including "to". */
function waterTimes(w) {
  if (!w || w.on !== true || !WATER_EVERY.includes(w.every)) return [];
  if (!/^\d{2}:\d{2}$/.test(w.from || '') || !/^\d{2}:\d{2}$/.test(w.to || '')) return [];
  const from = toMin(w.from), to = toMin(w.to), out = [];
  for (let t = from + w.every; t <= to; t += w.every) out.push(fmtMin(t));
  return out;
}

/** True when a water reminder should go out now (and the goal isn't reached yet). */
function waterDue(w, time, glasses) {
  return waterTimes(w).includes(time) && glasses < (w.goal || 8);
}

function buildWaterNotification(glasses, goal, lang = 'en') {
  return {
    title: tr(lang, '💧 Time for water'),
    body: tr(lang, goal === 1 ? '{n} of {goal} glass so far. Tap to add a glass.' : '{n} of {goal} glasses so far. Tap to add a glass.', { n: glasses, goal }),
    tag: 'da-water',
    url: '/water/add',
  };
}

// ── Sunday summary ───────────────────────────────────────────────────────────
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT_WORDS = { morning: 'mornings', afternoon: 'afternoons', after_dinner: 'after-dinner doses', overall: 'night check-ins' };
const shiftDate = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = date => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;

/**
 * Last 7 days (ending `today`): done vs missed (missed = unticked at check-in, or left pending on a past day;
 * deliberate skips and SOS doses don't count). Pattern = the weekday + time most often missed over the last 4 weeks
 * (on at least 2 different dates), else the time missed on 2+ days this week. null when there's too little to say.
 * Rows: { id, date, slot, status, skipped_reason }.
 */
function weeklySummary(rows, today) {
  const missedRow = r => (r.status === 'skipped' && r.skipped_reason === 'missed') || (r.status === 'pending' && r.date < today);
  const scored = rows.filter(r => !String(r.id).includes('__sos__') && r.date <= today);
  const week = scored.filter(r => r.date >= shiftDate(today, -6));
  const done = week.filter(r => r.status === 'completed').length;
  const missed = week.filter(missedRow).length;
  const total = done + missed;
  if (total < 3) return null;
  const pct = Math.round((done / total) * 100);

  const datesBy = (list, keyOf) => {
    const m = new Map();
    for (const r of list.filter(missedRow)) { const k = keyOf(r); if (!m.has(k)) m.set(k, new Set()); m.get(k).add(r.date); }
    return [...m.entries()].map(([k, d]) => [k, d.size]).sort((a, b) => b[1] - a[1]);
  };
  let pattern = null, parts = null;
  const month = scored.filter(r => r.date >= shiftDate(today, -27));
  const [topDay] = datesBy(month, r => `${weekdayOf(r.date)}|${r.slot || ''}`);
  if (topDay && topDay[1] >= 2) {
    const [wd, slot] = topDay[0].split('|');
    pattern = `${DAY_NAMES[wd]} ${SLOT_WORDS[slot] || 'reminders'}`;
    parts = { day: DAY_NAMES[wd], slot: SLOT_WORDS[slot] || 'reminders' };
  } else {
    const [topSlot] = datesBy(week, r => r.slot || '');
    if (topSlot && topSlot[1] >= 2) { pattern = SLOT_WORDS[topSlot[0]] || 'exact-time reminders'; parts = { slot: pattern }; }
  }
  return { done, total, pct, pattern, parts };
}

function buildWeeklyNotification(sum, lang = 'en') {
  const pat = !sum.pattern ? '' : !sum.parts ? sum.pattern : sum.parts.day
    ? tr(lang, '{day} {slot}', { day: tr(lang, sum.parts.day), slot: tr(lang, sum.parts.slot) }) : tr(lang, sum.parts.slot);
  const body = sum.pct === 100 ? tr(lang, 'Every one of your {n} doses & habits this week — wonderful! 🎉', { n: sum.total })
    : tr(lang, '{done} of {total} done this week.', sum) + (pat ? tr(lang, ' Most often missed: {pattern}.', { pattern: pat }) : '');
  return { title: tr(lang, '📊 Your week: {pct}% done', { pct: sum.pct }), body, tag: 'da-weekly', url: '/progress' };
}

// ── Family: "not taken yet" alerts to followers ─────────────────────────────
/**
 * Doses whose (time + alertAfter) falls in this tick's window and that aren't ticked (pending, unmarked or
 * missed at check-in — a deliberate skip doesn't alert). Grouped per check-in so one push lists all of them.
 * Returns [{ key, time, items }] — key is the slot or 'custom-<id>' (part of the dedupe key).
 */
function familyDue(reminders, logsById, slotTimes, day, alertAfter, windowTimes) {
  if (!alertAfter) return [];
  const groups = new Map();
  for (const r of reminders) {
    if (!r.is_active || r.category !== 'medicine' || !runsOn(r, day)) continue;
    const occ = (r.slots || []).length
      ? r.slots.map(slot => ({ key: slot, time: slotTimes?.[slot], logId: `${r.id}__${slot}__${day.date}` }))
      : r.custom_time ? [{ key: `custom-${r.id}`, time: r.custom_time, logId: `${r.id}__custom__${day.date}` }] : [];
    for (const o of occ) {
      if (!o.time) continue;
      const at = toMin(o.time) + alertAfter;
      if (at >= 24 * 60 || !windowTimes.includes(fmtMin(at))) continue;
      const log = logsById.get(o.logId);
      if (log && (log.status === 'completed' || (log.status === 'skipped' && log.skipped_reason !== 'missed'))) continue;
      const g = groups.get(o.key) || { key: o.key, time: o.time, items: [] };
      g.items.push(r);
      groups.set(o.key, g);
    }
  }
  return [...groups.values()];
}

function buildFamilyNotification(name, g, linkId, lang = 'en') {
  const titles = g.items.map(r => r.title);
  const list = titles.length === 1 ? titles[0] : titles.length === 2 ? tr(lang, '{a} & {b}', { a: titles[0], b: titles[1] }) : tr(lang, '{a}, {b} +{n} more', { a: titles[0], b: titles[1], n: titles.length - 2 });
  return {
    title: tr(lang, "👀 {name} hasn't marked a medicine", { name }),
    body: tr(lang, '{list} ({time}) — not ticked yet.', { list, time: prettyTime(g.time) }),
    tag: `da-family-${linkId}-${g.key}`,
    url: `/family/${linkId}`,
  };
}

function buildFamilyStockNotification(name, r, st, linkId, lang = 'en') {
  const v = { title: r.title, n: st.remaining, unit: tr(lang, st.unit), days: st.daysLeft };
  return {
    title: tr(lang, st.out ? "🧴 {name}'s medicine is out of stock" : "🧴 {name}'s medicine is running low", { name }),
    body: st.out ? tr(lang, '{title} — time to refill.', v) : st.daysLeft === null ? tr(lang, '{title} — {n} {unit} left.', v)
      : tr(lang, st.daysLeft === 1 ? '{title} — {n} {unit} left (about 1 day).' : '{title} — {n} {unit} left (about {days} days).', v),
    tag: `da-family-stock-${r.id}`,
    url: `/family/${linkId}`,
  };
}

/** Effective repeat setting: the reminder's own, else the profile default (one repeat after N min), 0 = off. */
function remindAgainFor(r, profileFollowUp) {
  const own = r.remind_again;
  if (own && Number.isInteger(own.every)) return { every: Math.max(0, own.every), times: Math.min(Math.max(own.times || 1, 1), 3) };
  return profileFollowUp > 0 ? { every: profileFollowUp, times: 1 } : { every: 0, times: 0 };
}

/**
 * Repeats due right now, grouped per check-in key ('after_dinner' | 'custom-<id>').
 * A reminder repeats at occurrence + every, + 2×every … up to `times`, only while still pending.
 * Returns [{ key, slot, offset, items }] — offset (minutes after the occurrence) makes the dedupe key unique.
 */
function repeatsDue(reminders, logsById, slotTimes, day, profileFollowUp) {
  const now = toMin(day.time);
  const groups = new Map();
  for (const r of reminders) {
    if (!r.is_active || !runsOn(r, day)) continue;
    const cfg = remindAgainFor(r, profileFollowUp);
    if (!cfg.every) continue;
    const occurrences = (r.slots || []).length
      ? r.slots.map(slot => ({ slot, key: slot, time: slotTimes?.[slot], logId: `${r.id}__${slot}__${day.date}` }))
      : r.custom_time ? [{ slot: null, key: `custom-${r.id}`, time: r.custom_time, logId: `${r.id}__custom__${day.date}` }] : [];
    for (const o of occurrences) {
      if (!o.time) continue;
      const diff = now - toMin(o.time);
      if (diff <= 0 || diff % cfg.every !== 0 || diff / cfg.every > cfg.times) continue;
      const log = logsById.get(o.logId);
      if (log && log.status !== 'pending') continue;
      const g = groups.get(o.key) || { key: o.key, slot: o.slot, offset: diff, items: [] };
      g.items.push(r);
      g.offset = Math.min(g.offset, diff);
      groups.set(o.key, g);
    }
  }
  return [...groups.values()];
}

export {
  remindAgainFor, repeatsDue,
  waterTimes, waterDue, buildWaterNotification, recentTimes, CATCH_UP_MINUTES, weeklySummary, buildWeeklyNotification, familyDue, buildFamilyNotification, buildFamilyStockNotification,
  dosesPerDay, stockStatus, buildStockNotification, buildSnoozeNotification, localNow, runsOn, dueTitles, dueReminders, dueCustom, minusMinutes, pendingDueCount,
  buildSlotNotification, buildSlotFollowUp, buildCustomNotification, buildCustomFollowUp, reminderLine, SLOT_LABELS };
