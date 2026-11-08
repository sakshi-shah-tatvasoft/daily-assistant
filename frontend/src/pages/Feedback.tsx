import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

export default function Feedback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase.from('feedback').insert({
      message: text.slice(0, 2000),
      page: 'settings',
      user_agent: navigator.userAgent.slice(0, 300),
    });
    setBusy(false);
    if (error) { toast.error('Could not send — check your connection'); return; }
    toast.success('Thank you! Feedback sent 💜');
    navigate('/settings');
  };

  return (
    <div className="page pt-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="btn-icon" aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="page-title">Send feedback</h1>
      </div>
      <form onSubmit={submit} className="card p-4">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Something not working, confusing, or missing? Tell us — every message is read.
        </p>
        <textarea
          className="input min-h-[160px] mb-2" maxLength={2000} placeholder="Type your feedback…"
          value={message} onChange={e => setMessage(e.target.value)} disabled={busy}
        />
        <p className="text-[11px] text-gray-400 text-right mb-3">{message.length}/2000</p>
        <button type="submit" className="btn-primary w-full disabled:opacity-60" disabled={busy || !message.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Send
        </button>
      </form>
    </div>
  );
}
