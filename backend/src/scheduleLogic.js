// Pure scheduling helpers — no I/O, unit-testable.

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

/** Notification payload for a slot. Max 4 lines, then "+N more". */
function buildSlotNotification(slot, time, due) {
  const lines = due.slice(0, 4).map(reminderLine);
  if (due.length > 4) lines.push(`+${due.length - 4} more`);
  return {
    title: `${SLOT_LABELS[slot] ?? slot} · ${prettyTime(time)}`,
    body:  lines.join('\n'),
    tag:   `da-${slot}`,
    url:   '/',
  };
}


module.exports = { localNow, runsOn, dueTitles, dueReminders, buildSlotNotification, reminderLine, SLOT_LABELS };
