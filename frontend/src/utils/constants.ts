import type { NotificationSlot } from '../types';
import { t } from '../lib/i18n';

export const TIMEZONE = 'Asia/Kolkata';

export const CATEGORIES = {
  medicine: { label: t('Medicine'), color: '#ef4444', bg: '#fef2f2' },
  habit:    { label: t('Habit'),    color: '#22c55e', bg: '#f0fdf4' },
  routine:  { label: t('Routine'),  color: '#3b82f6', bg: '#eff6ff' },
  task:     { label: t('Task'),     color: '#f59e0b', bg: '#fffbeb' },
} as const;

export const NOTIFICATION_SLOTS: Record<NotificationSlot, { label: string; emoji: string; defaultTime: string; description: string }> = {
  morning:     { label: t('Morning'),     emoji: '☀️',  defaultTime: '08:00', description: t('Start of day') },
  afternoon:   { label: t('Afternoon'),   emoji: '🌤️', defaultTime: '13:00', description: t('After lunch')  },
  after_dinner:{ label: t('After Dinner'),emoji: '🌙',  defaultTime: '20:30', description: t('Evening')      },
  overall:     { label: t('Night'),     emoji: '🔔',  defaultTime: '22:00', description: t('Night review') },
};

export const SLOT_ORDER: NotificationSlot[] = ['morning', 'afternoon', 'after_dinner', 'overall'];

export const REPEAT_OPTIONS = [
  { value: 'daily',    label: t('Every day')          },
  { value: 'weekdays', label: t('Weekdays (Mon–Fri)')  },
  { value: 'weekly',   label: t('Specific day(s) each week') },
  { value: 'monthly',  label: t('Specific date(s) each month') },
  { value: 'once',     label: t('One time only')       },
] as const;

export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => t(d));
export const DAYS_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => t(d));

export const DEFAULT_SETTINGS = {
  timezone: TIMEZONE,
  theme: 'system' as const,
  notificationSlotTimes: {
    morning:     '08:00',
    afternoon:   '13:00',
    after_dinner:'20:30',
    overall:     '22:00',
  },
  pushNotificationsEnabled: false,
};
