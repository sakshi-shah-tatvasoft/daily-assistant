import { NavLink } from 'react-router-dom';
import { Sun, ListChecks, Pill, BarChart3 } from 'lucide-react';

const NAV = [
  { to: '/',          icon: Sun,        label: 'Today'     },
  { to: '/tasks',     icon: ListChecks, label: 'Tasks'     },
  { to: '/reminders', icon: Pill,       label: 'Reminders' },
  { to: '/progress',  icon: BarChart3,  label: 'Progress'  },
];

export default function BottomNav() {
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
