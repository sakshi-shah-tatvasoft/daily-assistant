import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import BottomNav, { isTabBarHidden } from './components/layout/BottomNav';
import Home         from './pages/Home';
import Reminders    from './pages/Reminders';
import AddReminder  from './pages/AddReminder';
import Settings     from './pages/Settings';
import Tasks        from './pages/Tasks';
import TasksWeek    from './pages/TasksWeek';
import ManageTasks  from './pages/ManageTasks';
import Login        from './pages/Login';
import Welcome      from './pages/Welcome';
import Privacy      from './pages/Privacy';
import Feedback     from './pages/Feedback';
import Progress     from './pages/Progress';
import CheckIn      from './pages/CheckIn';
import Refill       from './pages/Refill';
import WaterSetup   from './pages/WaterSetup';
import WaterAdd     from './pages/WaterAdd';
import Report       from './pages/Report';
import CelebrationLayer from './components/ui/Celebration';
import ConfirmHost from './components/ui/ConfirmDialog';

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      <Loader2 className="animate-spin" />
    </div>
  );
}

/** Signed in: load the user's data, then onboarding or the main app. */
function SignedInApp() {
  const { status, loadError, reload, profile } = useApp();
  const { pathname } = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Couldn't load your data.</p>
        <p className="text-xs text-gray-400 mb-4">{loadError}</p>
        <button onClick={reload} className="btn-secondary"><RefreshCw size={16} /> Try again</button>
      </div>
    );
  }

  if (!profile.onboarded) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*"        element={<Welcome />} />
      </Routes>
    );
  }

  return (
    <div className={`app-shell ${isTabBarHidden(pathname) ? 'no-tabbar' : ''}`}>
      <Routes>
        <Route path="/"                     element={<Home />} />
        <Route path="/tasks"                element={<Tasks />} />
        <Route path="/tasks/week"           element={<TasksWeek />} />
        <Route path="/tasks/manage"         element={<ManageTasks />} />
        <Route path="/reminders"            element={<Reminders />} />
        <Route path="/reminders/add"        element={<AddReminder />} />
        <Route path="/reminders/edit/:id"   element={<AddReminder />} />
        <Route path="/progress"             element={<Progress />} />
        <Route path="/checkin/:key"         element={<CheckIn />} />
        <Route path="/refill/:id"           element={<Refill />} />
        <Route path="/water"                element={<WaterSetup />} />
        <Route path="/water/add"            element={<WaterAdd />} />
        <Route path="/report"               element={<Report />} />
        <Route path="/reports"              element={<Navigate to="/progress" replace />} />
        <Route path="/calendar"             element={<Navigate to="/progress" replace />} />
        <Route path="/settings"             element={<Settings />} />
        <Route path="/feedback"             element={<Feedback />} />
        <Route path="/privacy"              element={<Privacy />} />
        <Route path="*"                     element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
      <CelebrationLayer />
      <ConfirmHost />
    </div>
  );
}

function Root() {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*"        element={<Login />} />
      </Routes>
    );
  }
  // key = user id → switching accounts fully resets in-memory data
  return <AppProvider key={session.user.id}><SignedInApp /></AppProvider>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Root />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '14px',
              padding: '12px 18px',
              fontSize: '14px',
              fontFamily: 'Poppins, sans-serif',
              maxWidth: '340px',
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
