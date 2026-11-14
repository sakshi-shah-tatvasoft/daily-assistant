import { Link } from 'react-router-dom';
import { useFamilyPeople, usePersonData, personDay, displayName } from '../lib/useFamily';
import type { FamilyPerson } from '../lib/family';
import { t } from '../lib/i18n';

/** Today screen: one line per person I follow ("Mummy · 2 of 3 taken · 1 not taken yet"). Hidden if I follow nobody. */
export default function FamilyTodayCard() {
  const { list } = useFamilyPeople();
  const following = list?.filter(p => p.role === 'following') ?? [];
  if (!following.length) return null;
  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-base">👪</span>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('Family')}</h2>
        <Link to="/family" className="ml-auto text-xs font-semibold text-brand-600 dark:text-brand-400">{t('See all')}</Link>
      </div>
      <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden">
        {following.map(p => <Row key={p.link_id} p={p} />)}
      </div>
    </section>
  );
}

function Row({ p }: { p: FamilyPerson }) {
  const { data } = usePersonData(p);
  const d = data ? personDay(p, data.reminders, data.logs) : null;
  const alert = d && (d.notYet > 0 || d.missed > 0);
  return (
    <Link to={`/family/${p.link_id}`} className="flex items-center gap-3 px-4 py-3">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${!d ? 'bg-gray-200 animate-pulse' : d.paused ? 'bg-saffron-400' : alert ? 'bg-saffron-500' : 'bg-brand-600'}`} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{displayName(p)}</span>
        <span className={`block text-xs truncate ${alert ? 'text-saffron-600' : 'text-gray-500 dark:text-gray-400'}`}>
          {!d ? t('Loading…') : d.paused ? t('On holiday') : d.today.length === 0 ? t('No medicines today')
            : t('{n} of {total} taken', { n: d.taken, total: d.today.length }) + (d.notYet ? ' · ' + t('{n} not taken yet', { n: d.notYet }) : '') + (d.missed ? ' · ' + t('{n} missed', { n: d.missed }) : '')}
        </span>
      </span>
      <span className="text-gray-300">›</span>
    </Link>
  );
}
