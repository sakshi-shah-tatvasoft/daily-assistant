const assert = require('assert');
const { localNow, runsOn, dueTitles, buildSlotNotification } = require('../src/scheduleLogic');
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
assert.strictEqual(n.body, 'Iron Syrup — 10 ml, after meal\nWalk\nA\nB\n+2 more');
assert.strictEqual(buildSlotNotification('morning', '07:45', [{ title: 'X' }]).title, '☀️ Morning · 7:45 AM');
console.log('scheduleLogic: all tests passed');
