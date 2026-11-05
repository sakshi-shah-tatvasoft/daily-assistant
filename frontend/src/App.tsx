import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppProvider } from './context/AppContext';
import BottomNav from './components/layout/BottomNav';
import Home         from './pages/Home';
import Reminders    from './pages/Reminders';
import AddReminder  from './pages/AddReminder';
import Reports      from './pages/Reports';
import CalendarPage from './pages/CalendarPage';
import Settings     from './pages/Settings';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Routes>
            <Route path="/"                     element={<Home />} />
            <Route path="/reminders"            element={<Reminders />} />
            <Route path="/reminders/add"        element={<AddReminder />} />
            <Route path="/reminders/edit/:id"   element={<AddReminder />} />
            <Route path="/reports"              element={<Reports />} />
            <Route path="/calendar"             element={<CalendarPage />} />
            <Route path="/settings"             element={<Settings />} />
            <Route path="*"                     element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '14px',
              padding: '12px 18px',
              fontSize: '14px',
              fontFamily: 'Inter, sans-serif',
              maxWidth: '340px',
            },
          }}
        />
      </BrowserRouter>
    </AppProvider>
  );
}
