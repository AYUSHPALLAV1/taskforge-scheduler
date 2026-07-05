import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store';

export default function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.signup(form);
      const res = await api.login({ email: form.email, password: form.password });
      setAuth(res.data.user, res.data.accessToken);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="animate-fade-in" style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
            <Zap size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>Create your account</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Start scheduling jobs in minutes</p>
        </div>

        <div className="glass-card" style={{ padding: 32 }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#f87171' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Full name',      id: 'name',     icon: User, type: 'text',     placeholder: 'Jane Smith' },
              { label: 'Email address',  id: 'email',    icon: Mail, type: 'email',    placeholder: 'you@example.com' },
              { label: 'Password',       id: 'password', icon: Lock, type: 'password', placeholder: '••••••••' },
            ].map(({ label, id, icon: Icon, type, placeholder }) => (
              <div key={id}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>{label}</label>
                <div style={{ position: 'relative' }}>
                  <Icon size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input id={`signup-${id}`} className="input" type={type} value={(form as any)[id]} onChange={(e) => set(id, e.target.value)} placeholder={placeholder} style={{ paddingLeft: 36 }} required />
                </div>
              </div>
            ))}

            <button id="signup-submit" type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px 16px' }}>
              {loading ? <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block' }} className="animate-spin" /> : <> Create account <ArrowRight size={14} /></>}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
