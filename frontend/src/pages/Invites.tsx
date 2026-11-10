import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { admin, inviteMessage, type Invite } from '../lib/admin';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Owner only: invite people by email from the phone (no SQL), share the invite, see who joined, remove invites. */
export default function Invites() {
  const navigate = useNavigate();
  const { profile } = useApp();
  const [list, setList] = useState<Invite[] | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [justInvited, setJustInvited] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setList(await admin.list()); setError(''); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { if (profile.is_admin) load(); }, [load, profile.is_admin]);

  if (!profile.is_admin) {
    return (
      <div className="page pt-4">
        <button onClick={() => navigate(-1)} className="btn-icon mb-4" aria-label="Back"><ArrowLeft size={20} /></button>
        <EmptyState title="Only the app owner can invite" text="Ask the person who shared Daily Assistant with you to invite your friends." />
      </div>
    );
  }

  const invite = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const clean = await admin.invite(email, note);
      toast.success(`${clean} can now log in`, { id: 'invite' });
      setJustInvited(clean); setEmail(''); setNote('');
      await load();
    } catch (e) { toast.error((e as Error).message, { id: 'invite' }); }
    finally { setBusy(false); }
  };

  const share = async (to: string) => {
    const text = inviteMessage(to);
    try {
      if (navigator.share) { await navigator.share({ title: 'Daily Assistant', text }); return; }
    } catch { return; /* closed the share sheet */ }
    try { await navigator.clipboard.writeText(text); toast.success('Message copied — paste it in WhatsApp', { id: 'invite' }); }
    catch { toast.error('Could not copy — use the WhatsApp button', { id: 'invite' }); }
  };
  const whatsapp = (to: string) => window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage(to))}`, '_blank');

  const remove = async (i: Invite) => {
    const ok = await confirmDialog({
      title: `Remove ${i.email}?`,
      message: i.joined
        ? 'They have already joined — their account keeps working. Removing only stops this email from signing up again if they delete their account.'
        : 'They will not be able to sign up with this email.',
      confirmText: 'Remove invite', tone: 'danger',
    });
    if (!ok) return;
    try { await admin.remove(i.email); toast.success('Invite removed', { id: 'invite' }); await load(); }
    catch (e) { toast.error((e as Error).message, { id: 'invite' }); }
  };

  const joined = list?.filter(i => i.joined).length ?? 0;

  return (
    <div className="page pt-4">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="btn-icon" aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="page-title">Invite people</h1>
      </div>

      <div className="card p-4 mb-4">
        <label className="label" htmlFor="invite-email">Their email</label>
        <input id="invite-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" className="input mb-3"
          placeholder="friend@gmail.com" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} />
        <label className="label" htmlFor="invite-note">Who is it? (optional, only you see this)</label>
        <input id="invite-note" className="input mb-4" placeholder="e.g. Mummy" value={note} onChange={e => setNote(e.target.value)} maxLength={100} />
        <button onClick={invite} disabled={busy || !email.trim()} className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Adding…' : 'Invite'}
        </button>
        <p className="text-[11px] text-gray-400 mt-2">They log in with this exact email and get a 6-digit code. No password needed.</p>
      </div>

      {justInvited && (
        <div className="rounded-2xl p-4 mb-4 bg-brand-50 dark:bg-white/[0.06] border border-brand-200/60 dark:border-white/10">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">✓ {justInvited} is invited</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">Now send them the link and steps:</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => whatsapp(justInvited)} className="py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-semibold">WhatsApp</button>
            <button onClick={() => share(justInvited)} className="btn-secondary"><Share2 size={15} /> Share / copy</button>
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between mb-2 px-1">
        <p className="section-label">Invited</p>
        {list && <p className="text-xs text-gray-400">{joined} of {list.length} joined</p>}
      </div>
      {error ? (
        <div className="card p-4 text-sm text-red-500">{error}</div>
      ) : !list ? (
        <div className="card p-4 text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden">
          {list.map(i => (
            <div key={i.email} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{i.email}</p>
                <p className="text-xs text-gray-400 truncate">
                  {i.note ? `${i.note} · ` : ''}{i.joined ? `Joined ${fmt(i.joined_at!)}` : `Invited ${fmt(i.invited_at)} · not joined yet`}
                </p>
              </div>
              {!i.joined && (
                <button onClick={() => share(i.email)} aria-label={`Share invite with ${i.email}`} className="btn-icon w-8 h-8"><Share2 size={14} /></button>
              )}
              <button onClick={() => remove(i)} aria-label={`Remove ${i.email}`} className="btn-icon w-8 h-8 text-gray-400"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
