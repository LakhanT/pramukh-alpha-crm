import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PermissionsGate from './components/PermissionsGate';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PermissionsProvider } from './context/PermissionsContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BoardPage from './pages/BoardPage';
import TaskDetailPage from './pages/TaskDetailPage';
import NotificationsPage from './pages/NotificationsPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import TeamPage from './pages/TeamPage';
import MemberPerformancePage from './pages/MemberPerformancePage';
import ProjectSettingsPage from './pages/ProjectSettingsPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-text" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading…</div>;
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/board" element={<PrivateRoute><BoardPage /></PrivateRoute>} />
      <Route path="/tasks/:id" element={<PrivateRoute><TaskDetailPage /></PrivateRoute>} />
      <Route path="/notifications" element={<PrivateRoute><NotificationsPage /></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
      <Route path="/team" element={<PrivateRoute><TeamPage /></PrivateRoute>} />
      <Route path="/members/:id/performance" element={<PrivateRoute><MemberPerformancePage /></PrivateRoute>} />
      <Route path="/projects/:id/settings" element={<PrivateRoute><ProjectSettingsPage /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <PermissionsGate>
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <AppRoutes />
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </PermissionsGate>
  );
}
