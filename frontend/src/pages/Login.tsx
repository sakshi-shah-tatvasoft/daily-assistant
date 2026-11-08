import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound, Loader2, ArrowLeft } from 'lucide-react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const RESEND_SECONDS = 60;

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('email_not_invited') || m.includes('database error saving new user'))
    return "This email hasn't been invited yet. Ask the person who shared the app to add you.";
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('expired') || m.includes('invalid') || m.includes('token'))
    return 'That code is wrong or has expired. Check the latest email, or send a new code.';
  if (m.includes('fetch') || m.includes('network'))
    return "Can't reach the server. Check your internet connection.";
  return message;
}

export default function Login() {
  const [step, setStep]       = useState<'email' | 'code'>('email');
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Please enter a valid email address.'); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) { setError(friendlyError(error.message)); return; }
    setEmail(clean);
    setStep('code');
    setCode('');
    setCooldown(RESEND_SECONDS);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) { setError('Enter the code from the email.'); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (error) setError(friendlyError(error.message));
    // On success AuthContext picks up the new session and the app opens.
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 max-w-[420px] mx-auto">
      <div className="text-center mb-8">
        <img src="/icon-192.png" alt="" className="w-16 h-16 mx-auto rounded-2xl shadow-md mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Assistant</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Medicine & routine reminders</p>
      </div>

      {!supabaseConfigured && (
        <div className="card p-4 mb-4 text-sm text-red-600 dark:text-red-400">
          App is not configured: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing.
        </div>
      )}

      <div className="card p-5">
        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
              className="input mb-4" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} disabled={busy}
            />
            <button type="submit" className="btn-primary w-full disabled:opacity-60" disabled={busy || !email}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              Send login code
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">We'll email you a code. No password needed.</p>
          </form>
        ) : (
          <form onSubmit={verify}>
            <button type="button" onClick={() => { setStep('email'); setError(null); }}
              className="flex items-center gap-1 text-xs text-gray-400 mb-3">
              <ArrowLeft size={14} /> Change email
            </button>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              We sent a code to <strong className="text-gray-900 dark:text-white">{email}</strong>.
              Check your inbox (and spam folder).
            </p>
            <label className="label" htmlFor="code">Login code</label>
            <input
              id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
              className="input mb-4 text-center text-2xl tracking-[0.4em] font-semibold" placeholder="••••••"
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy} autoFocus
            />
            <button type="submit" className="btn-primary w-full disabled:opacity-60" disabled={busy || code.length < 6}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Log in
            </button>
            <button type="button" onClick={() => sendCode()} disabled={busy || cooldown > 0}
              className="w-full text-xs text-brand-600 dark:text-brand-400 mt-3 disabled:text-gray-400">
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-4 text-center" role="alert">{error}</p>}
      </div>

      <p className="text-[11px] text-gray-400 text-center mt-6 leading-relaxed">
        Simple reminders, just the way you set them.<br />
        <Link to="/privacy" className="underline">Privacy & terms</Link>
      </p>
    </div>
  );
}
