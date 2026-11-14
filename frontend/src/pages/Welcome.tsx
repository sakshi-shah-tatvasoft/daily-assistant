import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Sparkles, CheckCircle2, Plus, Bell, CircleCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { t } from '../lib/i18n';

/** First-run screen: name + how the app works. (Medical note lives on Privacy & terms.) */
export default function Welcome() {
  const { profile, updateProfile, legacyImported } = useApp();
  const navigate = useNavigate();
  const [name, setName]     = useState(profile.display_name ?? '');

  const finish = (e: FormEvent) => {
    e.preventDefault();
    updateProfile({ display_name: name.trim() || null, onboarded: true });
    navigate('/setup', { replace: true });   // install + notifications, then first reminder
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 max-w-[420px] mx-auto">
      <div className="text-center mb-6">
        <Sparkles size={36} className="mx-auto text-brand-500 mb-3" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('Welcome!')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("Let's set up Daily Assistant for you.")}</p>
      </div>

      {legacyImported && (
        <div className="card p-4 mb-4 flex gap-3 items-start">
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {t('We found your reminders and history from the earlier version on this phone and moved them into your account.')}
          </p>
        </div>
      )}

      <form onSubmit={finish} className="card p-5">
        <label className="label" htmlFor="name">{t('What should we call you?')}</label>
        <input id="name" className="input mb-5" maxLength={60} placeholder={t('Your first name')}
          value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" />

        <div className="mb-5">
          <p className="section-label mb-3">{t('How it works')}</p>
          <ol className="space-y-3">
            {[
              { icon: Plus,      text: t('Add your medicines & daily habits') },
              { icon: Bell,      text: t('Get a gentle nudge at the right time') },
              { icon: CircleCheck, text: t('Tick them off and check in') },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-brand-50 dark:bg-white/[0.06] text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
                  <Icon size={16} />
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-200">{text}</span>
              </li>
            ))}
          </ol>
        </div>

        <button type="submit" className="btn-primary w-full">
          {t('Continue')}
        </button>
      </form>

      <p className="text-[11px] text-gray-400 text-center mt-6">
        <Link to="/privacy" className="underline">{t('How we handle your data')}</Link>
      </p>
    </div>
  );
}
