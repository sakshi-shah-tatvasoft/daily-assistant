import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import InstallSteps, { isInstalled, isIOS } from '../components/InstallSteps';
import { Skeleton } from '../components/ui/Skeleton';
import { isDemo } from '../lib/demo';
import { t } from '../lib/i18n';
import Rich from '../components/ui/Rich';

/** After sign-up (and from Settings / the Today banner): install → notifications → test. */
export default function Setup() {
  const navigate = useNavigate();
  const { reminders } = useApp();
  const { status, subscribe, sendTest } = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const installed = isInstalled();
  const needsInstall = isIOS() && !installed;          // iPhone: notifications only work from the Home Screen app
  const on = status === 'subscribed';

  const enable = async () => {
    const ok = await subscribe();
    if (ok) toast.success(t('Notifications are on 🔔'), { id: 'setup' });
    else toast.error(status === 'denied' ? t('Notifications are blocked — see the tip below') : t('Could not turn on notifications'), { id: 'setup' });
  };
  const test = async () => {
    setTesting(true);
    const problem = await sendTest();
    setTesting(false);
    if (problem) toast.error(problem, { id: 'setup', duration: 6000 });
    else { setTested(true); toast.success(t('Sent! It should pop up in a few seconds.'), { id: 'setup' }); }
  };

  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) => (
    <section className="card p-4 mb-3">
      <div className="flex items-center gap-3">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${done ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-500'}`}>
          {done ? <Check size={14} strokeWidth={3} /> : n}
        </span>
        <h2 className={`text-[15px] font-semibold ${done ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>{title}</h2>
      </div>
      {!done && children && <div className="mt-3 pl-10">{children}</div>}
    </section>
  );

  return (
    <div className="page pt-6">
      <h1 className="page-title mb-1">{t('Get set up')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{t('Three quick steps so reminders reach you on time.')}</p>

      <Step n={1} done={installed} title={t('Add the app to your Home Screen')}>
        <InstallSteps />
        {!isIOS() && <p className="text-xs text-gray-400 mt-3">{t('On Android notifications also work in the browser, but the Home Screen app is easier to find.')}</p>}
      </Step>

      <Step n={2} done={on} title={t('Turn on notifications')}>
        {status === 'checking' ? (
          <Skeleton className="h-12 w-full rounded-2xl" />
        ) : needsInstall ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('On iPhone this only works in the app from your Home Screen — do step 1, then open the app from the icon.')}</p>
        ) : status === 'unsupported' ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{isDemo() ? t('Not available in the demo — notifications need a real (invited) account.') : t('This browser can’t show notifications. On iPhone use Safari (iOS 16.4 or newer); on Android use Chrome.')}</p>
        ) : status === 'denied' ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <Rich text={t('Notifications are blocked. iPhone: **Settings → Notifications → Daily Assistant → Allow**. Android: long-press the app icon → **App info → Notifications**.')} />
          </p>
        ) : (
          <button onClick={enable} disabled={status === 'requesting'} className="btn-primary w-full disabled:opacity-50">
            {status === 'requesting' ? t('Asking…') : t('Turn on notifications')}
          </button>
        )}
      </Step>

      <Step n={3} done={tested} title={t('Send yourself a test')}>
        {on ? (
          <button onClick={test} disabled={testing} className="btn-secondary w-full disabled:opacity-50">{testing ? 'Sending…' : 'Send a test notification'}</button>
        ) : status === 'checking' ? <Skeleton className="h-11 w-full rounded-2xl" /> : <p className="text-sm text-gray-400">{t('After step 2.')}</p>}
      </Step>

      <button onClick={() => navigate(reminders.length ? '/' : '/reminders/add', { replace: true })} className="btn-primary w-full mt-4">
        {reminders.length ? t('Go to Today') : t('Add my first reminder')}
      </button>
      <button onClick={() => navigate('/', { replace: true })} className="w-full text-sm text-gray-400 mt-3 py-2">{t('I\'ll do this later')}</button>
    </div>
  );
}
