import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store';

export default function LoginPage() {
  const [email, setEmail] = useState('demo@taskforge.dev');
  const [password, setPassword] = useState('Demo1234!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login({ email, password });
      setAuth(res.data.user, res.data.accessToken);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', 
      background: 'linear-gradient(to bottom, #d0e4f5 0%, #e2eff8 100%)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: 24,
      animation: 'fadeIn 1s ease-in-out'
    }}>
      <div style={{
        display: 'flex',
        width: '100%',
        maxWidth: 900,
        background: '#ffffff',
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        minHeight: 550,
      }}>
        {/* Left Side - Video Card */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: 8 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
            <video 
              src="/videos/login_video.mp4"
              autoPlay
              loop
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute',
              bottom: 30,
              left: 30,
              color: 'white',
              textShadow: '0 2px 10px rgba(0,0,0,0.5)'
            }}>
              <h2 style={{ fontSize: 32, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>
                EXPLORE.<br/>LEARN. GROW.
              </h2>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div style={{ flex: 1, padding: '48px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
            }}>
              <Zap size={32} color="#333" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 6, textTransform: 'uppercase' }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              Enter your email and password to access your account
            </p>
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20,
              fontSize: 13, color: '#dc2626',
            }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={{ 
                    padding: '10px 12px 10px 36px', width: '100%', borderRadius: 8, 
                    border: '1px solid #e5e7eb', background: '#f9fafb', color: '#111827',
                    fontSize: 14, outline: 'none', boxSizing: 'border-box'
                  }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{ 
                    padding: '10px 12px 10px 36px', width: '100%', borderRadius: 8, 
                    border: '1px solid #e5e7eb', background: '#f9fafb', color: '#111827',
                    fontSize: 14, outline: 'none', boxSizing: 'border-box'
                  }}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4b5563', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ borderRadius: 4, border: '1px solid #d1d5db' }} />
                  Remember me
                </label>
                <a href="#" style={{ fontSize: 12, color: '#4b5563', textDecoration: 'none' }}>Forgot Password</a>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              style={{ 
                width: '100%', padding: '12px 16px', background: '#000', color: '#fff',
                borderRadius: 8, fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
                display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 8
              }}
            >
              {loading ? (
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} className="animate-spin" />
              ) : (
                'Sign In'
              )}
            </button>
            
            <button
              type="button"
              style={{ 
                width: '100%', padding: '10px 16px', background: '#fff', color: '#374151',
                borderRadius: 8, fontWeight: 500, fontSize: 13, border: '1px solid #e5e7eb', cursor: 'pointer',
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#6b7280' }}>
            Don't have an account?{' '}
            <Link to="/signup" style={{ color: '#000', textDecoration: 'none', fontWeight: 600 }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
