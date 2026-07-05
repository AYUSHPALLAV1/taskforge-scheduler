import React from 'react';
import { Settings, Shield, Key, Bell, Database } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Organization and project configuration</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
        {/* API Keys */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Key size={16} color="var(--accent-primary)" />
            <h2 style={{ fontSize: 14, fontWeight: 700 }}>API Keys</h2>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            API keys allow programmatic access to TaskForge. Keys are scoped per project and never stored in plaintext.
          </p>
          <button className="btn btn-secondary">
            <Key size={12} /> Create API Key
          </button>
        </div>

        {/* Security */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Shield size={16} color="var(--accent-primary)" />
            <h2 style={{ fontSize: 14, fontWeight: 700 }}>Security</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'JWT Access Token Expiry', value: '15 minutes' },
              { label: 'Refresh Token Rotation', value: 'Enabled (auto-revoke on replay)' },
              { label: 'Password Hashing', value: 'argon2id (memory=65536)' },
              { label: 'CORS Origin', value: process.env.CORS_ORIGIN || 'localhost:5173' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Infrastructure */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Database size={16} color="var(--accent-primary)" />
            <h2 style={{ fontSize: 14, fontWeight: 700 }}>Infrastructure</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Database', value: 'Neon PostgreSQL (pooled)' },
              { label: 'Cache / Pub-Sub', value: 'Upstash Redis (TLS)' },
              { label: 'Deployment', value: 'Render (auto-sleep on inactivity)' },
              { label: 'Worker Strategy', value: 'SELECT FOR UPDATE SKIP LOCKED' },
              { label: 'Leader Election', value: 'Redis Redlock (10s TTL)' },
              { label: 'AI Summaries', value: 'Gemini Flash (heuristic fallback)' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="glass-card" style={{ padding: 24, borderColor: 'rgba(239,68,68,0.2)', borderLeft: '2px solid #ef4444' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 12 }}>Danger Zone</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>These actions are irreversible. Please proceed with caution.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-danger btn-sm">Delete Organization</button>
            <button className="btn btn-danger btn-sm">Purge All Jobs</button>
          </div>
        </div>
      </div>
    </div>
  );
}
