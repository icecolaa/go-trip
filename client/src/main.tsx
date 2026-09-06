import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import './styles.css';
import { useApp } from './store';
import { Toasts, TopBar } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TripPage from './pages/TripPage';
import JoinPage from './pages/JoinPage';
import SharePage from './pages/SharePage';
import SettingsPage from './pages/SettingsPage';

function Shell() {
  const { me, ready, loadMe } = useApp();
  const loc = useLocation();

  useEffect(() => { loadMe(); }, [loadMe]);

  if (!ready) return <div className="spin" style={{ marginTop: 120 }} />;

  const bare = loc.pathname.startsWith('/join/') || loc.pathname.startsWith('/s/') || loc.pathname === '/login';
  return (
    <>
      <Toasts />
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
      { path: '/join/:code', element: <JoinPage /> },
      { path: '/s/:token', element: <SharePage /> },
      {
        element: <Protected />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/trip/:id', element: <TripPage /> },
          { path: '/settings', element: <SettingsPage /> },
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
