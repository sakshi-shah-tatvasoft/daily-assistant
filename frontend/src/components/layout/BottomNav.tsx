import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Bell, BarChart2, Calendar, Settings } from 'lucide-react';

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Home'      },
  { to: '/reminders', icon: Bell,            label: 'Reminders' },
  { to: '/reports',   icon: BarChart2,       label: 'Reports'   },
  { to: '/calendar',  icon: Calendar,        label: 'Calendar'  },
  { to: '/settings',  icon: Settings,        label: 'Settings'  },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Icon size={20} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
