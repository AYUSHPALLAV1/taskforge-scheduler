import React, { useState, useEffect } from 'react';
import { Mail, Bell, Plus } from 'lucide-react';

const quotes = [
  "The only way to do great work is to love what you do.",
  "Innovation distinguishes between a leader and a follower.",
  "Stay hungry, stay foolish.",
  "Simplicity is the ultimate sophistication.",
  "Design is not just what it looks like and feels like. Design is how it works."
];

export default function ProfileCard() {
  const [quote, setQuote] = useState('');

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
  }, []);

  return (
    <div className="glass-card" style={{ 
      position: 'relative',
      padding: '40px 24px 24px', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'rgba(255, 255, 255, 0.45)', // matching the light glass theme
      border: '1px solid var(--border)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.05)',
      overflow: 'visible',
      marginTop: 40 // Make room for the overlapping avatar
    }}>
      
      {/* Overlapping Profile Avatar */}
      <div style={{
        position: 'absolute',
        top: -40,
        left: 24,
        width: 80,
        height: 80,
        borderRadius: '50%',
        padding: 4,
        background: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border-strong)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
      }}>
        <img 
          src="/images/profile.jpeg" 
          alt="Profile" 
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
        />
      </div>

      {/* User Info */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Alex Carter
        </h2>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <span style={{ 
            fontSize: 11, fontWeight: 600, padding: '4px 12px', 
            borderRadius: 99, border: '1px solid var(--border-strong)',
            background: 'rgba(255, 255, 255, 0.5)', color: 'var(--text-secondary)'
          }}>
            Developer
          </span>
          <span style={{ 
            fontSize: 11, fontWeight: 600, padding: '4px 12px', 
            borderRadius: 99, border: '1px solid var(--border-strong)',
            background: 'rgba(255, 255, 255, 0.5)', color: 'var(--text-secondary)'
          }}>
            Pro User
          </span>
        </div>

        {/* Random Quote */}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
          "{quote}"
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={{ 
            flex: 1, padding: '10px 0', borderRadius: 20, border: '1px solid var(--border-strong)',
            background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)',
            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer', transition: 'all 0.2s', backdropFilter: 'blur(10px)'
          }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)'}>
            <Plus size={16} /> Follow
          </button>
          
          <button style={{
            width: 42, height: 42, borderRadius: '50%', border: '1px solid var(--border-strong)',
            background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s', backdropFilter: 'blur(10px)'
          }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)'}>
            <Mail size={16} />
          </button>

          <button style={{
            width: 42, height: 42, borderRadius: '50%', border: '1px solid var(--border-strong)',
            background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s', backdropFilter: 'blur(10px)'
          }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)'}>
            <Bell size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
