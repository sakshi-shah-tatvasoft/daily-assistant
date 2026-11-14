import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AppContext, useApp } from '../context/AppContext';
import { family } from '../lib/family';
import { useFamilyPeople, usePersonData, displayName } from '../lib/useFamily';
import { DEFAULT_SETTINGS } from '../utils/constants';
import { SkeletonList, Skeleton } from '../components/ui/Skeleton';
import AddReminder from './AddReminder';
import type { Reminder } from '../types';
import { t } from '../lib/i18n';

/**
 * "Can manage": add / edit a family member's medicine with the normal form.
 * The form reads/writes through a context that points at THEIR medicines and saves to their account
 * (the database only allows this while they keep "can manage" on).
 */
export default function FamilyEditor() {
  const { linkId = '' } = useParams<{ linkId: string }>();
  const base = useApp();
  const { list } = useFamilyPeople();
  const p = useMemo(() => list?.find(x => x.link_id === linkId && x.role === 'following'), [list, linkId]);
  const { data, setData } = usePersonData(p);

  if (list && (!p || !p.can_manage)) {
    return (
      <div className="page pt-6 text-center">
        <p className="text-sm text-gray-500 mb-4">{t('You can\'t change this person\'s medicines. They can allow it in their Family settings.')}</p>
        <Link to={p ? `/family/${linkId}` : '/family'} className="btn-secondary">{t('Back')}</Link>
      </div>
    );
  }
  if (!p || !data) {
    return <div className="page pt-4" role="status" aria-label={t('Loading')}><Skeleton className="w-10 h-10 rounded-xl mb-6" /><SkeletonList rows={3} circle={false} /></div>;
  }

  const setReminders = (v: Reminder[] | ((prev: Reminder[]) => Reminder[])) => {
    const next = typeof v === 'function' ? v(data.reminders) : v;
    const before = new Map(data.reminders.map(r => [r.id, JSON.stringify(r)]));
    const changed = next.filter(r => before.get(r.id) !== JSON.stringify(r)).map(r => ({ ...r, category: 'medicine' as const }));
    setData({ ...data, reminders: next });
    family.saveReminders(p.person_id, changed).catch(e => toast.error(t('Not saved: {error}', { error: (e as Error).message }), { id: 'fam' }));
  };

  const value = {
    ...base,
    reminders: data.reminders,
    setReminders,
    allLogs: data.logs,
    refreshToday: () => {},
    fresh: true,
    settings: { ...base.settings, notificationSlotTimes: p.slot_times ?? DEFAULT_SETTINGS.notificationSlotTimes },
    profile: { ...base.profile, follow_up_minutes: 15, display_name: p.name },
    familyMode: { name: displayName(p), backTo: `/family/${linkId}` },
  };
  return <AppContext.Provider value={value}><AddReminder /></AppContext.Provider>;
}
