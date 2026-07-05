import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Shield } from 'lucide-react';
import api from '../lib/api';

const ROLE_OPTIONS = ['Owner', 'Admin', 'Member', 'Viewer'];
const ROLE_COLORS: Record<string, string> = { Owner: '#f59e0b', Admin: '#6366f1', Member: '#10b981', Viewer: '#64748b' };

export default function MembersPage() {
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'Member' });
  const [showInvite, setShowInvite] = useState(false);
  const queryClient = useQueryClient();

  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => api.listOrgs() });
  const orgId = (orgs as any)?.data?.[0]?.id;

  const { data: membersResp, isLoading } = useQuery({
    queryKey: ['members', orgId], queryFn: () => api.listMembers(orgId), enabled: !!orgId,
  });
  const members: any[] = (membersResp as any)?.data || [];

  const inviteMutation = useMutation({
    mutationFn: (data: any) => api.inviteMember(orgId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['members', orgId] }); setShowInvite(false); },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.removeMember(orgId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', orgId] }),
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-subtitle">Manage organization access and roles</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
          <UserPlus size={13} /> Invite Member
        </button>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>
                      {m.user?.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600 }}>{m.user?.name}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{m.user?.email}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: ROLE_COLORS[m.role] || 'var(--text-secondary)', background: `${ROLE_COLORS[m.role]}18`, padding: '2px 8px', borderRadius: 99, border: `1px solid ${ROLE_COLORS[m.role]}44` }}>
                    <Shield size={9} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />
                    {m.role}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(m.joinedAt).toLocaleDateString()}</td>
                <td>
                  {m.role !== 'Owner' && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => { if (confirm('Remove this member?')) removeMutation.mutate(m.userId); }}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  {isLoading ? 'Loading…' : 'No members found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card animate-fade-in" style={{ padding: 28, width: '100%', maxWidth: 400 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Invite Member</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Email address</label>
                <input className="input" type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="teammate@company.com" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Role</label>
                <select className="input" value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}>
                  {ROLE_OPTIONS.filter((r) => r !== 'Owner').map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={inviteMutation.isPending || !inviteForm.email}
                onClick={() => inviteMutation.mutate(inviteForm)}
              >
                {inviteMutation.isPending ? 'Inviting…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
