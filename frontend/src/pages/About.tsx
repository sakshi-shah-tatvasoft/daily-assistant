import { Link } from 'react-router-dom';
import InstallSteps from '../components/InstallSteps';
import { startDemo } from '../lib/demo';
import { t } from '../lib/i18n';

/** Public page to share with invited people: what the app is, how to install it, and the privacy promise. */
export default function About() {
  return (
    <div className="min-h-screen px-5 py-8 max-w-[440px] mx-auto">
      <div className="text-center mb-6">
        <img src="/icon-192.png" alt="" className="w-16 h-16 rounded-2xl mx-auto mb-3 shadow-sm" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Assistant</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('Medicine & routine reminders')}</p>
        <p className="text-xs text-brand-600 dark:text-brand-400 font-medium mt-1">{t('Free · No ads · Invite-only')}</p>
      </div>

      <section className="card p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('What it does')}</h2>
        <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
          <li>{t('💊 Reminds you to take medicines at the times you set')}</li>
          <li>{t('✅ Tick them off — see what\'s done and what\'s missed')}</li>
          <li>{t('🧴 Warns you before a medicine runs out')}</li>
          <li>{t('💧 Water, habits and a daily checklist too')}</li>
          <li>{t('📄 A simple report to show your doctor')}</li>
        </ul>
      </section>

      <section className="card p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('Install it (1 minute)')}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('It\'s an app you add from the browser — no App Store needed.')}</p>
        <InstallSteps />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          {t("Then log in with the email you were invited with — you'll get a 6-digit code by email (check Spam if it's not there).")}{' '}
          {t('Allow notifications when asked.')}
        </p>
      </section>

      <section className="card p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('Your privacy')}</h2>
        <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
          <li>{t('🔒 Only you can see your medicines and history')}</li>
          <li>{t('🚫 No ads, no trackers, nothing sold')}</li>
          <li>{t('🗑️ Delete your account and all data anytime, in Settings')}</li>
          <li>{t('⚕️ It only reminds you of what you enter — it never suggests medicines or doses')}</li>
        </ul>
      </section>

      <Link to="/" className="btn-primary w-full">{t('Log in')}</Link>
      <button type="button" onClick={startDemo} className="btn-secondary w-full mt-2">{t('👀 Try the demo — no sign-up')}</button>
      <p className="text-xs text-gray-400 text-center mt-3">
        {t('Not invited yet? Ask the person who shared this link with you.')}<br />
        <Link to="/guide" className="underline">{t('Everything it can do')}</Link> · <Link to="/privacy" className="underline">{t('Privacy & terms')}</Link>
      </p>
    </div>
  );
}
