/**
 * auth.js — Phase 2 auth core
 *
 * Password hashing (bcryptjs, pure-JS, Termux-safe), JWT sign/verify
 * (jsonwebtoken), and Express/`require*` middleware. Used by server.js
 * for REST routes and the Socket.IO handshake.
 *
 * Server-to-server API-key auth is kept ONLY for webhook-style routes
 * (POST /api/admin/upgrade) via requireApiKey.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// JWT secret from env, with a dev fallback so the stack boots without config.
// Production must set JWT_SECRET (see backend/.env.example).
const JWT_SECRET = process.env.JWT_SECRET || 'fx-analyzer-dev-secret-change-me';

const TOKEN_EXPIRY = '24h';
const BCRYPT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored value.
 *
 * Stored values may be:
 *  - bcrypt hash  (`$2b$...`) — normal path
 *  - legacy plaintext ('dev-seed' seeds from before Phase 2) — transparently
 *    upgraded to a bcrypt hash on first successful login (T2 migration).
 */
function comparePassword(plain, stored) {
  if (stored.startsWith('$2')) {
    return bcrypt.compareSync(plain, stored);
  }
  // Legacy plaintext row: verify then upgrade in place.
  if (stored === plain) {
    return { upgraded: true };
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * requireAuth — factory: verify `Authorization: Bearer <token>`, then re-read
 * the user's role + subscription_status FRESH from the DB (T6 — never trust
 * token claims for authorization). Attaches the full DB row as req.user.
 *
 * @param {function} dbGet — (sql, params) => Promise<row|null>
 */
function makeRequireAuth(dbGet) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized: missing token' });
    }
    let payload;
    try {
      payload = verifyToken(token);
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
    }
    dbGet(
      'SELECT id, email, name, role, subscription_status FROM users WHERE id = ?',
      [payload.sub ?? payload.id]
    ).then((row) => {
      if (!row) return res.status(401).json({ error: 'Unauthorized: unknown user' });
      // Keep both identities for callers using payload claims (sub/email)
      // and those using the fresh DB row.
      req.user = { ...payload, ...row };
      next();
    }).catch((e) => {
      console.error('Auth DB error:', e);
      res.status(500).json({ error: 'Server error' });
    });
  };
}

/** requireAdmin — must be chained AFTER requireAuth. */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin role required' });
  }
  next();
}

/** requireApiKey — server-to-server (webhook) auth via x-api-key header. */
function requireApiKey(req, res, next) {
  const supplied = req.headers['x-api-key'];
  if (!supplied || !crypto.timingSafeEqual(
    Buffer.from(supplied),
    Buffer.from(process.env.API_KEY || 'fx-analyzer-secure-key-2026')
  )) {
    return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Socket.IO middleware
// ---------------------------------------------------------------------------
/**
 * socketAuth — verify JWT from handshake.auth.token, load the user's
 * role + subscription_status FRESH from the DB, attach to socket.user.
 * Premium room membership is decided per-handshake (T6: downgrade applies
 * immediately on next reconnect).
 *
 * @param {function} dbGet — (sql, params) => Promise<row|null>
 */
function makeSocketAuth(dbGet) {
  return (socket, next) => {
    const token = socket.handshake?.auth?.token;
    if (!token) return next(new Error('AUTH_ERROR: missing token'));
    let payload;
    try {
      payload = verifyToken(token);
    } catch (e) {
      return next(new Error('AUTH_ERROR: invalid or expired token'));
    }
    dbGet(
      'SELECT id, email, name, role, subscription_status FROM users WHERE id = ?',
      [payload.sub ?? payload.id]
    ).then((row) => {
      if (!row) return next(new Error('AUTH_ERROR: unknown user'));
      socket.user = {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        subscription_status: row.subscription_status,
      };
      next();
    }).catch((e) => next(new Error(`AUTH_ERROR: ${e.message}`)));
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  makeRequireAuth,
  requireAdmin,
  requireApiKey,
  makeSocketAuth,
};