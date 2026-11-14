import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { FEATURES, type Feature } from '../data/features';
import { startDemo, isDemo } from '../lib/demo';

const NEW_DAYS = 14;
const isNew = (f: Feature) => !!f.added && Date.now() - Date.parse(f.added) < NEW_DAYS * 864e5;
const URL = 'https://daily-assistant-eta.vercel.app/guide';

/** Public page: everything the app can do, where to find it, and what a tester should see. Data: data/features.ts */
export default function Guide() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [testing, setTesting] = useState(false);
  const total = FEATURES.reduce((n, s) => n + s.items.length, 0);

  const sections = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return FEATURES;
    return FEATURES.map(s => ({ ...s, items: s.items.filter(f => [f.title, f.what, f.where, f.check, s.title].join(' ').toLowerCase().includes(t)) }))
      .filter(s => s.items.length);
  }, [q]);

  const share = async () => {
    try { if (navigator.share) { await navigator.share({ title: 'Daily Assistant — what it can do', url: URL }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(URL); toast.success('Link copied'); } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen px-4 pt-4 pb-24 max-w-[520px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} className="btn-icon" aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="page-title flex-1">What you can do</h1>
        <button onClick={share} className="btn-icon" aria-label="Share this page"><Share2 size={18} /></button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Daily Assistant reminds you to take medicines, drink water and keep your daily habits — and shows how you're doing.
        Here are all {total} things it can do.
      </p>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-10" placeholder="Search, e.g. refill, snooze, water" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-5">
        <input type="checkbox" checked={testing} onChange={e => setTesting(e.target.checked)} className="w-4 h-4 accent-brand-600" />
        I'm testing — show what each should do
      </label>

      {sections.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nothing matches "{q}".</p>}

      {sections.map(s => (
        <section key={s.title} className="mb-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 px-1">{s.emoji} {s.title}</h2>
          <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden">
            {s.items.map(f => (
              <div key={f.title} className="px-4 py-3">
                <p className="text-[15px] font-medium text-gray-900 dark:text-white">
                  {f.title}
                  {isNew(f) && <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-saffron-500/15 text-saffron-600">New</span>}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{f.what}</p>
                {f.where && <p className="text-xs text-brand-700 dark:text-brand-400 mt-1">📍 {f.where}</p>}
                {testing && f.check && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">✅ Should: {f.check}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-gray-400 text-center mt-6">
        {!isDemo() && <button type="button" onClick={startDemo} className="btn-secondary w-full mb-3">👀 Try the demo — no sign-up</button>}
        Free · No ads · Invite-only · <Link to="/about" className="underline">How to install</Link> · <Link to="/privacy" className="underline">Privacy</Link>
      </p>
    </div>
  );
}
