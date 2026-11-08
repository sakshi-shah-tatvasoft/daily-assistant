interface Props { done: number; total: number; size?: number; stroke?: number; }

/** Circular progress ring (brand teal on a soft track). Shows "done/total" in the middle. */
export default function ProgressRing({ done, total, size = 88, stroke = 9 }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} of ${total} done`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className="stroke-brand-100 dark:stroke-[#2C2C2E]" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
        className={pct >= 1 ? 'stroke-saffron-500' : 'stroke-brand-600 dark:stroke-brand-400'}
        strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.7s ease-out' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        className="fill-gray-900 dark:fill-white" style={{ fontSize: size * 0.22, fontWeight: 700 }}>
        {done}/{total}
      </text>
    </svg>
  );
}
