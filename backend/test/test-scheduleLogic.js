const assert = require('assert');
const { localNow, runsOn, dueTitles, dueCustom, minusMinutes, pendingDueCount, buildSlotNotification, buildSlotFollowUp, buildCustomNotification } = require('../src/scheduleLogic');
// 2026-11-05 is a Thursday. 02:30 UTC = 08:00 IST
const d = localNow('Asia/Kolkata', new Date('2026-11-05T02:30:00Z'));
assert.deepStrictEqual(d, { date: '2026-11-05', time: '08:00', weekday: 3, dayOfMonth: 5 });
// Midnight rollover: 18:45 UTC on 4th = 00:15 IST on 5th
assert.strictEqual(localNow('Asia/Kolkata', new Date('2026-11-04T18:45:00Z')).date, '2026-11-05');
assert.strictEqual(localNow('Asia/Kolkata', new Date('2026-11-04T18:45:00Z')).time, '00:15');
const rem = [
  { id: 'iron', title: 'Iron', slots: ['morning', 'after_dinner'], repeat: 'daily', is_active: true },
  { id: 'd3', title: 'D3', slots: ['morning'], repeat: 'weekly', repeat_days: [3], is_active: true },
  { id: 'b12', title: 'B12', slots: ['morning'], repeat: 'daily', is_active: true },
  { id: 'off', title: 'Off', slots: ['morning'], repeat: 'daily', is_active: false },
  { id: 'm', title: 'Monthly', slots: ['morning'], repeat: 'monthly', repeat_days: [1, 15], is_active: true },
  { id: 'wk', title: 'Weekday', slots: ['morning'], repeat: 'weekdays', is_active: true },
];
const logs = new Map([['b12__morning__2026-11-05', { status: 'completed' }]]);
assert.deepStrictEqual(dueTitles(rem, logs, 'morning', d), ['Iron', 'D3', 'Weekday']);
assert.deepStrictEqual(dueTitles(rem, new Map(), 'after_dinner', d), ['Iron']);
const sun = localNow('Asia/Kolkata', new Date('2026-11-08T03:00:00Z'));
assert.strictEqual(sun.weekday, 6);
assert.deepStrictEqual(dueTitles(rem, new Map(), 'morning', sun), ['Iron', 'B12']);
assert.ok(runsOn({ repeat: 'once', once_date: '2026-11-05' }, d));
const n = buildSlotNotification('after_dinner', '21:00', [
  { title: 'Iron Syrup', medicine: { dosage: '10 ml', mealRelation: 'after' } },
  { title: 'Walk' }, { title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }]);
assert.strictEqual(n.title, '🌙 After Dinner · 9:00 PM');
assert.strictEqual(n.url, '/checkin/after_dinner');
assert.strictEqual(n.badge, 6);
assert.strictEqual(n.body, 'Iron Syrup — 10 ml, after meal\nWalk\nA\nB\n+2 more');
assert.strictEqual(buildSlotNotification('morning', '07:45', [{ title: 'X' }]).title, '☀️ Morning · 7:45 AM');
// Custom-time reminders
const customs = [
  { id: 'c1', title: 'Calcium', slots: [], custom_time: '08:00', repeat: 'daily', is_active: true, medicine: { dosage: '1 tablet' } },
  { id: 'c2', title: 'Late', slots: [], custom_time: '08:01', repeat: 'daily', is_active: true },
  { id: 'c3', title: 'Sundays', slots: [], custom_time: '08:00', repeat: 'weekly', repeat_days: [6], is_active: true },
  { id: 'c4', title: 'Done already', slots: [], custom_time: '08:00', repeat: 'daily', is_active: true },
];
const cLogs = new Map([['c4__custom__2026-11-05', { status: 'completed' }]]);
assert.deepStrictEqual(dueCustom(customs, cLogs, d).map(r => r.id), ['c1']);   // Thu 08:00
assert.deepStrictEqual(buildCustomNotification(customs[0], '20:05'),
  { title: '⏰ Reminder · 8:05 PM', body: 'Calcium — 1 tablet', tag: 'da-custom-c1', url: '/checkin/custom-c1', badge: 1 });
// Follow-ups + badge
assert.strictEqual(minusMinutes('20:45', 15), '20:30');
assert.strictEqual(minusMinutes('00:10', 15), null);
assert.strictEqual(buildSlotFollowUp('after_dinner', [{ title: 'Iron Syrup' }], 2).title, 'Still pending · After Dinner');
const day9 = localNow('Asia/Kolkata', new Date('2026-11-05T03:30:00Z'));   // Thu 09:00 IST
const slotTimes = { morning: '08:00', afternoon: '13:00', after_dinner: '20:30', overall: '22:00' };
// morning due (Iron, D3, Weekday; B12 done) + custom c1 at 08:00 = 4; c2 08:01 too; after_dinner not yet
assert.strictEqual(pendingDueCount([...rem, ...customs], new Map([...logs, ...cLogs]), slotTimes, day9), 5);
console.log('scheduleLogic: all tests passed');
