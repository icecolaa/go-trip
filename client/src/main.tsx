import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import './styles.css';
import { useApp } from './store';
import { useThemeBootstrap } from './theme';
import { Toasts, TopBar } from './components/ui';
import UsageAssistant from './components/UsageAssistant';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TripPage from './pages/TripPage';
import SettingsPage from './pages/SettingsPage';
import FlyWherePage from './pages/FlyWherePage';

function Shell() {
  const { me, ready, loadMe } = useApp();
  const loc = useLocation();

  useThemeBootstrap();
  useEffect(() => { loadMe(); }, [loadMe]);

  if (!ready) return <div className="spin" style={{ marginTop: 120 }} />;

  const bare = loc.pathname === '/login';
  return (
    <>
      <Toasts />
      {me && <UsageAssistant />}
      {!bare && <TopBar me={me} />}
      <Outlet />
    </>
  );
}

function Protected() {
  const { me, ready } = useApp();
  if (!ready) return <div className="spin" style={{ marginTop: 120 }} />;
  if (!me) return <Navigate to="/login" replace />;
  return <Outlet />;
}

const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <Protected />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/trip/:id', element: <TripPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/flywhere', element: <FlyWherePage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
