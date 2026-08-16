'use client';
import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  BarChart3,
  Bot,
  TrendingUp,
  Shield,
  History,
  FlaskConical,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  Cpu,
  LogOut,
} from 'lucide-react';

import { useUIStore, useSessionStore, useTradingStore } from '@/store';
import useSocket from '@/hooks/useSocket';
import TickerBar from '@/components/TickerBar';
import PairSelector from '@/components/PairSelector';
import ModelSelector from '@/components/ModelSelector';
import socketEventBus from '@/lib/socketEventBus';

// ── Navigation Items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard, href: '/dashboard' },
  { id: 'analysis',     label: 'Analysis Lab',  icon: BarChart3,       href: '/analysis' },
  { id: 'arena',        label: 'Agent Arena',   icon: Bot,             href: '/agents' },
  { id: 'trading',      label: 'Trading',       icon: TrendingUp,      href: '/trading' },
  { id: 'portfolio',    label: 'Portfolio',     icon: Shield,          href: '/portfolio' },
  { id: 'sessions',     label: 'Bot Sessions',  icon: History,         href: '/sessions' },
  { id: 'research',     label: 'Research',      icon: FlaskConical,    href: '/research' },
  { id: 'settings',     label: 'Settings',      icon: Settings,        href: '/settings' },
];

// ── Sidebar Component ─────────────────────────────────────────────────
function Sidebar({ isOpen, onToggle }) {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const sidebarWidth = isOpen ? 240 : 64;

  return (
    <motion.aside
      className="sidebar-container"
      animate={{ width: sidebarWidth }}
      transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: '100vh',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: 'var(--space-lg) var(--space-md)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isOpen ? 'space-between' : 'center',
          minHeight: 64,
        }}
      >
        {isOpen ? (
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--gradient-premium)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 800,
                color: '#000',
                flexShrink: 0,
              }}
            >
              FX
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              Analyzer
            </span>
          </div>
        ) : (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--gradient-premium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 800,
              color: '#000',
              flexShrink: 0,
            }}
          >
            FX
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="sidebar-toggle-btn"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: isOpen ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, padding: 'var(--space-sm)', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setActiveView(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 'var(--space-sm) var(--space-sm)',
                marginBottom: 2,
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                color: isActive ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                background: isActive ? 'rgba(0, 242, 255, 0.06)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--neon-cyan)' : '2px solid transparent',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
              className="sidebar-nav-item"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-sm)',
                  background: isActive ? 'rgba(0, 242, 255, 0.1)' : 'transparent',
                }}
              >
                <Icon size={18} />
              </div>
              <AnimatePresence>
                {isOpen && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    style={{ fontSize: 14, fontWeight: 500 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Collapsed toggle at bottom */}
      {!isOpen && (
        <div style={{ padding: 'var(--space-sm)', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onToggle}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
            title="Expand sidebar"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </motion.aside>
  );
}

// ── Header Component ─────────────────────────────────────────────────
function ShellHeader({ onToggleSidebar, sidebarOpen }) {
  const activePair = useUIStore((s) => s.activePair);
  const setPair = useUIStore((s) => s.setPair);
  const favoritePairs = useUIStore((s) => s.favoritePairs);
  const toggleFavorite = useUIStore((s) => s.toggleFavorite);
  const isConnected = useSessionStore((s) => s.isConnected);
  const modelName = useSessionStore((s) => s.modelName);

  // We pass the socket event bus as the socket prop to existing components
  const socket = socketEventBus.getSocket();

  return (
    <header
      className="shell-header"
      style={{
        height: 56,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-lg)',
        gap: 'var(--space-md)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Sidebar toggle (hamburger) */}
      <button
        onClick={onToggleSidebar}
        className="sidebar-mobile-toggle"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          flexShrink: 0,
        }}
      >
        {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Pair Selector */}
      <PairSelector
        selectedPair={activePair}
        onPairChange={setPair}
        favorites={favoritePairs}
        onToggleFavorite={toggleFavorite}
      />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Connection Status */}
      <div
        className="flex items-center gap-sm"
        style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: isConnected ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 51, 102, 0.06)' }}
      >
        {isConnected ? (
          <Wifi size={14} className="text-emerald" />
        ) : (
          <WifiOff size={14} style={{ color: 'var(--neon-ruby)' }} />
        )}
        <span
          className="text-caption"
          style={{ color: isConnected ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}
        >
          {isConnected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Model Selector */}
      <ModelSelector socket={socket} currentModel={modelName} />

      {/* Engine Health */}
      <div className="flex items-center gap-xs text-muted">
        <Cpu size={14} />
        <span className="text-caption">v4.2</span>
      </div>
    </header>
  );
}

// ── Status Bar Component ──────────────────────────────────────────────
function StatusBar() {
  const isConnected = useSessionStore((s) => s.isConnected);
  const lastSignalTime = useSessionStore((s) => s.lastSignalTime);
  const stats = useTradingStore((s) => s.stats);
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [engineStatus, setEngineStatus] = useState(null);
  useEffect(() => setMounted(true), []);

  // Live engine health — poll /api/engine/status so the status bar reflects
  // the real broker/subsystem state instead of static text.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/engine/status', {
          headers: { Authorization: `Bearer ${useSessionStore.getState().token}` },
        });
        if (res.ok && !cancelled) setEngineStatus(await res.json());
      } catch {
        // Engine briefly unreachable — keep last known state.
      }
    };
    poll();
    const timer = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const brokerOk = engineStatus?.broker?.connected === true;
  const datafeedOk = engineStatus?.subsystems?.datafeed === 'live';
  const engineLabel = engineStatus
    ? engineStatus.status === 'unreachable' || engineStatus.status === 'error'
      ? 'OFFLINE'
      : brokerOk
        ? 'READY'
        : 'BROKER LINK'
    : '…';

  return (
    <footer
      className="status-bar"
      style={{
        height: 32,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-md)',
        gap: 'var(--space-lg)',
        fontSize: 11,
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        position: 'sticky',
        bottom: 0,
        zIndex: 50,
      }}
    >
      {/* Connection indicator */}
      <div className="flex items-center gap-xs">
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isConnected ? 'var(--neon-emerald)' : 'var(--neon-ruby)',
            boxShadow: isConnected ? '0 0 6px rgba(0,255,136,0.5)' : 'none',
          }}
        />
        <span>{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
      </div>

      {/* Separator */}
      <span style={{ opacity: 0.3 }}>|</span>

      {/* Last signal */}
      <span>
        LAST SIGNAL: {lastSignalTime ? new Date(lastSignalTime).toLocaleTimeString() : '—'}
      </span>

      {/* Separator */}
      <span style={{ opacity: 0.3 }}>|</span>

      {/* Engine status */}
      <span>ENGINE: {engineStatus?.status === 'unreachable' || engineStatus?.status === 'error' ? 'OFFLINE' : engineLabel}{engineStatus?.subsystems?.datafeed === 'live' ? ' · FEED LIVE' : ''}</span>

      {/* Separator */}
      <span style={{ opacity: 0.3 }}>|</span>

      {/* Trades */}
      <span>TRADES: {stats.totalTrades}</span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User (Phase 2) — gated on mounted: user hydrates from localStorage
          on the client, so rendering it during SSR would mismatch. */}
      {mounted && user && (
        <>
          <span style={{ color: 'var(--neon-cyan)' }}>
            {user.role === 'admin' ? 'ADMIN' : user.subscription === 'active' ? 'PRO' : 'FREE'} · {user.email}
          </span>
          <span style={{ opacity: 0.3 }}>|</span>
          <button
            onClick={() => {
              // Tear down the socket first: a stale socket bound to the old
              // user would be reused by connectSocket() after the next login.
              socketEventBus.disconnectSocket();
              logout();
              router.replace('/login');
            }}
            title="Sign out"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 4,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--neon-ruby)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            <LogOut size={11} /> SIGN OUT
          </button>
        </>
      )}

      {/* Version */}
      <span>FX ANALYZER PRO · v4.2.0</span>
    </footer>
  );
}

// ── Main Shell Layout ─────────────────────────────────────────────────
export default function ShellLayout({ children }) {
  const router = useRouter();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setConnected = useSessionStore((s) => s.setConnected);
  const token = useSessionStore((s) => s.token);

  // Phase 2 (T4): route guard — the shell is auth-only. The session store
  // hydrates the JWT synchronously from localStorage on first render, so a
  // missing token here means the user is genuinely unauthenticated.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (!token) router.replace('/login');
  }, [token, router]);

  // Initialize socket connection (socketEventBus no-ops without a token —
  // the ShellLayout keeps hook order stable regardless of auth state)
  useSocket();

  if (mounted && !token) return null; // avoid flashing the shell while redirecting

  return (
    <div
      className="shell-layout"
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-void)',
      }}
    >
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />

      {/* Main content area */}
      <div
        className="main-content"
        style={{
          flex: 1,
          marginLeft: sidebarOpen ? 240 : 64,
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-left 0.3s cubic-bezier(0.19, 1, 0.22, 1)',
          minWidth: 0,
        }}
      >
        {/* Header */}
        <ShellHeader onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />

        {/* Ticker Bar */}
        <TickerBar />

        {/* Page content */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 'var(--space-lg)',
          }}
        >
          {children}
        </main>

        {/* Status Bar */}
        <StatusBar />
      </div>
    </div>
  );
}
