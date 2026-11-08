import type { ReactNode } from 'react';

/** Friendly empty screen: soft illustration (our nudge bubble), a title, a hint and an action. */
export default function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4 animate-fade-in">
      <svg viewBox="0 0 200 160" className="w-44 mx-auto mb-4" aria-hidden="true">
        <circle cx="100" cy="84" r="64" className="fill-brand-50 dark:fill-white/[0.06]" />
        <circle cx="38" cy="40" r="5" className="fill-saffron-400" opacity=".7" />
        <circle cx="168" cy="118" r="4" className="fill-brand-300" />
        <circle cx="160" cy="34" r="3" className="fill-brand-300" />
        <path d="M78 52 H124 A22 22 0 0 1 146 74 V94 A22 22 0 0 1 124 116 H104 L78 134 Q72 138 74 131 L80 115 A22 22 0 0 1 56 94 V74 A22 22 0 0 1 78 52 Z"
          className="fill-white dark:fill-[#1C1C1E] stroke-brand-200 dark:stroke-[#3A3A3C]" strokeWidth="2" />
        <path d="M84 84 L96 95 L118 72" fill="none" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-600 dark:stroke-brand-400" />
        <circle cx="142" cy="56" r="10" className="fill-saffron-500 stroke-brand-50 dark:stroke-[#0E0E10]" strokeWidth="4" />
      </svg>
      <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-5 max-w-[260px] mx-auto">{text}</p>
      {action}
    </div>
  );
}
