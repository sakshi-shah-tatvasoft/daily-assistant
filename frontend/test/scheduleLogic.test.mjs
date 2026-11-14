import assert from 'node:assert';
import { remindAgainFor, repeatsDue, localNow, runsOn, dueTitles, dueCustom, minusMinutes, pendingDueCount, buildSlotNotification, buildSlotFollowUp, buildCustomNotification, stockStatus, dosesPerDay, waterTimes, waterDue, buildWaterNotification, recentTimes, weeklySummary, buildWeeklyNotification, familyDue, buildFamilyNotification } from '../api/_lib/scheduleLogic.js';
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
// Course window
const course = { repeat: 'daily', medicine: { startDate: '2026-11-03', endDate: '2026-11-07' } };
assert.ok(runsOn(course, { ...d, date: '2026-11-03' }));
assert.ok(runsOn(course, { ...d, date: '2026-11-07' }));
assert.ok(!runsOn(course, { ...d, date: '2026-11-02' }));
assert.ok(!runsOn(course, { ...d, date: '2026-11-08' }));
// Stock: 30 tablets, 1 per dose, twice daily → 15 days; 22 taken since refill → 8 left → 4 days → low (≤5)
const med = { id: 'm', title: 'Iron', slots: ['morning', 'after_dinner'], repeat: 'daily', is_active: true,
  medicine: { stock: { quantity: 30, unit: 'tablets', perDose: 1, refilledAt: '2026-11-01T00:00:00.000Z', lowDays: 5 } } };
assert.strictEqual(dosesPerDay(med), 2);
const taken = (n, at = '2026-11-02T08:00:00.000Z') => Array.from({ length: n }, () => at);
let st = stockStatus(med, taken(22), '2026-11-12');
assert.deepStrictEqual([st.remaining, st.daysLeft, st.low, st.out], [8, 4, true, false]);
// Doses before the refill don't count
st = stockStatus(med, taken(22, '2026-10-30T08:00:00.000Z'), '2026-11-12');
assert.deepStrictEqual([st.remaining, st.low], [30, false]);
// Out of stock
st = stockStatus(med, taken(30), '2026-11-16');
assert.deepStrictEqual([st.remaining, st.out, st.low], [0, true, false]);
// Refill "add 15 more": 3 left + 15 = 18 from the refill moment; older doses no longer count
const refilled = { ...med, medicine: { stock: { ...med.medicine.stock, quantity: 3 + 15, refilledAt: '2026-11-14T10:00:00.000Z' } } };
st = stockStatus(refilled, [...taken(27), '2026-11-14T20:30:00.000Z'], '2026-11-14');
assert.deepStrictEqual([st.remaining, st.daysLeft, st.low, st.out], [17, 8, false, false]);
// Course ends before stock runs out → no warning
st = stockStatus({ ...med, medicine: { ...med.medicine, endDate: '2026-11-13' } }, taken(22), '2026-11-12');
assert.deepStrictEqual([st.low, st.out], [false, false]);
// Finished course / paused reminder → no warning
assert.strictEqual(stockStatus({ ...med, medicine: { ...med.medicine, endDate: '2026-11-10' } }, taken(30), '2026-11-12').out, false);
assert.strictEqual(stockStatus({ ...med, is_active: false }, taken(30), '2026-11-12').out, false);
// Weekly 60,000 IU, 4 doses left, 1 per week → 28 days, not low
const weekly = { ...med, slots: ['morning'], repeat: 'weekly', repeat_days: [3],
  medicine: { stock: { quantity: 4, unit: 'doses', perDose: 1, refilledAt: '2026-11-01T00:00:00.000Z', lowDays: 7 } } };
st = stockStatus(weekly, [], '2026-11-12');
assert.deepStrictEqual([st.daysLeft, st.low], [28, false]);
// Remind me again
const slotT = { morning: '08:00', afternoon: '13:00', after_dinner: '20:30', overall: '22:00' };
const at = t => ({ ...localNow('Asia/Kolkata', new Date('2026-11-05T02:30:00Z')), time: t });   // Thu
const again = [
  { id: 'a', title: 'A', slots: ['morning'], repeat: 'daily', is_active: true, remind_again: { every: 15, times: 2 } },
  { id: 'b', title: 'B', slots: ['morning'], repeat: 'daily', is_active: true, remind_again: { every: 30, times: 1 } },
  { id: 'c', title: 'C', slots: ['morning'], repeat: 'daily', is_active: true, remind_again: { every: 0, times: 1 } },   // off
  { id: 'd', title: 'D', slots: ['morning'], repeat: 'daily', is_active: true },                                        // profile default
  { id: 'e', title: 'E', slots: [], custom_time: '09:10', repeat: 'daily', is_active: true, remind_again: { every: 10, times: 3 } },
];
const ids = groups => groups.map(g => `${g.key}:${g.items.map(i => i.id).join('')}@${g.offset}`).join(' ');
assert.deepStrictEqual(remindAgainFor({}, 15), { every: 15, times: 1 });
assert.deepStrictEqual(remindAgainFor({}, 0), { every: 0, times: 0 });
assert.strictEqual(ids(repeatsDue(again, new Map(), slotT, at('08:15'), 15)), 'morning:ad@15');
assert.strictEqual(ids(repeatsDue(again, new Map(), slotT, at('08:30'), 15)), 'morning:ab@30');   // A 2nd time, B once; D only once
assert.strictEqual(ids(repeatsDue(again, new Map(), slotT, at('08:45'), 15)), '');                // A max 2 reached
assert.strictEqual(ids(repeatsDue(again, new Map([['a__morning__2026-11-05', { status: 'completed' }]]), slotT, at('08:15'), 15)), 'morning:d@15');
assert.strictEqual(ids(repeatsDue(again, new Map(), slotT, at('09:40'), 15)), 'custom-e:e@30');
assert.strictEqual(ids(repeatsDue(again, new Map(), slotT, at('09:50'), 15)), '');                // E max 3 reached at 9:40
assert.strictEqual(ids(repeatsDue(again, new Map(), slotT, at('08:00'), 15)), '');                // not at the occurrence itself
// Water: every 2 h from 8 am to 10 pm → 7 reminders; stops at the goal; off / bad values → none
const water = { on: true, every: 120, from: '08:00', to: '22:00', goal: 8 };
assert.deepStrictEqual(waterTimes(water), ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']);
assert.strictEqual(waterTimes({ ...water, every: 30, from: '09:00', to: '10:00' }).length, 2);
assert.ok(waterDue(water, '14:00', 3));
assert.ok(!waterDue(water, '14:00', 8));            // goal reached
assert.ok(!waterDue(water, '13:00', 0));            // not a reminder time
assert.ok(!waterDue(water, '08:00', 0));            // first one is "every" after the start
assert.deepStrictEqual(waterTimes({ ...water, on: false }), []);
assert.deepStrictEqual(waterTimes({ ...water, every: 7 }), []);
assert.deepStrictEqual(waterTimes(null), []);
assert.strictEqual(buildWaterNotification(3, 8).url, '/water/add');
// Catch-up window: now + 5 minutes before, never before midnight
assert.deepStrictEqual(recentTimes('20:10'), ['20:05', '20:06', '20:07', '20:08', '20:09', '20:10']);
assert.deepStrictEqual(recentTimes('00:02'), ['00:00', '00:01', '00:02']);
// Sunday summary (today = Sun 2026-11-15)
const L = (date, slot, status, reason, id = `r__${slot}__${date}`) => ({ id, date, slot, status, skipped_reason: reason });
let wk = [L('2026-11-09', 'morning', 'completed'), L('2026-11-10', 'morning', 'completed'), L('2026-11-11', 'morning', 'skipped', 'missed'),
  L('2026-11-12', 'morning', 'completed'), L('2026-11-13', 'morning', 'pending'),                 // pending on a past day = missed
  L('2026-11-14', 'morning', 'skipped', 'skipped'),                                                 // deliberate skip = not counted
  L('2026-11-15', 'morning', 'pending'),                                                            // today pending = not counted yet
  L('2026-11-12', 'sos', 'completed', null, 'r__sos__2026-11-12__x'),                               // SOS = not counted
  L('2026-11-01', 'morning', 'completed')];                                                         // too old
let sum = weeklySummary(wk, '2026-11-15');
assert.deepStrictEqual([sum.done, sum.total, sum.pct], [3, 5, 60]);
assert.strictEqual(sum.pattern, 'mornings');                                                        // missed on 2 days this week
// Weekday pattern across weeks: missed Monday evenings twice in 4 weeks
wk = [L('2026-11-09', 'after_dinner', 'skipped', 'missed'), L('2026-11-02', 'after_dinner', 'skipped', 'missed'),
  L('2026-11-10', 'morning', 'completed'), L('2026-11-11', 'morning', 'completed'), L('2026-11-12', 'morning', 'completed')];
assert.strictEqual(weeklySummary(wk, '2026-11-15').pattern, 'Monday after-dinner doses');
assert.strictEqual(weeklySummary([L('2026-11-14', 'morning', 'completed')], '2026-11-15'), null);   // too little data
assert.match(buildWeeklyNotification({ done: 4, total: 4, pct: 100 }).body, /wonderful/);
// SOS medicine stock: warn when ≤ N doses left, never "days"
const sosMed = { id: 's', title: 'Painkiller', slots: [], repeat: 'daily', is_active: true,
  medicine: { asNeeded: true, stock: { quantity: 10, unit: 'tablets', perDose: 1, refilledAt: '2026-11-01T00:00:00.000Z', lowDays: 3 } } };
assert.strictEqual(dosesPerDay(sosMed), 0);
st = stockStatus(sosMed, taken(7), '2026-11-12');
assert.deepStrictEqual([st.remaining, st.daysLeft, st.low, st.out], [3, null, true, false]);
st = stockStatus(sosMed, taken(10), '2026-11-12');
assert.deepStrictEqual([st.low, st.out], [false, true]);
// Family "not taken yet": dose at 08:00, alert after 60 min → due at 09:00 (window 08:55–09:00)
{
  const day = { date: '2026-11-14', time: '09:00', weekday: 5, dayOfMonth: 14 };
  const win = recentTimes('09:00');
  const meds = [
    { id: 'iron', title: 'Iron', category: 'medicine', slots: ['morning'], repeat: 'daily', is_active: true },
    { id: 'b12', title: 'B12', category: 'medicine', slots: ['morning'], repeat: 'daily', is_active: true },
    { id: 'walk', title: 'Walk', category: 'habit', slots: ['morning'], repeat: 'daily', is_active: true },
  ];
  const slots = { morning: '08:00', afternoon: '13:00', after_dinner: '20:30', overall: '22:00' };
  let due = familyDue(meds, new Map(), slots, day, 60, win);
  assert.deepStrictEqual(due.map(g => [g.key, g.items.map(r => r.id).join(',')]), [['morning', 'iron,b12']]);   // habits never shared
  const logs = new Map([['iron__morning__2026-11-14', { status: 'completed' }], ['b12__morning__2026-11-14', { status: 'skipped', skipped_reason: 'missed' }]]);
  due = familyDue(meds, logs, slots, day, 60, win);
  assert.deepStrictEqual(due[0].items.map(r => r.id), ['b12']);                       // ticked → no alert; missed → alert
  logs.set('b12__morning__2026-11-14', { status: 'skipped', skipped_reason: 'skipped' });
  assert.strictEqual(familyDue(meds, logs, slots, day, 60, win).length, 0);           // deliberate skip → no alert
  assert.strictEqual(familyDue(meds, new Map(), slots, day, 0, win).length, 0);       // alerts off
  assert.strictEqual(familyDue(meds, new Map(), slots, day, 30, win).length, 0);      // 30 min → was due 08:30, not now
  assert.match(buildFamilyNotification('Mummy', { key: 'morning', time: '08:00', items: meds.slice(0, 2) }, 'L1').body, /Iron & B12 \(8:00 AM\)/);
}
console.log('scheduleLogic: all tests passed');
