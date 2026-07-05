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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px', marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={16} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>TaskForge</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scheduler</div>
          </div>
        </div>

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', marginBottom: 12 }}>
          <span className="live-dot" />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live updates</span>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 12px' }} />

        {/* Nav items */}
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={15} />
            <span style={{ flex: 1 }}>{label}</span>
            {to === '/dlq' && (
              <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.2)', color: '#f87171', borderRadius: 99, padding: '1px 6px' }}>!</span>
            )}
          </NavLink>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />
        <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

        {/* User section */}
        <div style={{ padding: '4px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{user?.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{user?.email}</div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}>
            <LogOut size={13} />
            Sign out
          </button>
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
