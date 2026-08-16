'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Lock, Mail, ShieldCheck, User, Zap } from 'lucide-react';
import useSessionStore from '@/store/sessionStore';

const STYLES = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    position: 'relative',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 16,
    padding: '40px 32px',
    boxShadow: 'var(--glow-subtle), 0 0 80px rgba(0, 255, 136, 0.04)',
    position: 'relative',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 160,
    height: 160,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0, 255, 136, 0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
    justifyContent: 'center',
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'var(--gradient-emerald)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--bg-void)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    textAlign: 'center',
    color: 'var(--text-primary)',
  },
  subtitle: {
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: '0.875rem',
    marginTop: 6,
    marginBottom: 28,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
    marginBottom: 6,
  },
  field: { marginBottom: 16 },
  error: {
    background: 'rgba(255, 51, 102, 0.1)',
    border: '1px solid rgba(255, 51, 102, 0.3)',
    color: 'var(--neon-ruby)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    padding: '10px 12px',
    borderRadius: 8,
    marginBottom: 16,
  },
  footer: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: '0.8125rem',
    color: 'var(--text-secondary)',
  },
  link: { color: 'var(--neon-emerald)', fontWeight: 600, textDecoration: 'none' },
  demo: {
    marginTop: 20,
    padding: '10px 12px',
    background: 'rgba(0, 242, 255, 0.05)',
    border: '1px dashed rgba(0, 242, 255, 0.25)',
    borderRadius: 8,
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    lineHeight: 1.7,
  },
};

export default function AuthShell({ mode }) {
  const router = useRouter();
  const isLogin = mode === 'login';
  const login = useSessionStore((s) => s.login);
  const register = useSessionStore((s) => s.register);
  const user = useSessionStore((s) => s.user);
  const authLoading = useSessionStore((s) => s.authLoading);
  const authError = useSessionStore((s) => s.authError);

  const [form, setForm] = useState({ name: '', email: '', password: '' });

  // Already signed in — go straight to the terminal. Gated on mounted: user
  // hydrates from localStorage on the client, so the SSR pass must render the
  // form (hydration consistency), then swap to a redirect post-hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (user) router.replace('/dashboard');
  }, [user, router]);
  if (mounted && user) return null;

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const result = isLogin
      ? await login(form.email.trim(), form.password)
      : await register(form.name.trim(), form.email.trim(), form.password);
    if (result.ok) {
      router.push('/dashboard');
    }
  };

  return (
    <div style={STYLES.wrapper}>
      <div style={STYLES.card}>
        <div style={STYLES.glow} />
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={STYLES.brand}>
            <div style={STYLES.brandIcon}>
              <BarChart3 size={20} />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              FX ANALYZER <span style={{ color: 'var(--neon-emerald)' }}>PRO</span>
            </span>
          </div>
        </Link>

        <h1 style={STYLES.title}>{isLogin ? 'Welcome back' : 'Create account'}</h1>
        <p style={STYLES.subtitle}>
          {isLogin
            ? 'Sign in to your trading terminal'
            : 'Set up your algorithmic FX workspace'}
        </p>

        {authError && <div style={STYLES.error}>{authError}</div>}

        <form onSubmit={submit}>
          {!isLogin && (
            <div style={STYLES.field}>
              <label style={STYLES.label}>
                <User size={11} /> Name
              </label>
              <input
                className="input"
                value={form.name}
                onChange={update('name')}
                placeholder="Trader Name"
                required
                autoComplete="name"
              />
            </div>
          )}

          <div style={STYLES.field}>
            <label style={STYLES.label}>
              <Mail size={11} /> Email
            </label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div style={STYLES.field}>
            <label style={STYLES.label}>
              <Lock size={11} /> Password
            </label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={update('password')}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            disabled={authLoading}
          >
            {authLoading ? (
              'Connecting…'
            ) : isLogin ? (
              <>Sign In <Zap size={14} /></>
            ) : (
              <>Create Account <Zap size={14} /></>
            )}
          </button>
        </form>

        <div style={STYLES.footer}>
          {isLogin ? (
            <>New to FX Analyzer? <Link href="/register" style={STYLES.link}>Create an account</Link></>
          ) : (
            <>Already have an account? <Link href="/login" style={STYLES.link}>Sign in</Link></>
          )}
        </div>

        {isLogin && (
          <div style={STYLES.demo}>
            <ShieldCheck size={12} style={{ verticalAlign: '-2px', marginRight: 4, color: 'var(--neon-cyan)' }} />
            <b style={{ color: 'var(--neon-cyan)' }}>DEV ACCESS</b>
            <br />
            admin: devtest@fx.com / dev-seed
            <br />
            user: user@fx.com / dev-seed
          </div>
        )}
      </div>
    </div>
  );
}