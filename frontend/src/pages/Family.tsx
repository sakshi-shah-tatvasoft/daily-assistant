import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Share2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { family, familyInviteMessage, type FamilyPerson, type PendingInvite } from '../lib/family';
import { useFamilyPeople, usePersonData, personDay, displayName } from '../lib/useFamily';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { SkeletonList, Skeleton } from '../components/ui/Skeleton';
import { getCurrentTimeIST } from '../utils/dateHelpers';

/** Family: people I follow (their day at a glance), people who follow me, and open invites. */
export default function Family() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useApp();
  const { list, error, reload } = useFamilyPeople();
  const [pending, setPending] = useState<PendingInvite[] | null>(null);
  useEffect(() => { if (user) family.pending(user.id).then(setPending).catch(() => setPending([])); }, [user]);

  const following = list?.filter(p => p.role === 'following') ?? [];
  const followers = list?.filter(p => p.role === 'follower') ?? [];

  const toggleManage = async (p: FamilyPerson) => {
    const next = !p.can_manage;
    if (next) {
      const ok = await confirmDialog({ title: `Let ${displayName(p)} manage your medicines?`, message: 'They will be able to add or change your medicines and tick doses for you. You can turn this off anytime.', confirmText: 'Allow' });
      if (!ok) return;
    }
    try { await family.update(p.link_id, { canManage: next }); toast.success(next ? 'They can now manage your medicines' : 'Now view only', { id: 'fam' }); reload(); }
    catch (e) { toast.error((e as Error).message, { id: 'fam' }); }
  };
  const remove = async (p: FamilyPerson) => {
    const ok = await confirmDialog({
      title: p.role === 'follower' ? `Stop ${displayName(p)} following you?` : `Stop following ${displayName(p)}?`,
      message: p.role === 'follower' ? 'They will immediately stop seeing your medicines and getting alerts.' : 'You will stop seeing their medicines and getting alerts.',
      confirmText: 'Stop', tone: 'danger',
    });
    if (!ok) return;
    try { await family.end(p.link_id); toast.success('Done', { id: 'fam' }); reload(); } catch (e) { toast.error((e as Error).message, { id: 'fam' }); }
  };
  const cancel = async (i: PendingInvite) => {
    try { await family.end(i.id); setPending(ps => ps?.filter(x => x.id !== i.id) ?? null); } catch (e) { toast.error((e as Error).message, { id: 'fam' }); }
  };
  const share = async (i: PendingInvite) => {
    const text = familyInviteMessage(i.code, i.role, profile.display_name || 'Your family member');
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="page pt-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate(-1)} className="btn-icon" aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="page-title flex-1">Family</h1>
        <Link to="/family/add" className="btn-primary py-2 px-3 text-sm"><Plus size={15} /> Add</Link>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Keep an eye on each other's medicines. Only medicines are shared — habits, water and daily tasks stay private.</p>

      {error && <div className="card p-4 mb-4 text-sm text-red-500">{error}</div>}

      <p className="section-label mb-2 px-1">I follow</p>
      {!list ? <SkeletonList rows={2} /> : following.length === 0 ? (
        <Link to="/family/add" className="card p-4 mb-4 block text-sm text-gray-500 dark:text-gray-400">
          Follow a parent or family member to see if they've taken their medicines. <span className="text-brand-600 dark:text-brand-400 font-semibold">Add →</span>
        </Link>
      ) : (
        <div className="space-y-3 mb-5">{following.map(p => <PersonCard key={p.link_id} p={p} />)}</div>
      )}

      <p className="section-label mb-2 px-1 mt-5">Following me</p>
      {!list ? <SkeletonList rows={1} circle={false} /> : followers.length === 0 ? (
        <p className="card p-4 mb-4 text-sm text-gray-500 dark:text-gray-400">Nobody follows your medicines yet.</p>
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden mb-4">
          {followers.map(p => (
            <div key={p.link_id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{displayName(p)}</span>
                  <span className="block text-xs text-gray-400">{p.can_manage ? 'Can see and manage your medicines' : 'Can see your medicines'}</span>
                </span>
                <button onClick={() => remove(p)} aria-label={`Remove ${displayName(p)}`} className="btn-icon w-8 h-8 text-gray-400"><X size={15} /></button>
              </div>
              <button type="button" onClick={() => toggleManage(p)} aria-pressed={p.can_manage}
                className="mt-2 w-full flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                <span>Allow them to manage my medicines</span>
                <span className={`w-10 h-[22px] rounded-full p-0.5 transition-colors ${p.can_manage ? 'bg-brand-600' : 'bg-gray-300 dark:bg-[#3A3A3C]'}`}>
                  <span className={`block w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${p.can_manage ? 'translate-x-[18px]' : ''}`} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {pending && pending.length > 0 && (
        <>
          <p className="section-label mb-2 px-1 mt-5">Waiting to be accepted</p>
          <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden">
            {pending.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-900 dark:text-white truncate">{i.invite_email || `Code ${i.code}`}</span>
                  <span className="block text-xs text-gray-400">{i.role === 'owner' ? 'Invited to follow you' : 'You asked to follow them'} · expires {new Date(i.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </span>
                <button onClick={() => share(i)} aria-label="Send again" className="btn-icon w-8 h-8"><Share2 size={14} /></button>
                <button onClick={() => cancel(i)} aria-label="Cancel invite" className="btn-icon w-8 h-8 text-gray-400"><X size={15} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Followed person: today at a glance. */
function PersonCard({ p }: { p: FamilyPerson }) {
  const { data } = usePersonData(p);
  const d = data ? personDay(p, data.reminders, data.logs) : null;
  return (
    <Link to={`/family/${p.link_id}`} className="card p-4 block">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-gray-900 dark:text-white">{displayName(p)}</span>
        <span className="text-gray-300">›</span>
      </div>
      {!d ? <Skeleton className="h-3.5 w-40 mt-2" /> : d.paused ? (
        <p className="text-xs text-saffron-600 mt-1">🌴 On holiday — reminders paused</p>
      ) : d.today.length === 0 ? (
        <p className="text-xs text-gray-400 mt-1">No medicines today</p>
      ) : (
        <>
          <div className="flex gap-1.5 mt-2.5" aria-hidden="true">
            {d.today.map(t => (
              <span key={t.id} className={`flex-1 h-2 rounded-full ${t.status === 'completed' ? 'bg-brand-600' : t.status === 'skipped' ? 'bg-red-400' : t.scheduledTime <= getCurrentTimeIST() ? 'bg-saffron-500' : 'bg-gray-200 dark:bg-[#2C2C2E]'}`} />
            ))}
          </div>
          <p className="text-xs mt-2 text-gray-600 dark:text-gray-300">
            {d.taken} of {d.today.length} taken
            {d.notYet > 0 && <span className="text-saffron-600 font-medium"> · {d.notYet} not taken yet</span>}
            {d.missed > 0 && <span className="text-red-500 font-medium"> · {d.missed} missed</span>}
          </p>
        </>
      )}
      {d && d.low.length > 0 && <p className="text-xs text-saffron-600 mt-1">🧴 {d.low.map(l => l.r.title).join(', ')} running low</p>}
    </Link>
  );
}
