import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { family, familyInviteMessage, joinUrl } from '../lib/family';

type Role = 'owner' | 'carer';

/** Start a family link: "let someone follow me" or "I want to follow someone". The other person must accept. */
export default function FamilyAdd() {
  const navigate = useNavigate();
  const { profile } = useApp();
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const create = async () => {
    if (!role || busy) return;
    setBusy(true);
    try {
      const r = await family.createInvite(role, { email, nickname, canManage });
      setCode(r.code);
    } catch (e) { toast.error((e as Error).message, { id: 'fam' }); }
    finally { setBusy(false); }
  };

  const message = code && role ? familyInviteMessage(code, role, profile.display_name || 'Your family member') : '';
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ text: message }); return; } } catch { return; }
    await copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); toast.success('Copied — paste it in WhatsApp', { id: 'fam' }); } catch { /* ignore */ }
  };

  if (code && role) {
    return (
      <div className="page pt-4">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/family', { replace: true })} className="btn-icon" aria-label="Back"><ArrowLeft size={20} /></button>
          <h1 className="page-title">Send the invite</h1>
        </div>
        <div className="card p-5 text-center mb-4">
          <p className="text-3xl mb-2">👪</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {role === 'owner' ? 'Send this to the person who should follow your medicines.' : 'Send this to the person whose medicines you want to follow. They have to accept.'}
          </p>
          <p className="text-2xl font-bold tracking-[0.25em] text-gray-900 dark:text-white mb-1">{code}</p>
          <p className="text-[11px] text-gray-400 break-all">{joinUrl(code)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')} className="py-3 rounded-2xl bg-[#25D366] text-white font-semibold">WhatsApp</button>
          <button onClick={share} className="btn-secondary"><Share2 size={15} /> Share</button>
        </div>
        <button onClick={copy} className="w-full py-2.5 text-sm text-gray-500 flex items-center justify-center gap-1.5"><Copy size={14} /> Copy message</button>
        <p className="text-xs text-gray-400 text-center mt-4">The link works for 7 days and only once. Nothing is shared until they accept.</p>
        <button onClick={() => navigate('/family', { replace: true })} className="btn-primary w-full mt-6">Done</button>
      </div>
    );
  }

  return (
    <div className="page pt-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-icon" aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="page-title">Add family</h1>
      </div>

      <p className="label">What would you like to do?</p>
      <div className="space-y-2 mb-5">
        {([['carer', '👀', 'Follow someone’s medicines', 'e.g. see if Mummy took her tablets, and get an alert if she didn’t'],
           ['owner', '🤝', 'Let someone follow my medicines', 'e.g. so your son or daughter knows you’re okay']] as const).map(([k, emoji, title, sub]) => (
          <button key={k} type="button" onClick={() => setRole(k)} aria-pressed={role === k}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${role === k ? 'border-brand-500 bg-brand-50 dark:bg-white/[0.06]' : 'border-gray-200 dark:border-[#2C2C2E] bg-white dark:bg-[#1C1C1E]'}`}>
            <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">{emoji} {title}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</span>
          </button>
        ))}
      </div>

      {role && (
        <>
          {role === 'carer' && (
            <div className="form-group">
              <label className="label" htmlFor="fam-nick">What do you call them?</label>
              <input id="fam-nick" className="input" placeholder="e.g. Mummy, Papa, Dadi" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={40} />
            </div>
          )}
          <div className="form-group">
            <label className="label" htmlFor="fam-email">Their email (only if they're not on the app yet)</label>
            <input id="fam-email" type="email" inputMode="email" autoCapitalize="none" className="input" placeholder="mummy@gmail.com" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} />
            <p className="text-[11px] text-gray-400 mt-1">This lets them create an account with that email. Up to 5 family members.</p>
          </div>
          {role === 'owner' && (
            <button type="button" onClick={() => setCanManage(v => !v)} aria-pressed={canManage}
              className="w-full flex items-center justify-between p-3 mb-5 rounded-xl border border-gray-200 dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E]">
              <span className="text-left">
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">Also let them manage my medicines</span>
                <span className="block text-xs text-gray-400">{canManage ? 'They can add/change medicines and tick doses for you' : 'Off — they can only see'}</span>
              </span>
              <span className={`w-11 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${canManage ? 'bg-brand-600' : 'bg-gray-300 dark:bg-[#3A3A3C]'}`}>
                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${canManage ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          )}
          <button onClick={create} disabled={busy} className="btn-primary w-full disabled:opacity-50">{busy ? 'Creating…' : 'Create invite link'}</button>
          <p className="text-xs text-gray-400 text-center mt-3">They see only your medicines — never habits, water or daily tasks.</p>
        </>
      )}
    </div>
  );
}
