import type { Reminder, AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../utils/constants';

const now = new Date().toISOString();

/**
 * LEGACY ONLY — the schedule that was hard-coded for the original single-user version.
 * New users start with no reminders. This is used solely to import the original owner's
 * data on first login if her device never saved an edited copy (old app kept defaults in memory).
 */
export const LEGACY_DEFAULT_REMINDERS: Reminder[] = [
  // Iron Syrup — twice daily (morning after breakfast + after dinner)
  {
    id: 'med-iron',
    title: 'Iron Syrup',
    description: 'Take after meal',
    category: 'medicine',
    slots: ['morning', 'after_dinner'],
    repeat: 'daily',
    isActive: true,
    createdAt: now,
    medicine: { dosage: '10 ml', mealRelation: 'after' },
  },
  // Vitamin D3 — weekly, every Thursday, morning
  {
    id: 'med-vitamin-d3',
    title: 'Vitamin D3',
    description: 'Every Thursday',
    category: 'medicine',
    slots: ['morning'],
    repeat: 'weekly',
    repeatDays: [3], // 0=Mon … 6=Sun → 3 = Thursday
    isActive: true,
    createdAt: now,
    medicine: { dosage: '60,000 IU', mealRelation: 'with' },
  },
  // Vitamin B12 — daily, morning
  {
    id: 'med-b12',
    title: 'Vitamin B12',
    description: 'Take daily',
    category: 'medicine',
    slots: ['morning'],
    repeat: 'daily',
    isActive: true,
    createdAt: now,
    medicine: { dosage: '1 tablet', mealRelation: 'after' },
  },
  // Walk / Exercise — morning habit
  {
    id: 'habit-exercise',
    title: 'Walk / Exercise',
    description: '30 mins minimum',
    category: 'habit',
    slots: ['morning'],
    repeat: 'daily',
    isActive: true,
    createdAt: now,
  },
  // Drink Milk — morning habit
  {
    id: 'habit-milk',
    title: 'Drink Milk',
    description: 'Have a glass of milk',
    category: 'habit',
    slots: ['morning'],
    repeat: 'daily',
    isActive: true,
    createdAt: now,
  },
  // Avoid Black Coffee — morning reminder
  {
    id: 'habit-coffee',
    title: 'Avoid Black Coffee',
    description: 'Skip it today',
    category: 'habit',
    slots: ['morning'],
    repeat: 'daily',
    isActive: true,
    createdAt: now,
  },
  // Sleep on time — overall (night) reminder
  {
    id: 'habit-sleep',
    title: 'Sleep on Time',
    description: 'Lights out by 10:30 PM',
    category: 'habit',
    slots: ['overall'],
    repeat: 'daily',
    isActive: true,
    createdAt: now,
  },
];

export const LEGACY_DEFAULT_SETTINGS: AppSettings = DEFAULT_SETTINGS;
