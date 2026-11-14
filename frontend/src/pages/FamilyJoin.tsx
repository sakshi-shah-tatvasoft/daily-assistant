import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { family, type InvitePreview } from '../lib/family';
import { Skeleton } from '../components/ui/Skeleton';
import { t } from '../lib/i18n';
import Rich from '../components/ui/Rich';

/** Opened from a family invite link: show who it's from and what it means, then accept or decline. */
export default function FamilyJoin() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { family.preview(code).then(setP).catch(e => setError((e as Error).message)); }, [code]);

  const REASONS: Record<string, string> = {
    NOT_FOUND: t('This invite link is not valid.'), USED: t('This invite has already been used.'),
    EXPIRED: t('This invite has expired. Ask them to send a new one.'), OWN_INVITE: t('This is your own invite — send it to your family member.'),
  };

  const accept = async () => {
    setBusy(true);
    try {
      await family.accept(code, p?.inviter_role === 'carer' ? { canManage } : { nickname: nickname || p?.inviter_name || '' });
      toast.success(t('Connected! 👪'), { id: 'fam' });
      navigate('/family', { replace: true });
    } catch (e) { toast.error((e as Error).message, { id: 'fam' }); setBusy(false); }
  };

  const name = p?.inviter_name ?? t('Someone');
  return (
    <div className="page pt-10">
      <div className="text-center mb-6">
        <p className="text-4xl mb-2">👪</p>
        <h1 className="page-title">{t('Family invite')}</h1>
      </div>
      {error ? <div className="card p-5 text-center text-sm text-red-500">{error}</div>
      : !p ? (
        <div className="card p-5 space-y-3" role="status" aria-label={t('Loading invite')}><Skeleton className="h-4 w-3/4 mx-auto" /><Skeleton className="h-3 w-1/2 mx-auto" /><Skeleton className="h-12 w-full rounded-2xl" /></div>
      ) : !p.valid ? (
        <div className="card p-5 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{REASONS[p.reason ?? 'NOT_FOUND'] ?? REASONS.NOT_FOUND}</p>
          <button onClick={() => navigate('/', { replace: true })} className="btn-secondary">{t('Go to Today')}</button>
        </div>
      ) : (
        <div className="card p-5">
          {p.inviter_role === 'owner' ? (
            <>
              <p className="text-[15px] text-gray-900 dark:text-white mb-1"><Rich text={t('**{name}** would like you to keep an eye on their medicines.', { name })} /></p>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 my-3">
                <li>{t('✅ See what they\'ve taken today')}</li>
                <li>{t('🔔 Get an alert if a dose isn\'t marked')}</li>
                <li>{t('🧴 Know when a medicine is running low')}</li>
                {p.can_manage && <li>{t('✏️ They also let you manage their medicines')}</li>}
              </ul>
              <label className="label" htmlFor="join-nick">{t('What do you call them?')}</label>
              <input id="join-nick" className="input mb-4" placeholder={name} value={nickname} onChange={e => setNickname(e.target.value)} maxLength={40} />
            </>
          ) : (
            <>
              <p className="text-[15px] text-gray-900 dark:text-white mb-1"><Rich text={t('**{name}** would like to follow your medicines.', { name })} /></p>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 my-3">
                <li>{t('👀 They\'ll see your medicines and what you\'ve taken')}</li>
                <li>{t('🔔 They\'ll get an alert if you forget a dose')}</li>
                <li>{t('🔒 Your habits, water and daily tasks stay private')}</li>
                <li>{t('✋ You can stop this anytime in Settings → Family')}</li>
              </ul>
              <button type="button" onClick={() => setCanManage(v => !v)} aria-pressed={canManage}
                className="w-full flex items-center justify-between p-3 mb-4 rounded-xl border border-gray-200 dark:border-[#3A3A3C]">
                <span className="text-left">
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{t('Also let them manage my medicines')}</span>
                  <span className="block text-xs text-gray-400">{canManage ? t('They can add/change medicines and tick doses for you') : t('Off — they can only see')}</span>
                </span>
                <span className={`w-11 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${canManage ? 'bg-brand-600' : 'bg-gray-300 dark:bg-[#3A3A3C]'}`}>
                  <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${canManage ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            </>
          )}
          <button onClick={accept} disabled={busy} className="btn-primary w-full disabled:opacity-50">{busy ? t('Connecting…') : t('Accept')}</button>
          <button onClick={() => navigate('/', { replace: true })} className="w-full py-2.5 mt-2 text-sm text-gray-500">{t('Not now')}</button>
        </div>
      )}
    </div>
  );
}
