import type { NotificationSlot } from '../types';

export const TIMEZONE = 'Asia/Kolkata';

export const CATEGORIES = {
  medicine: { label: 'Medicine', color: '#ef4444', bg: '#fef2f2' },
  habit:    { label: 'Habit',    color: '#22c55e', bg: '#f0fdf4' },
  routine:  { label: 'Routine',  color: '#3b82f6', bg: '#eff6ff' },
  task:     { label: 'Task',     color: '#f59e0b', bg: '#fffbeb' },
} as const;

export const NOTIFICATION_SLOTS: Record<NotificationSlot, { label: string; emoji: string; defaultTime: string; description: string }> = {
  morning:     { label: 'Morning',     emoji: '☀️',  defaultTime: '08:00', description: 'Start of day' },
  afternoon:   { label: 'Afternoon',   emoji: '🌤️', defaultTime: '13:00', description: 'After lunch'  },
  after_dinner:{ label: 'After Dinner',emoji: '🌙',  defaultTime: '20:30', description: 'Evening'      },
  overall:     { label: 'Overall',     emoji: '🔔',  defaultTime: '22:00', description: 'Night review' },
};

export const SLOT_ORDER: NotificationSlot[] = ['morning', 'afternoon', 'after_dinner', 'overall'];

export const REPEAT_OPTIONS = [
  { value: 'daily',    label: 'Every day'          },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)'  },
  { value: 'weekly',   label: 'Specific day(s) each week' },
  { value: 'monthly',  label: 'Specific date(s) each month' },
  { value: 'once',     label: 'One time only'       },
] as const;

export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAYS_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
