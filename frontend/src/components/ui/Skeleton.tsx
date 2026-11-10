/**
 * Loading placeholders: grey shapes in the layout of the real content, so a screen never shows a blank or
 * "nothing here" state while data is still arriving, and nothing jumps when it does.
 */
const bar = 'bg-gray-200/80 dark:bg-white/[0.07] animate-pulse';

export function Skeleton({ className = '' }: { className?: string }) {
  // default corners unless the caller sets its own (e.g. rounded-full for circles)
  return <div className={`${bar} ${/\brounded/.test(className) ? '' : 'rounded-lg'} ${className}`} aria-hidden="true" />;
}

/** A card with N rows (circle + two lines), like a list of reminders or tasks. */
export function SkeletonList({ rows = 4, circle = true }: { rows?: number; circle?: boolean }) {
  return (
    <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          {circle && <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />}
          <div className="flex-1 space-y-2">
            <Skeleton className={`h-3.5 ${i % 2 ? 'w-1/2' : 'w-2/3'}`} />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Today: progress card + two slot groups. */
export function TodaySkeleton() {
  return (
    <div role="status" aria-label="Loading your day">
      <div className="card p-5 -mt-10 mb-5 relative">
        <div className="flex items-center gap-5">
          <Skeleton className="w-20 h-20 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-12 w-full mt-5 rounded-2xl" />
      </div>
      {[3, 2].map((n, i) => (
        <div key={i} className="mb-4">
          <Skeleton className="h-4 w-28 mb-2 ml-1" />
          <SkeletonList rows={n} />
        </div>
      ))}
    </div>
  );
}

/** Stat cards + a chart block (Progress). */
export function ProgressSkeleton() {
  return (
    <div role="status" aria-label="Loading your progress" className="space-y-4">
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <Skeleton className="h-44 rounded-2xl" />
    </div>
  );
}

/** First load of the whole app: the logo, gently pulsing. */
export function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" role="status" aria-label="Loading Daily Assistant">
      <img src="/icon-192.png" alt="" className="w-16 h-16 rounded-2xl shadow-sm animate-pulse" />
      <p className="text-sm text-gray-400">Daily Assistant</p>
    </div>
  );
}
