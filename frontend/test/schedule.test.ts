// Run: npm run test  (bundled with esbuild, no extra test framework)
import assert from 'node:assert';
import { stockStatus, courseStatus, dosesPerDay, parseDosage, courseEndFromDays } from '../src/utils/schedule';
import { shouldReminderRunToday } from '../src/utils/dateHelpers';
import { mergeById } from '../src/lib/sync';
import { isSos, isPausedOn } from '../src/utils/schedule';
import { weeklySummary } from '../src/utils/insights';
import type { Reminder, TaskInstance } from '../src/types';

const base: Reminder = { id: 'm', title: 'Iron', category: 'medicine', slots: ['morning', 'after_dinner'], repeat: 'daily', isActive: true, createdAt: '' };
const med = (extra: Partial<Reminder['medicine']> = {}): Reminder => ({ ...base, medicine: {
  stock: { quantity: 30, unit: 'tablets', perDose: 1, refilledAt: '2026-11-01T00:00:00.000Z', lowDays: 5 }, ...extra } });
const logs = (n: number, at = '2026-11-02T08:00:00.000Z', status: TaskInstance['status'] = 'completed'): TaskInstance[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m__${i}`, reminderId: 'm', date: '2026-11-02', scheduledTime: '08:00', title: 'Iron', category: 'medicine', status, completedAt: at }));

assert.strictEqual(dosesPerDay(med()), 2);
let s = stockStatus(med(), logs(22), '2026-11-12')!;
assert.deepStrictEqual([s.remaining, s.daysLeft, s.low, s.out], [8, 4, true, false]);
s = stockStatus(med(), logs(22, '2026-10-30T08:00:00.000Z'), '2026-11-12')!;       // before refill
assert.deepStrictEqual([s.remaining, s.low], [30, false]);
s = stockStatus(med(), logs(22, '2026-11-02T08:00:00.000Z', 'skipped'), '2026-11-12')!; // missed/skipped don't use stock
assert.strictEqual(s.remaining, 30);
s = stockStatus(med(), logs(30), '2026-11-16')!;
assert.deepStrictEqual([s.out, s.low], [true, false]);
s = stockStatus(med({ endDate: '2026-11-13' }), logs(22), '2026-11-12')!;           // course ends first
assert.deepStrictEqual([s.low, s.out, s.endsBeforeEmpty], [false, false, true]);
assert.strictEqual(stockStatus({ ...med(), isActive: false }, logs(30), '2026-11-12')!.out, false);

assert.deepStrictEqual(courseStatus(med({ startDate: '2026-11-10', endDate: '2026-11-14' }), '2026-11-12'),
  { state: 'active', day: 3, total: 5, startDate: '2026-11-10', endDate: '2026-11-14' });
assert.strictEqual(courseStatus(med({ startDate: '2026-11-10', endDate: '2026-11-14' }), '2026-11-15')!.state, 'finished');
assert.strictEqual(courseStatus(med({ startDate: '2026-11-20' }), '2026-11-12')!.state, 'upcoming');
assert.strictEqual(courseStatus(base, '2026-11-12'), null);
assert.strictEqual(courseEndFromDays('2026-11-10', 5), '2026-11-14');

assert.ok(shouldReminderRunToday({ repeat: 'daily', medicine: { startDate: '2026-11-10', endDate: '2026-11-14' } }, '2026-11-14'));
assert.ok(!shouldReminderRunToday({ repeat: 'daily', medicine: { startDate: '2026-11-10', endDate: '2026-11-14' } }, '2026-11-15'));
assert.ok(shouldReminderRunToday({ repeat: 'weekly', repeatDays: [3] }, '2026-11-12'));   // Thu
assert.ok(!shouldReminderRunToday({ repeat: 'weekly', repeatDays: [3] }, '2026-11-13'));

assert.deepStrictEqual(parseDosage('10 ml'), { amount: 10, unit: 'ml' });
assert.deepStrictEqual(parseDosage('1 tablet'), { amount: 1, unit: 'tablets' });
assert.deepStrictEqual(parseDosage('60,000 IU'), { amount: 1, unit: 'doses' });
// Multi-device merge: keep the other phone's new reminder, apply this phone's edit + delete
{
  const base   = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }];
  const local  = [{ id: 'a', v: 2 }, { id: 'b', v: 1 }, { id: 'd', v: 1 }];            // edit a, delete c, add d
  const remote = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }, { id: 'e', v: 1 }];  // other phone added e
  const m = mergeById(base, local, remote);
  assert.deepStrictEqual(m.map(x => `${x.id}${x.v}`), ['a2', 'b1', 'e1', 'd1']);
}
assert.ok(isSos({ id: 'r1__sos__2026-11-09__abc' }) && !isSos({ id: 'r1__morning__2026-11-09' }));
assert.ok(isPausedOn({ paused_until: '2026-11-14' }, '2026-11-14') && !isPausedOn({ paused_until: '2026-11-14' }, '2026-11-15') && !isPausedOn({ paused_until: null }, '2026-11-14'));
{
  const t = (date: string, status: TaskInstance['status'], reason?: string, id = `r__morning__${date}`): TaskInstance =>
    ({ id, reminderId: 'r', date, scheduledTime: '08:00', slot: 'morning', title: 'Iron', category: 'medicine', status, skippedReason: reason });
  const w = weeklySummary([t('2026-11-10', 'completed'), t('2026-11-11', 'skipped', 'missed'), t('2026-11-12', 'completed'),
    t('2026-11-13', 'pending'), t('2026-11-12', 'completed', undefined, 'r__sos__2026-11-12__x')], '2026-11-15');
  assert.deepStrictEqual(w && [w.done, w.total, w.pct, w.pattern], [2, 4, 50, 'mornings']);
}
console.log('schedule (frontend): all tests passed');
