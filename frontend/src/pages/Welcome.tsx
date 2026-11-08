import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

/** First-run screen: name + medical disclaimer acknowledgement. */
export default function Welcome() {
  const { profile, updateProfile, legacyImported, reminders } = useApp();
  const navigate = useNavigate();
  const [name, setName]     = useState(profile.display_name ?? '');
  const [agreed, setAgreed] = useState(false);

  const finish = (e: FormEvent) => {
    e.preventDefault();
    if (!agreed) return;
    updateProfile({ display_name: name.trim() || null, onboarded: true });
    navigate(reminders.length ? '/' : '/reminders/add', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 max-w-[420px] mx-auto">
      <div className="text-center mb-6">
        <Sparkles size={36} className="mx-auto text-indigo-500 mb-3" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome!</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Let's set up Daily Assistant for you.</p>
      </div>

      {legacyImported && (
        <div className="card p-4 mb-4 flex gap-3 items-start">
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 dark:text-gray-200">
            We found your reminders and history from the earlier version on this phone and moved them into your account.
          </p>
        </div>
      )}

      <form onSubmit={finish} className="card p-5">
        <label className="label" htmlFor="name">What should we call you?</label>
        <input id="name" className="input mb-5" maxLength={60} placeholder="Your first name"
          value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" />

        <label className="flex gap-3 items-start mb-5 cursor-pointer">
          <input type="checkbox" className="mt-1 w-4 h-4 accent-indigo-600 shrink-0"
            checked={agreed} onChange={e => setAgreed(e.target.checked)} />
          <span className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            I understand Daily Assistant only reminds me of the schedule <strong>I enter</strong>. It does not
            recommend medicines or doses and is not medical advice. Always follow your doctor.
          </span>
        </label>

        <button type="submit" className="btn-primary w-full disabled:opacity-50" disabled={!agreed}>
          {reminders.length ? 'Open my dashboard' : 'Add my first reminder'}
        </button>
      </form>

      <p className="text-[11px] text-gray-400 text-center mt-6">
        <Link to="/privacy" className="underline">How we handle your data</Link>
      </p>
    </div>
  );
}
