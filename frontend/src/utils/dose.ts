import type { Reminder } from '../types';

const MEAL: Record<string, string> = {
  after: 'after meal', before: 'before meal', with: 'with meal', independent: '',
};

/** "10 ml · after meal" for medicines; description or category for others. */
export function doseMeta(r?: Reminder): string {
  if (!r) return '';
  if (r.category === 'medicine') {
    return [r.medicine?.dosage, r.medicine?.mealRelation ? MEAL[r.medicine.mealRelation] : '']
      .filter(Boolean).join(' · ');
  }
  return r.description ?? '';
}

/** Verb for the main button: medicines are "taken", everything else "done". */
export const actionWord = (r?: Reminder) => (r?.category === 'medicine' ? 'taken' : 'done');
