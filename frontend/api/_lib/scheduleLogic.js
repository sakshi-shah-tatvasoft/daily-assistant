// Pure scheduling helpers — no I/O, unit-tested (npm run test:api).
// (Moved from backend/src/scheduleLogic.js when the backend left Railway.)

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
function reminderLine(r) {
  const m = r.medicine || {};
  const details = [m.dosage, MEAL[m.mealRelation]].filter(Boolean).join(', ');
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

function linesFor(due) {
  const lines = due.slice(0, 4).map(reminderLine);
  if (due.length > 4) lines.push(`+${due.length - 4} more`);
  return lines.join('\n');
}

/** Notification payload for a slot. Tapping opens that slot's check-in. */
function buildSlotNotification(slot, time, due, badge) {
  return {
    title: `${SLOT_LABELS[slot] ?? slot} · ${prettyTime(time)}`,
    body:  linesFor(due),
    tag:   `da-${slot}`,
    url:   `/checkin/${slot}`,
    badge: badge ?? due.length,
  };
}

/** Second nudge when a slot is still not checked in. Replaces the first (same tag). */
function buildSlotFollowUp(slot, due, badge) {
  return {
    title: `Still pending · ${(SLOT_LABELS[slot] ?? slot).replace(/^\S+\s/, '')}`,
    body:  linesFor(due),
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

function buildCustomNotification(r, time, badge) {
  return { title: `⏰ Reminder · ${prettyTime(time)}`, body: reminderLine(r), tag: `da-custom-${r.id}`, url: `/checkin/custom-${r.id}`, badge: badge ?? 1 };
}

function buildCustomFollowUp(r, badge) {
  return { title: 'Still pending · Reminder', body: reminderLine(r), tag: `da-custom-${r.id}`, url: `/checkin/custom-${r.id}`, badge: badge ?? 1 };
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

function buildStockNotification(r, st) {
  return {
    title: st.out ? '🧴 Out of stock' : '🧴 Running low',
    body: st.out ? `${r.title} — time to refill` : `${r.title} — about ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'} left (${st.remaining} ${st.unit})`,
    tag: `da-stock-${r.id}`,
    url: `/reminders/edit/${r.id}`,
  };
}

function buildSnoozeNotification(label, due, badge, url) {
  return { title: `⏰ Snoozed · ${label}`, body: linesFor(due), tag: `da-snooze-${url}`, url, badge: badge ?? due.length };
}

// ── "Remind me again" (alarm-style repeats) ─────────────────────────────────
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

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
  dosesPerDay, stockStatus, buildStockNotification, buildSnoozeNotification, localNow, runsOn, dueTitles, dueReminders, dueCustom, minusMinutes, pendingDueCount,
  buildSlotNotification, buildSlotFollowUp, buildCustomNotification, buildCustomFollowUp, reminderLine, SLOT_LABELS };
