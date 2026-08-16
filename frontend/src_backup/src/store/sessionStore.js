'use client';
import { create } from 'zustand';

/**
 * sessionStore — User authentication, socket connection status, and model provider info.
 *
 * Phase 2: JWT + user are persisted in localStorage (key: fx_session) so a page
 * refresh keeps the session. `login`/`register` hit the backend REST endpoints
 * (/api/auth/login, /api/auth/register); `logout` clears the session. The token
 * is read by socketEventBus.connectSocket() for the Socket.IO handshake.
 */

const STORAGE_KEY = 'fx_session';
// Same-origin: the built frontend and the backend are served from one URL.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

// Hydrate from localStorage (client-side only — guard for SSR).
function loadPersistedSession() {
  if (typeof window === 'undefined') return { user: null, token: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw);
    return {
      user: parsed.user || null,
      token: parsed.token || null,
    };
  } catch (e) {
    console.warn('[session] Failed to read persisted session:', e);
    return { user: null, token: null };
  }
}

function persistSession(user, token) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  } catch (e) {
    console.warn('[session] Failed to persist session:', e);
  }
}

function clearPersistedSession() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[session] Failed to clear session:', e);
  }
}

function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name || user.email?.split('@')[0] || 'Trader',
    email: user.email,
    role: user.role || 'user',
    subscription: user.subscription_status || user.subscription || 'free',
  };
}

const persisted = loadPersistedSession();

const useSessionStore = create((set) => ({
  // ── State ──────────────────────────────────────────────────────────
  user: persisted.user,
  token: persisted.token,
  isConnected: false,
  provider: 'opencode',
  modelName: 'opencode:deepseek-v4-flash-free',
  lastSignalTime: null,
  connectionError: null,
  authError: null,
  authLoading: false,

  // ── Auth actions (Phase 2) ─────────────────────────────────────────
  async login(email, password) {
    set({ authLoading: true, authError: null });
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      const user = normalizeUser(data.user);
      set({ user, token: data.token, authLoading: false, authError: null });
      persistSession(user, data.token);
      return { ok: true, user };
    } catch (err) {
      set({ authLoading: false, authError: err.message });
      return { ok: false, error: err.message };
    }
  },

  async register(name, email, password) {
    set({ authLoading: true, authError: null });
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      const user = normalizeUser(data.user);
      persistSession(user, data.token);
      set({ user, token: data.token, authLoading: false, authError: null });
      return { ok: true, user };
    } catch (err) {
      set({ authLoading: false, authError: err.message });
      return { ok: false, error: err.message };
    }
  },

  logout() {
    clearPersistedSession();
    set({
      user: null,
      token: null,
      isConnected: false,
      lastSignalTime: null,
      connectionError: null,
      authError: null,
    });
  },

  // ── Socket / connection actions ────────────────────────────────────
  setConnected: (connected) =>
    set({ isConnected: connected, connectionError: connected ? null : undefined }),

  setConnectionError: (error) =>
    set({ isConnected: false, connectionError: error }),

  setProvider: (provider) => set({ provider }),

  setModelName: (modelName) => set({ modelName }),

  setLastSignalTime: (timestamp) => set({ lastSignalTime: timestamp }),
}));

export default useSessionStore;