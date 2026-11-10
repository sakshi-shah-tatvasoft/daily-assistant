import { Link } from 'react-router-dom';
import InstallSteps from '../components/InstallSteps';

/** Public page to share with invited people: what the app is, how to install it, and the privacy promise. */
export default function About() {
  return (
    <div className="min-h-screen px-5 py-8 max-w-[440px] mx-auto">
      <div className="text-center mb-6">
        <img src="/icon-192.png" alt="" className="w-16 h-16 rounded-2xl mx-auto mb-3 shadow-sm" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Assistant</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Medicine & routine reminders</p>
        <p className="text-xs text-brand-600 dark:text-brand-400 font-medium mt-1">Free · No ads · Invite-only</p>
      </div>

      <section className="card p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">What it does</h2>
        <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
          <li>💊 Reminds you to take medicines at the times you set</li>
          <li>✅ Tick them off — see what's done and what's missed</li>
          <li>🧴 Warns you before a medicine runs out</li>
          <li>💧 Water, habits and a daily checklist too</li>
          <li>📄 A simple report to show your doctor</li>
        </ul>
      </section>

      <section className="card p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Install it (1 minute)</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">It's an app you add from the browser — no App Store needed.</p>
        <InstallSteps />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Then log in with the email you were invited with — you'll get a 6-digit code by email (check Spam if it's not there).
          Allow notifications when asked.
        </p>
      </section>

      <section className="card p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Your privacy</h2>
        <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
          <li>🔒 Only you can see your medicines and history</li>
          <li>🚫 No ads, no trackers, nothing sold</li>
          <li>🗑️ Delete your account and all data anytime, in Settings</li>
          <li>⚕️ It only reminds you of what you enter — it never suggests medicines or doses</li>
        </ul>
      </section>

      <Link to="/" className="btn-primary w-full">Log in</Link>
      <p className="text-xs text-gray-400 text-center mt-3">
        Not invited yet? Ask the person who shared this link with you.<br />
        <Link to="/guide" className="underline">Everything it can do</Link> · <Link to="/privacy" className="underline">Privacy & terms</Link>
      </p>
    </div>
  );
}
