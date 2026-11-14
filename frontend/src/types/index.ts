export type Category = 'medicine' | 'habit' | 'routine' | 'task';
export type RepeatType = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom' | 'once';
export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed' | 'skipped';
export type MealRelation = 'before' | 'after' | 'with' | 'independent';
export type Theme = 'light' | 'dark' | 'system';
export type NotificationSlot = 'morning' | 'afternoon' | 'after_dinner' | 'overall';

export type StockUnit = 'tablets' | 'capsules' | 'ml' | 'doses' | 'sachets' | 'drops';

/** Stock is DERIVED: remaining = quantity − perDose × (doses completed since refilledAt). */
export interface StockInfo {
  quantity: number;     // amount on hand at refilledAt
  unit: StockUnit;
  perDose: number;      // amount used each time it's taken
  refilledAt: string;   // ISO timestamp the quantity was counted
  lowDays: number;      // alert when about this many days are left (3 / 5 / 7)
}

export interface MedicineDetails {
  dosage?: string;
  mealRelation?: MealRelation;
  startDate?: string;   // YYYY-MM-DD, course start (inclusive)
  endDate?: string;     // YYYY-MM-DD, course end (inclusive); none = ongoing
  stock?: StockInfo;
  asNeeded?: boolean;   // SOS: no schedule, logged with "Took one"; lowDays then means doses left
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
  /** Alarm-style repeats while still pending. every 0 = off. undefined = use the Settings default. */
  remindAgain?: { every: number; times: number };
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
  water?: WaterSettings | null;
  paused_until?: string | null;   // holiday mode: no reminders up to and including this date
  is_admin?: boolean;             // owner: can invite people (set in the database only, never by the app)
  language?: 'en' | 'hi' | 'gu';  // app + notification language (the device keeps its own choice in da_lang)
}

/** Water reminders: every `every` min after `from` up to `to`, until `goal` glasses are logged today. */
export interface WaterSettings {
  on:    boolean;
  every: 30 | 60 | 120 | 180;
  from:  string;   // "08:00"
  to:    string;   // "22:00"
  goal:  number;   // glasses, 1–20
}
