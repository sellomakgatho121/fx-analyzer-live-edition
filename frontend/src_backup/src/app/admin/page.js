'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, RefreshCw } from 'lucide-react';
import useSessionStore from '@/store/sessionStore';

// Same-origin: the built frontend and the backend are served from one URL.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = useSessionStore((s) => s.token);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Phase 2: /api/admin/users is JWT-guarded (requireAdmin after requireAuth).
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        console.error('Failed to fetch users:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) fetchUsers();
  }, [token, fetchUsers]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-void)', color: 'var(--text-secondary)',
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-void)',
      padding: '40px', maxWidth: '1200px', margin: '0 auto',
    }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '40px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Shield size={24} style={{ color: '#ff0f42' }} />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            System Admin
          </h1>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Manage users, subscriptions, and system access.
        </p>
      </motion.div>

      {/* Users Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="neo-card"
        style={{ padding: '24px', overflow: 'hidden' }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={18} style={{ color: '#00f2ff' }} />
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Users & Subscriptions</h2>
            <span className="badge badge-cyan">{users.length}</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchUsers}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-default)',
              borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
              color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '0.75rem', fontWeight: 600,
            }}
          >
            <RefreshCw size={12} /> Refresh
          </motion.button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['ID', 'Email', 'Name', 'Role', 'Status', 'Joined'].map(h => (
                  <th key={h} style={{
                    padding: '12px', textAlign: 'left', fontSize: '0.6875rem',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: 'var(--text-tertiary)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '12px', color: 'var(--text-tertiary)' }}>{u.id}</td>
                  <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>{u.email}</td>
                  <td style={{ padding: '12px' }}>{u.name}</td>
                  <td style={{ padding: '12px' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-ruby' : 'badge-cyan'}`}>
                      {u.role?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span className={`badge ${u.subscription_status === 'active' ? 'badge-emerald' : 'badge-gold'}`}>
                      {u.subscription_status?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-tertiary)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
