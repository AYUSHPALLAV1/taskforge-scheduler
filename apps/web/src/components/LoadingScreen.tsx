import React from 'react';
import { Zap } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, zIndex: 9999,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'var(--gradient-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 30px rgba(99,102,241,0.4)',
        animation: 'pulse-live 2s infinite',
      }}>
        <Zap size={24} color="white" />
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading TaskForge…</div>
    </div>
  );
}
