import { NavLink, useLocation } from 'react-router-dom';
import { Sun, ListChecks, Pill, BarChart3 } from 'lucide-react';
import { t } from '../../lib/i18n';

const NAV = [
  { to: '/',          icon: Sun,        label: t('Today')     },
  { to: '/tasks',     icon: ListChecks, label: t('Tasks')     },
  { to: '/reminders', icon: Pill,       label: t('Reminders') },
  { to: '/progress',  icon: BarChart3,  label: t('Progress')  },
];

// Full-screen forms hide the tab bar so the Save button is never covered.
export const HIDE_ON = [/^\/reminders\/(add|edit)/, /^\/tasks\/manage/, /^\/feedback/, /^\/checkin\//];

/** True on screens that hide the tab bar (forms, check-in). */
export const isTabBarHidden = (pathname: string) => HIDE_ON.some(r => r.test(pathname));

export default function BottomNav() {
  const { pathname } = useLocation();
  if (isTabBarHidden(pathname)) return null;
  return (
    <nav className="bottom-nav">
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Icon size={21} strokeWidth={1.9} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
