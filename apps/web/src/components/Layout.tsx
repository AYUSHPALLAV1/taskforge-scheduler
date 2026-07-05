import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, Layers, Cpu, GitBranch,
  AlertTriangle, Users, Settings, LogOut, Zap, ChevronRight,
} from 'lucide-react';
import { useAuthStore, useUiStore } from '../store';
import api from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useBootstrapContext } from '../hooks/useBootstrapContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs',      icon: Briefcase,       label: 'Jobs' },
  { to: '/queues',    icon: Layers,          label: 'Queues' },
  { to: '/workers',   icon: Cpu,             label: 'Workers' },
  { to: '/workflows', icon: GitBranch,       label: 'Workflows' },
  { to: '/dlq',       icon: AlertTriangle,   label: 'Dead Letter' },
  { to: '/members',   icon: Users,           label: 'Members' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
];

export default function Layout() {
  const { user, clearAuth } = useAuthStore();
  const { selectedProjectId } = useUiStore();
  const navigate = useNavigate();

  // Bootstrap org + project context on first load
  useBootstrapContext();

  // Connect to WebSocket globally once layout mounts
  useWebSocket(selectedProjectId);


  const handleLogout = async () => {
    try { await api.logout(); } catch (_) {}
    clearAuth();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div style={{ padding: '8px', marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <Zap size={20} color="white" />
          </div>
        </div>

        <div style={{ width: '40px', height: 1, background: 'var(--border)', marginBottom: 8 }} />

        {/* Nav items */}
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <div className="icon-wrapper">
              <Icon size={20} />
            </div>
            <span className="label">{label}</span>
            {to === '/dlq' && (
              <span className="label" style={{ marginLeft: 8, fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderRadius: 99, padding: '2px 6px' }}>!</span>
            )}
          </NavLink>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />
        <div style={{ width: '40px', height: 1, background: 'var(--border)', margin: '16px 0' }} />

        {/* User section */}
        <div className="sidebar-item" onClick={handleLogout} style={{ width: 48, overflow: 'hidden' }}>
          <div className="icon-wrapper">
            <LogOut size={20} />
          </div>
          <span className="label">Sign out</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-layout">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
