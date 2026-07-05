import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store';
import Layout from './components/Layout';
import LoadingScreen from './components/LoadingScreen';

// Lazy-load pages for code splitting
const LoginPage      = lazy(() => import('./pages/LoginPage'));
const SignupPage     = lazy(() => import('./pages/SignupPage'));
const DashboardPage  = lazy(() => import('./pages/DashboardPage'));
const JobsPage       = lazy(() => import('./pages/JobsPage'));
const JobDetailPage  = lazy(() => import('./pages/JobDetailPage'));
const QueuesPage     = lazy(() => import('./pages/QueuesPage'));
const WorkersPage    = lazy(() => import('./pages/WorkersPage'));
const WorkflowsPage  = lazy(() => import('./pages/WorkflowsPage'));
const DlqPage        = lazy(() => import('./pages/DlqPage'));
const MembersPage    = lazy(() => import('./pages/MembersPage'));
const SettingsPage   = lazy(() => import('./pages/SettingsPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected routes — wrapped in Layout sidebar */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:id" element={<JobDetailPage />} />
          <Route path="queues" element={<QueuesPage />} />
          <Route path="workers" element={<WorkersPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="dlq" element={<DlqPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
