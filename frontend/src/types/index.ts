export type Category = 'medicine' | 'habit' | 'routine' | 'task';
export type RepeatType = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom' | 'once';
export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed' | 'skipped';
export type MealRelation = 'before' | 'after' | 'with' | 'independent';
export type Theme = 'light' | 'dark' | 'system';
export type NotificationSlot = 'morning' | 'afternoon' | 'after_dinner' | 'overall';

export interface MedicineDetails {
  dosage?: string;
  mealRelation?: MealRelation;
  startDate?: string;
  endDate?: string;
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  category: Category;
  slots: NotificationSlot[];   // which daily notification slots to fire in (supports twice-daily: 2 slots)
  customTime?: string;          // HH:mm override — used if slots is empty
  repeat: RepeatType;
  repeatDays?: number[];        // 0=Mon…6=Sun for weekly/custom; 1–31 for monthly dates
  date?: string;                // YYYY-MM-DD, only for repeat: 'once'
  notes?: string;
  isActive: boolean;
  createdAt: string;
  medicine?: MedicineDetails;
}

export interface TaskInstance {
  id: string;
  reminderId: string;
  date: string;
  scheduledTime: string;        // HH:mm for this instance (derived from slot time or customTime)
  slot?: NotificationSlot;
  title: string;
  category: Category;
  status: TaskStatus;
  completedAt?: string;
  skippedReason?: string;
  isLate?: boolean;
}

export interface DailyLog {
  date: string;
  taskInstances: TaskInstance[];
}

export interface NotificationSlotTimes {
  morning: string;
  afternoon: string;
  after_dinner: string;
  overall: string;
}

export interface AppSettings {
  timezone: string;
  theme: Theme;
  notificationSlotTimes: NotificationSlotTimes;
  pushNotificationsEnabled: boolean;
}

export interface DashboardStats {
  total: number;
  completed: number;
  pending: number;
  skipped: number;
  percentage: number;
}

export interface Profile {
  id:              string;
  display_name:    string | null;
  timezone:        string;
  theme:           Theme;
  slot_times:      NotificationSlotTimes;
  push_enabled:    boolean;
  onboarded:       boolean;
  legacy_imported: boolean;
  follow_up_minutes?: number;   // 0 = off; default 15
}
