import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sun, Moon, Smartphone, Trash2, Download, Bell, BellOff, BellRing, Loader2,
  LogOut, MessageSquare, Shield, UploadCloud, User, Cloud, CloudOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { NOTIFICATION_SLOTS, SLOT_ORDER } from '../utils/constants';
import { formatTime } from '../utils/dateHelpers';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { hasLegacyData } from '../lib/sync';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import HolidayCard from '../components/HolidayCard';
import type { Theme, NotificationSlot } from '../types';
import toast from 'react-hot-toast';

const FOLLOW_UP_OPTIONS = [
  { value: 0, label: 'Off' }, { value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 hour' },
];

const THEME_OPTIONS: { value: Theme; label: string; Icon: React.ElementType }[] = [
  { value: 'light',  label: 'Light',  Icon: Sun       },
  { value: 'dark',   label: 'Dark',   Icon: Moon      },
  { value: 'system', label: 'System', Icon: Smartphone },
];

export default function Settings() {
  const { settings, setSettings, reminders, dailyLogs, profile, updateProfile, syncState, importLegacy } = useApp();
  const { user, signOut } = useAuth();
  const { status, subscribe, unsubscribe, sendTest } = usePushNotifications();
  const [testLoading, setTestLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(profile.display_name ?? '');
  const [legacyAvailable, setLegacyAvailable] = useState(hasLegacyData);

  const setTheme = (theme: Theme) => setSettings(s => ({ ...s, theme }));

  // The server reads slot times from your profile, so changing them here is all that's needed.
  const updateSlotTime = (slot: NotificationSlot, time: string) => {
    if (!time) return;
    setSettings(s => ({ ...s, notificationSlotTimes: { ...s.notificationSlotTimes, [slot]: time } }));
  };

  const saveName = () => {
    const clean = name.trim() || null;
    if (clean !== profile.display_name) { updateProfile({ display_name: clean }); toast.success('Name saved'); }
  };

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) toast.success('Push notifications enabled! 🔔');
    else if (Notification?.permission === 'denied') toast.error('Notifications blocked. Enable them in iPhone Settings → Notifications → Daily Assistant.');
    else toast.error('Could not enable notifications. Please try again.');
  };

  const handleDisable = async () => {
    await unsubscribe();
    toast.success('Notifications turned off on this device.');
  };

  const handleTest = async () => {
    setTestLoading(true);
    const problem = await sendTest();
    setTestLoading(false);
    if (!problem) toast.success('Test notification sent! Check your device.');
    else toast.error(`Test failed: ${problem}`, { duration: 7000 });
  };

  const exportData = async () => {
    const [tasks, taskLogs, water] = await Promise.all([
      supabase.from('daily_tasks').select('id, task_name, sort_order, is_active, created_at'),
      supabase.from('task_logs').select('task_id, date, completed, submitted_at'),
      supabase.from('water_logs').select('date, glasses'),
    ]);
    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      account: { email: user?.email, name: profile.display_name },
      settings, reminders, doseLogs: dailyLogs,
      dailyTasks: tasks.data ?? [], dailyTaskLogs: taskLogs.data ?? [],
      waterSettings: profile.water ?? null, waterLogs: water.data ?? [],
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `daily-assistant-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported!');
  };

  const handleImport = () => {
    if (importLegacy()) { toast.success('Old data imported into your account'); setLegacyAvailable(false); }
  };

  const deleteAccount = async () => {
    const ok = await confirmDialog({ title: 'Delete your account?', message: 'This permanently deletes your account and ALL your data — reminders, history and daily tasks. It cannot be undone.', confirmText: 'Delete forever', tone: 'danger', requireText: 'DELETE' });
    if (!ok) return;
    setDeleting(true);
    try {
      await unsubscribe().catch(() => {});
      await api.deleteAccount();
      await signOut();
      toast.success('Your account and data have been deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete account');
      setDeleting(false);
    }
  };

  const isSubscribed = status === 'subscribed';
  const isUnsupported = status === 'unsupported';
  const isDenied = status === 'denied';
  const isRequesting = status === 'requesting' || status === 'checking';

  return (
    <div className="page pt-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Settings</h1>
        <span className={`flex items-center gap-1 text-[11px] ${syncState === 'offline' ? 'text-amber-500' : 'text-gray-400'}`}>
          {syncState === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />}
          {syncState === 'synced' ? 'Saved' : syncState === 'syncing' ? 'Saving…' : 'Offline — will sync'}
        </span>
      </div>

      {/* Account */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-white/[0.08] flex items-center justify-center shrink-0">
            <User size={18} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{profile.display_name || 'Your account'}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <label className="label text-xs" htmlFor="name">Name</label>
        <input id="name" className="input py-2" maxLength={60} value={name}
          onChange={e => setName(e.target.value)} onBlur={saveName} placeholder="Your first name" />
      </div>

      {/* Notification slots */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Notification Times</p>
        <p className="text-xs text-gray-400 mb-4">Set the 4 daily times when reminders fire</p>
        <div className="space-y-3">
          {SLOT_ORDER.map(slot => {
            const def = NOTIFICATION_SLOTS[slot];
            return (
              <div key={slot} className="flex items-center gap-3">
                <span className="text-xl w-7 text-center flex-shrink-0">{def.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-white leading-tight">{def.label}</p>
                  <p className="text-xs text-gray-400">{def.description}</p>
                </div>
                <input
                  type="time"
                  className="input input-center w-[8.5rem] flex-shrink-0"
                  value={settings.notificationSlotTimes[slot]}
                  onChange={e => updateSlotTime(slot, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Push notifications */}
      <div className="card p-4 mb-4">
        <div className="flex items-start gap-3">
          {isSubscribed ? (
            <Bell size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          ) : (
            <BellOff size={20} className="text-gray-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Push Notifications</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              {isSubscribed
                ? 'Active — notifications fire at each slot time, even when the app is closed.'
                : isDenied
                ? 'Blocked in browser/Safari settings. Go to Settings → Safari → Websites → Notifications and allow this site.'
                : isUnsupported
                ? 'Your browser does not support push notifications. Install the app first: Safari → Share → Add to Home Screen.'
                : 'Get notified at each slot time, even when the app is closed on iPhone.'}
            </p>
          </div>
          {!isSubscribed && !isDenied && !isUnsupported && (
            <button
              onClick={handleEnable}
              disabled={isRequesting}
              className="btn-primary py-2 px-3 text-xs flex-shrink-0 flex items-center gap-1.5"
            >
              {isRequesting ? <Loader2 size={12} className="animate-spin" /> : null}
              {isRequesting ? 'Enabling…' : 'Enable'}
            </button>
          )}
        </div>

        {isSubscribed && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleTest}
              disabled={testLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-50 dark:bg-white/[0.06] text-xs font-medium text-brand-600 dark:text-brand-400 active:opacity-70"
            >
              {testLoading ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />}
              Send Test
            </button>
            <button
              onClick={handleDisable}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-[#2C2C2E] text-xs font-medium text-gray-500 dark:text-gray-400 active:opacity-70"
            >
              <BellOff size={12} />
              Disable
            </button>
          </div>
        )}

        {!isSubscribed && !isUnsupported && !isDenied && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>iPhone:</strong> First install the app — Safari → Share → Add to Home Screen. Then open it from the home screen and enable notifications here.
            </p>
          </div>
        )}
      </div>

      {/* Owner: invite people from the phone */}
      {profile.is_admin && (
        <Link to="/invites" className="card p-4 mb-4 flex items-center gap-3 border-brand-200/70 dark:border-white/10">
          <span className="text-xl" aria-hidden="true">✉️</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-gray-900 dark:text-white">Invite people</span>
            <span className="block text-xs text-gray-400">Add family & friends — only you see this</span>
          </span>
          <span className="text-gray-300">›</span>
        </Link>
      )}

      {/* Holiday mode */}
      <HolidayCard />

      {/* Water reminders */}
      <Link to="/water" className="card p-4 mb-4 flex items-center justify-between">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">💧 Water reminders</span>
          <span className="block text-xs text-gray-400 mt-0.5 truncate">
            {profile.water?.on
              ? `Every ${profile.water.every < 60 ? `${profile.water.every} min` : `${profile.water.every / 60} hr${profile.water.every > 60 ? 's' : ''}`}, ${formatTime(profile.water.from)} – ${formatTime(profile.water.to)} · goal ${profile.water.goal}`
              : 'Off — tap to set up'}
          </span>
        </span>
        <span className={`text-xs font-semibold ${profile.water?.on ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'}`}>{profile.water?.on ? 'On' : 'Off'}</span>
      </Link>

      {/* Follow-up reminder */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Remind me again — default</p>
        <p className="text-xs text-gray-400 mt-0.5 mb-3 leading-relaxed">
          Used for reminders that don't have their own setting. You can change it per reminder when adding or editing one.
        </p>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E]">
          {FOLLOW_UP_OPTIONS.map(o => {
            const active = (profile.follow_up_minutes ?? 15) === o.value;
            return (
              <button key={o.value} onClick={() => updateProfile({ follow_up_minutes: o.value })}
                className={`py-2 rounded-lg text-[13px] font-medium transition-all ${
                  active ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <Link to="/setup" className="card p-4 mb-4 flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">📲</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">Install & notification help</span>
          <span className="block text-xs text-gray-400">Add to Home Screen, turn on reminders, send a test</span>
        </span>
        <span className="text-gray-300">›</span>
      </Link>

      {/* Theme */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Theme</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button key={value} onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                settings.theme === value
                  ? 'border-brand-500 bg-brand-50 dark:bg-white/[0.06]'
                  : 'border-gray-200 dark:border-[#2C2C2E]'
              }`}>
              <Icon size={20} className={settings.theme === value ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'} />
              <span className={`text-xs font-medium ${settings.theme === value ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">At a glance</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Reminders',   n: reminders.length },
            { label: 'Days logged', n: Object.keys(dailyLogs).length },
          ].map(({ label, n }) => (
            <div key={label} className="bg-gray-50 dark:bg-[#2C2C2E] rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{n}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Help */}
      <div className="card p-2 mb-4">
        <Link to="/feedback" className="flex items-center gap-3 p-3 rounded-xl active:bg-gray-50 dark:active:bg-[#2C2C2E]">
          <MessageSquare size={18} className="text-brand-500" />
          <span className="text-sm font-medium text-gray-800 dark:text-white">Send feedback</span>
        </Link>
        <Link to="/privacy" className="flex items-center gap-3 p-3 rounded-xl active:bg-gray-50 dark:active:bg-[#2C2C2E]">
          <Shield size={18} className="text-brand-500" />
          <span className="text-sm font-medium text-gray-800 dark:text-white">Privacy & terms</span>
        </Link>
      </div>

      {/* Data management */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Your data</p>
        <div className="space-y-2">
          {legacyAvailable && (
            <button onClick={handleImport}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-brand-50 dark:bg-white/[0.06] active:opacity-70">
              <UploadCloud size={18} className="text-brand-500 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-800 dark:text-white">Import data from old version</p>
                <p className="text-xs text-gray-400">Found reminders saved on this phone before accounts existed</p>
              </div>
            </button>
          )}
          <button onClick={exportData}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#2C2C2E] active:opacity-70">
            <Download size={18} className="text-brand-500 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-white">Export my data</p>
              <p className="text-xs text-gray-400">Download everything as a JSON file</p>
            </div>
          </button>
          <button onClick={() => signOut()}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#2C2C2E] active:opacity-70">
            <LogOut size={18} className="text-gray-500 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-white">Log out</p>
              <p className="text-xs text-gray-400">Your data stays safe in your account</p>
            </div>
          </button>
          <button onClick={deleteAccount} disabled={deleting}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 active:opacity-70 disabled:opacity-50">
            {deleting ? <Loader2 size={18} className="text-red-500 animate-spin" /> : <Trash2 size={18} className="text-red-500 flex-shrink-0" />}
            <div className="text-left">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
              <p className="text-xs text-red-400">Permanently delete your account and all data</p>
            </div>
          </button>
        </div>
      </div>

      <div className="text-center pb-2">
        <p className="text-xs text-gray-400 dark:text-gray-500">Daily Assistant · invite-only beta</p>
        <p className="text-[11px] text-gray-300 dark:text-gray-600 mt-0.5">
          Version {new Date(__BUILD_TIME__).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {__COMMIT__}
        </p>
      </div>
    </div>
  );
}
