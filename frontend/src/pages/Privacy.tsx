import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Not medical advice',
    body: [
      'Daily Assistant is a reminder tool. It only reminds you of the schedule you enter.',
      'It does not recommend medicines, change doses or make medical decisions. Always follow your doctor or pharmacist. Do not rely on the app as your only reminder for critical medicines — notifications can be delayed or missed by your phone.',
    ],
  },
  {
    title: 'What we store',
    body: [
      'Your email address (to log you in), your name if you give one, and the reminders, medicines, doses, daily tasks and completion history you add.',
      'If you turn on notifications, a technical address for your device that lets us send them.',
      'Feedback messages you choose to send.',
    ],
  },
  {
    title: 'How it is protected',
    body: [
      'Data is stored in a Supabase (PostgreSQL) database with encryption at rest and HTTPS in transit.',
      'Database rules make sure each account can only read and change its own data.',
      'We do not show ads, sell data, or use tracking or analytics tools.',
    ],
  },
  {
    title: 'Your control',
    body: [
      'Export all your data any time from Settings → Export.',
      'Delete your account from Settings → Delete account. This permanently removes your account and all your data.',
    ],
  },
  {
    title: 'Early testing',
    body: [
      'The app is in invite-only testing with a small group. Features may change. Questions or requests: use Settings → Send feedback.',
    ],
  },
];

export default function Privacy() {
  const navigate = useNavigate();
  return (
    <div className="page pt-6 max-w-[480px] mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} className="btn-icon" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title">Privacy & terms</h1>
      </div>
      <div className="space-y-4">
        {SECTIONS.map(s => (
          <div key={s.title} className="card p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 last:mb-0">{p}</p>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 text-center mt-6">Last updated November 2026</p>
    </div>
  );
}
