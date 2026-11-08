import { useState } from 'react';
import { Sun, Moon, Smartphone, Trash2, Download, Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NOTIFICATION_SLOTS, SLOT_ORDER } from '../utils/constants';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { Theme, NotificationSlot } from '../types';
import toast from 'react-hot-toast';

const THEME_OPTIONS: { value: Theme; label: string; Icon: React.ElementType }[] = [
  { value: 'light',  label: 'Light',  Icon: Sun       },
  { value: 'dark',   label: 'Dark',   Icon: Moon      },
  { value: 'system', label: 'System', Icon: Smartphone },
];

/** Build slot_items payload: { morning: ["Iron Syrup", "Vitamin B12"], ... } */
function buildSlotItems(reminders: ReturnType<typeof useApp>['reminders']) {
  const out: Record<string, string[]> = {};
  for (const r of reminders) {
    if (!r.isActive) continue;
    for (const slot of r.slots) {
      out[slot] = [...(out[slot] ?? []), r.title];
    }
  }
  return out;
}

export default function Settings() {
  const { settings, setSettings, reminders, dailyLogs } = useApp();
  const { status, subscribe, updateSchedule, unsubscribe, sendTest } = usePushNotifications();
  const [testLoading, setTestLoading] = useState(false);

  const setTheme = (theme: Theme) => setSettings(s => ({ ...s, theme }));

  const updateSlotTime = (slot: NotificationSlot, time: string) => {
    const newTimes = { ...settings.notificationSlotTimes, [slot]: time };
    setSettings(s => ({ ...s, notificationSlotTimes: newTimes }));
    // Sync to backend if already subscribed
    if (status === 'subscribed') {
      updateSchedule(newTimes as unknown as Record<string, string>, buildSlotItems(reminders));
    }
  };

  const handleEnable = async () => {
    const slotTimes = settings.notificationSlotTimes as unknown as Record<string, string>;
    const slotItems = buildSlotItems(reminders);
    const ok = await subscribe(slotTimes, slotItems);
    if (ok) {
      setSettings(s => ({ ...s, pushNotificationsEnabled: true }));
      toast.success('Push notifications enabled! 🔔');
    } else if (status === 'denied') {
      toast.error('Notifications blocked. Enable in Safari Settings → Websites → Notifications.');
    } else {
      toast.error('Could not enable notifications. Is the backend running?');
    }
  };

  const handleDisable = async () => {
    await unsubscribe();
    setSettings(s => ({ ...s, pushNotificationsEnabled: false }));
    toast.success('Push notifications disabled.');
  };

  const handleTest = async () => {
    setTestLoading(true);
    const ok = await sendTest();
    setTestLoading(false);
    if (ok) toast.success('Test notification sent! Check your device.');
    else toast.error('Test failed. Make sure the backend is running.');
  };

  const exportData = () => {
    const payload = JSON.stringify({ reminders, logs: dailyLogs, settings, exportedAt: new Date().toISOString() }, null, 2);
    const blob    = new Blob([payload], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `daily-assistant-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported!');
  };

  const clearAll = () => {
    if (!window.confirm('Delete ALL data? This cannot be undone.')) return;
    ['da_reminders_v2', 'da_logs_v2', 'da_settings_v2', 'da_device_id', 'da_push_subscribed', 'da_task_checks_v1'].forEach(k => localStorage.removeItem(k));
    toast.success('Cleared. Reloading…');
    setTimeout(() => window.location.reload(), 1200);
  };

  const isSubscribed = status === 'subscribed';
  const isUnsupported = status === 'unsupported';
  const isDenied = status === 'denied';
  const isRequesting = status === 'requesting';

  return (
    <div className="page pt-6">
      <h1 className="page-title mb-6">Settings</h1>

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
                  className="input w-28 py-1.5 text-sm flex-shrink-0"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-xs font-medium text-indigo-600 dark:text-indigo-400 active:opacity-70"
            >
              {testLoading ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />}
              Send Test
            </button>
            <button
              onClick={handleDisable}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-[#2a2840] text-xs font-medium text-gray-500 dark:text-gray-400 active:opacity-70"
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

      {/* Theme */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Theme</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button key={value} onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                settings.theme === value
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-[#2a2840]'
              }`}>
              <Icon size={20} className={settings.theme === value ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'} />
              <span className={`text-xs font-medium ${settings.theme === value ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Your Data</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Reminders',   n: reminders.length },
            { label: 'Days logged', n: Object.keys(dailyLogs).length },
          ].map(({ label, n }) => (
            <div key={label} className="bg-gray-50 dark:bg-[#2a2840] rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{n}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Data management */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Data</p>
        <div className="space-y-2">
          <button onClick={exportData}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#2a2840] active:opacity-70">
            <Download size={18} className="text-indigo-500 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-white">Export Backup</p>
              <p className="text-xs text-gray-400">Download all data as JSON</p>
            </div>
          </button>
          <button onClick={clearAll}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 active:opacity-70">
            <Trash2 size={18} className="text-red-500 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Clear All Data</p>
              <p className="text-xs text-red-400">Permanently delete everything</p>
            </div>
          </button>
        </div>
      </div>

      <div className="text-center pb-2">
        <p className="text-xs text-gray-300 dark:text-gray-600">Daily Assistant v0.3.0 · Phase 3</p>
      </div>
    </div>
  );
}
