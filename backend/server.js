const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load .env files if present: locally at ../.env (repo root), and on Render
// at /etc/secrets/.env (API-created Secret Files mount there; dashboard ones
// can mount anywhere, e.g. /app/.env). Real environment variables (Render's
// own env vars) always win over both.
const envFiles = [path.resolve(__dirname, '../.env'), '/app/.env', '/etc/secrets/.env'];
for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
        for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (m && !(m[1] in process.env)) {
                process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
            }
        }
    }
}

// Database backend: Postgres when DATABASE_URL is set (Render + Supabase),
// otherwise SQLite (local/phone, keeps working unchanged).
const USE_PG = !!process.env.DATABASE_URL;

// ZeroMQ is optional: without the native addon (platforms where it cannot
// be built, e.g. Android/Termux), the server runs in degraded mode — REST,
// Socket.IO and SQLite still work, and engine commands report the engine as
// unreachable instead of crashing the process.
let zmq = null;
try {
    zmq = require('zeromq');
} catch (e) {
    console.warn('⚠️  zeromq addon unavailable — running WITHOUT the Python engine bridge:', e.message.split('\n')[0]);
}

// HTTP fallback transport: when the ZeroMQ addon cannot load, the server
// talks to the Python engine through engine/http_bridge.py instead
// (POST /cmd for commands, GET /events SSE stream for engine events).
const ENGINE_HTTP_URL = process.env.ENGINE_HTTP_URL || 'http://127.0.0.1:8765';

// Per-command timeouts (ms). Long-running analysis commands need far more
// headroom than quick status pings.
const CMD_TIMEOUTS = {
    ENGINE_AGENT_ANALYZE: 240000,
    GET_CANDLES: 45000,
    EXECUTE_TRADE: 15000,
    AMEND_TRADE: 45000,   // engine waits _EXEC_TIMEOUT (30s) + reconcile to verify amends
    CLOSE_TRADE: 45000,   // can queue behind a pending amend on the engine REP socket
    SET_LLM_MODEL: 15000,
    GET_MODELS: 15000,
    MT5_STATUS: 15000,
    BROKER_STATUS: 15000,
    AGENT_BRIDGE_STATUS: 15000,
};

function cmdTimeout(cmd) {
    return CMD_TIMEOUTS[cmd] || 15000;
}

const app = express();

// Secure CORS - Only allow the Render frontend (same-origin static export),
// the old Vercel frontend, and local development.
const allowedOrigins = [
    'http://localhost:3000',
    'https://frontend-jjh4l1mja-sellomakgatho121-2317s-projects.vercel.app',
    'https://fx-analyzer-live.onrender.com'
];

// Local development origins: localhost / 127.0.0.1 on any port (Termux dev
// runs on e.g. :4999), and LAN private ranges (phone/PC on the same network).
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LAN_ORIGIN_RE = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl), allowed
        // origins, and any Render/Vercel-hosted frontend.
        if (!origin || allowedOrigins.includes(origin)
            || origin.endsWith('.onrender.com') || origin.endsWith('.vercel.app')
            || LOCAL_ORIGIN_RE.test(origin) || LAN_ORIGIN_RE.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST']
}));
app.use(express.json());

// --- Phase 5 Rate limiting ---
// Every /api/* route is throttled per IP (both REST and Socket.IO REST calls
// pass through express). /api/health stays open for load-balancer probes.
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,      // 15 minutes
    limit: 300,                    // 300 requests per window per IP
    standardHeaders: 'draft-7',    // RateLimit-* headers
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

// Strict limiter for credential endpoints — brute-force shield. Successful
// logins are not counted, so legit users never hit it.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' },
});

app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next(); // exempt probes
    return apiLimiter(req, res, next);
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// --- Phase 2 Auth ---
// JWT auth for all user-facing routes (requireAuth / requireAdmin).
// The API-key path survives ONLY for server-to-server webhooks
// (POST /api/admin/upgrade) via requireApiKey.
const {
    hashPassword,
    comparePassword,
    signToken,
    verifyToken,
    makeRequireAuth,
    requireAdmin,
    requireApiKey,
    makeSocketAuth,
} = require('./auth');

const API_KEY = process.env.API_KEY || 'fx-analyzer-secure-key-2026';

// requireAuth needs DB access to re-read role/subscription fresh (T6).
const dbGetOne = (sql, params) => dbAll(sql, params).then(rows => rows[0] || null);
const requireAuth = makeRequireAuth(dbGetOne);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});

// --- Socket Auth (Phase 2, T3) ---
// Every socket connection must present a valid JWT in the handshake
// (socket.io 'auth' option). The user's role + subscription_status are
// re-read from the DB here — never trusted from token claims (T6).
io.use(makeSocketAuth(dbGetOne));

// --- Database Connection ---
// SQLite (local/phone) or Postgres (Render + Supabase via DATABASE_URL).
let db;
if (USE_PG) {
    const { Client } = require('pg');
    db = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
} else {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.resolve(__dirname, '../fx_analyzer.db');
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('Error opening database:', err.message);
        else console.log('📁 Connected to SQLite database:', dbPath);
    });
}

// DB Helpers (Promisified). SQLite uses `?` params; Postgres rewrites them to
// $1..$n and appends RETURNING id for INSERTs (used as result.lastID).
const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
};

const dbAll = USE_PG
    ? (sql, params = []) => db.query(toPg(sql), params).then((r) => r.rows)
    : (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });

const dbRun = USE_PG
    ? (sql, params = []) => {
        const isInsert = /^\s*INSERT/i.test(sql);
        const text = toPg(sql) + (isInsert ? ' RETURNING id' : '');
        return db.query(text, params).then((r) => ({
            lastID: isInsert ? (r.rows[0] ? r.rows[0].id : undefined) : undefined,
            changes: r.rowCount,
        }));
    }
    : (sql, params = []) => new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
    });

// --- Schema Bootstrap ---
// Mirrors engine/database.py so the backend works standalone (before the
// Python engine has ever run init_db()). Idempotent.
async function initDatabase() {
    if (USE_PG) {
        await db.connect();
        const host = process.env.DATABASE_URL.split('@')[1] || '';
        console.log('🐘 Connected to Postgres:', host.split('?')[0]);
    }
    // SQLite keeps the original CREATEs; Postgres gets the equivalent
    // dialect (BIGSERIAL ids; trades includes ticket/position_id up front).
    const createTables = USE_PG ? [
        `CREATE TABLE IF NOT EXISTS signals (
            id BIGSERIAL PRIMARY KEY,
            timestamp TEXT,
            symbol TEXT,
            action TEXT,
            price DOUBLE PRECISION,
            confidence DOUBLE PRECISION,
            reasoning TEXT,
            risk_factors TEXT,
            raw_data TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS trades (
            id BIGSERIAL PRIMARY KEY,
            timestamp TEXT,
            symbol TEXT,
            action TEXT,
            entry_price DOUBLE PRECISION,
            exit_price DOUBLE PRECISION,
            pl DOUBLE PRECISION,
            status TEXT,
            ticket TEXT,
            position_id TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            role TEXT DEFAULT 'user',
            subscription_status TEXT DEFAULT 'inactive',
            created_at TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS vibe_research (
            id BIGSERIAL PRIMARY KEY,
            timestamp TEXT,
            run_type TEXT,
            prompt TEXT,
            command TEXT,
            output TEXT,
            status TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS risk_settings (
            id BIGSERIAL PRIMARY KEY,
            settings TEXT,
            updated_at TEXT
        )`,
    ] : [
        `CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            symbol TEXT,
            action TEXT,
            price REAL,
            confidence REAL,
            reasoning TEXT,
            risk_factors TEXT,
            raw_data TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            symbol TEXT,
            action TEXT,
            entry_price REAL,
            exit_price REAL,
            pl REAL,
            status TEXT,
            ticket TEXT,
            position_id TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            role TEXT DEFAULT 'user',
            subscription_status TEXT DEFAULT 'inactive',
            created_at TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS vibe_research (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            run_type TEXT,
            prompt TEXT,
            command TEXT,
            output TEXT,
            status TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS risk_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            settings TEXT,
            updated_at TEXT
        )`,
    ];
    for (const sql of createTables) {
        await dbRun(sql);
    }
    // Migration: broker ticket/position tracking (Phase 1 — cTrader).
    // SQLite lacks ADD COLUMN IF NOT EXISTS; inspect pragma instead.
    // (Postgres gets those columns in the CREATE above — fresh DB.)
    if (!USE_PG) {
        const tradeCols = await dbAll('PRAGMA table_info(trades)');
        const tradeColNames = tradeCols.map((c) => c.name);
        for (const [col, decl] of [['ticket', 'TEXT'], ['position_id', 'TEXT']]) {
            if (!tradeColNames.includes(col)) {
                await dbRun(`ALTER TABLE trades ADD COLUMN ${col} ${decl}`);
                console.log(`🗄️  Migration: added trades.${col}`);
            }
        }
    }
    const users = await dbAll('SELECT COUNT(*) AS count FROM users');
    if (Number(users[0].count) === 0) {
        const now = new Date().toISOString();
        // Phase 2 (T2): seeds now store bcrypt hashes (previously plaintext
        // 'dev-seed'); legacy plaintext rows are upgraded on login in auth.js.
        await dbRun(
            'INSERT INTO users (email, password, name, role, subscription_status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['devtest@fx.com', hashPassword('dev-seed'), 'System Admin', 'admin', 'active', now]
        );
        await dbRun(
            'INSERT INTO users (email, password, name, role, subscription_status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['user@fx.com', hashPassword('dev-seed'), 'Free User', 'user', 'inactive', now]
        );
    }
    console.log('🗄️  Database schema ready');
}

initDatabase().catch((err) => console.error('Database init failed:', err));

// --- Helper Functions ---
// Mark stored 'open' trades as closed when their position disappears from
// the broker's positions stream (Phase 1 — position lifecycle sync).
async function syncClosedTrades(openPositions) {
    try {
        const openRows = await dbAll("SELECT id, timestamp, symbol, action, entry_price, exit_price, pl, status, ticket, position_id FROM trades WHERE status = 'open'");
        if (!openRows.length) return;
        const openIds = new Set(openPositions.map((p) => String(p.position_id)));
        const openTickets = new Set(openPositions.map((p) => String(p.ticket)));
        for (const row of openRows) {
            const posId = row.position_id ? String(row.position_id) : '';
            const ticket = row.ticket ? String(row.ticket) : '';
            const stillOpen = (posId && openIds.has(posId)) || (ticket && openTickets.has(ticket));
            if (!stillOpen) {
                await dbRun("UPDATE trades SET status = 'closed' WHERE id = ?", [row.id]);
                console.log(`📉 Trade #${row.id} marked closed (position gone from broker)`);
                // Notify clients. Mirrors the fields the frontend already
                // knows from trade-executed (ticket / position_id). The real
                // exit price / P&L only comes from the broker's execution
                // events; this lifecycle sync detects closure without fill
                // data, so exit/pl are null — never a fabricated 0.
                io.emit('trade:closed', {
                    id: row.id,
                    ticket: row.ticket || null,
                    position_id: row.position_id || null,
                    positionId: row.position_id || null,
                    symbol: row.symbol,
                    action: row.action,
                    entry: row.entry_price,
                    exit: null,
                    pl: null,
                    status: 'closed',
                    openedAt: row.timestamp || null,
                    closedAt: new Date().toISOString(),
                });
            }
        }
    } catch (e) {
        console.error('syncClosedTrades error:', e);
    }
}

// Pull the broker's current open positions from the engine, so handlers can
// broadcast a fresh positions-update after close/amend actions.
async function getLivePositions() {
    try {
        const result = await sendCommand({ cmd: 'BROKER_POSITIONS' });
        if (result.status === 'ok' && Array.isArray(result.positions)) return result.positions;
        return [];
    } catch (e) {
        console.error('getLivePositions error:', e);
        return [];
    }
}

// Formatting helper for different asset types
function getDecimals(symbol) {
    if (['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY'].includes(symbol)) return 2;
    if (['XAUUSD', 'XPTUSD', 'XPDUSD', 'XTIUSD', 'XBRUSD'].includes(symbol)) return 2;
    if (['XAGUSD', 'XNGUSD', 'XCUUSD'].includes(symbol)) return 3;
    if (['US30', 'US500', 'NAS100', 'UK100', 'GER40', 'JPN225'].includes(symbol)) return 0;
    return 5;
}

function formatSymbolDisplay(symbol) {
    // Indices don't need splitting
    if (['US30', 'US500', 'NAS100', 'UK100', 'GER40', 'JPN225'].includes(symbol)) return symbol;
    if (symbol.length === 6) return symbol.slice(0, 3) + '/' + symbol.slice(3);
    return symbol;
}

// Real engine prices received via ticker events, keyed by raw symbol
// (e.g. 'EURUSD'). prevPrice is the previous tick, used to compute change %.
// mock: true marks ticks the engine itself flagged as simulated data.
const lastEngineTickers = {};

// Build the ticker-update payload (also served by GET /api/ticker). Prices
// come ONLY from engine ticks (cTrader spots); a symbol with no engine tick
// is omitted rather than estimated. source is 'engine' for real quotes, or
// 'mock' for a tick the engine itself flagged as simulated (dry-run only).
function generateTickerData() {
    const ts = Date.now();
    return Object.entries(lastEngineTickers).map(([symbol, live]) => {
        const newPrice = live.price;
        const prevPrice = live.prevPrice;
        const change = newPrice - prevPrice;
        const changePercent = prevPrice > 0 ? ((change / prevPrice) * 100).toFixed(2) : '0.00';
        const decimals = getDecimals(symbol);

        return {
            symbol: formatSymbolDisplay(symbol),
            price: newPrice.toFixed(decimals),
            change: `${parseFloat(changePercent) >= 0 ? '+' : ''}${changePercent}%`,
            positive: parseFloat(changePercent) >= 0,
            source: live.mock ? 'mock' : 'engine',
            ts,
        };
    });
}


// --- ZeroMQ Subscriber (Python Bridge) ---
// Ports overridable via env for constrained environments (defaults: 5555/5556)
const ZMQ_PUB_PORT = process.env.ZMQ_PORT || 5555;
const ZMQ_CMD_PORT = process.env.ZMQ_CMD_PORT || 5556;

async function startZMQ() {
    if (!zmq) {
        console.log("🔌 Skipping ZeroMQ subscriber (addon unavailable)");
        return;
    }
    const sock = new zmq.Subscriber();

    try {
        sock.connect(`tcp://127.0.0.1:${ZMQ_PUB_PORT}`);
        sock.subscribe("signal");
        sock.subscribe("ticker");
        sock.subscribe("vibe-research");
        sock.subscribe("positions");
        sock.subscribe("notification");
        console.log("🔌 Connected to Python Engine via ZeroMQ");

        for await (const parts of sock) {
            let topicStr = "";
            let msgStr = "";

            if (parts.length >= 2) {
                topicStr = parts[0].toString();
                msgStr = parts[1].toString();
            } else if (parts.length === 1) {
                const fullStr = parts[0].toString();
                const spaceIndex = fullStr.indexOf(' ');
                if (spaceIndex !== -1) {
                    topicStr = fullStr.substring(0, spaceIndex);
                    msgStr = fullStr.substring(spaceIndex + 1);
                } else {
                    topicStr = fullStr;
                }
            } else {
                continue;
            }

            try {
                const data = JSON.parse(msgStr);

                if (topicStr === 'signal') {
                    // Signal is already stored in DB by Python
                    // Only emit to premium subscribers
                    io.to('premium').emit('fx-signal', data);
                    console.log(`📊 [PY-SIGNAL] ${data.symbol} ${data.action} @ ${data.price} -> PREMIUM`);
                } else if (topicStr === 'ticker') {
                    const key = (data.symbol || '').replace('/', '');
                    const prev = lastEngineTickers[key] ? lastEngineTickers[key].price : data.price;
                    lastEngineTickers[key] = { price: data.price, prevPrice: prev, mock: !!data.mock };
                } else if (topicStr === 'notification') {
                    io.emit('notification', data);
                } else if (topicStr === 'vibe-research') {
                    io.emit('vibe-research-update', data);
                    console.log(`🔬 [PY-RESEARCH] New Vibe research update: ${data.run_type} -> ${data.status}`);
                } else if (topicStr === 'positions') {
                    io.emit('positions-update', data);
                    syncClosedTrades(data.positions || []);
                }
            } catch (e) {
                console.error("Error parsing ZMQ message:", e);
            }
        }
    } catch (err) {
        console.error("ZMQ Connection Error:", err);
    }
}

startZMQ();

// --- HTTP Event Consumer (fallback transport) ---
// When the ZeroMQ addon is unavailable, engine events arrive over the HTTP
// bridge's SSE stream (GET /events) instead of a ZMQ subscriber socket.
function handleEngineEvent({ topic, data }) {
    try {
        if (topic === 'ticker') {
            const key = (data.symbol || '').replace('/', '');
            const prev = lastEngineTickers[key] ? lastEngineTickers[key].price : data.price;
            lastEngineTickers[key] = { price: data.price, prevPrice: prev, mock: !!data.mock };
        } else if (topic === 'signal') {
            io.to('premium').emit('fx-signal', data);
            console.log(`📊 [HTTP-SIGNAL] ${data.symbol} ${data.action} @ ${data.price} -> PREMIUM`);
        } else if (topic === 'vibe-research') {
            io.emit('vibe-research-update', data);
            console.log(`🔬 [HTTP-RESEARCH] New Vibe research update: ${data.run_type} -> ${data.status}`);
        } else if (topic === 'positions') {
            io.emit('positions-update', data);
            syncClosedTrades(data.positions || []);
        } else if (topic === 'notification') {
            io.emit('notification', data);
        }
    } catch (e) {
        console.error('Error handling engine event:', e);
    }
}

async function startHttpEvents() {
    let buffer = '';
    let retryDelay = 3000;
    console.log(`🔌 Connecting to Python Engine via HTTP/SSE (${ENGINE_HTTP_URL}/events)`);
    while (true) {
        try {
            const resp = await fetch(`${ENGINE_HTTP_URL}/events`);
            if (!resp.ok || !resp.body) throw new Error(`SSE response ${resp.status}`);
            retryDelay = 3000;
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';
                for (const chunk of events) {
                    const line = chunk.split('\n').find(l => l.startsWith('data: '));
                    if (!line) continue;
                    try {
                        handleEngineEvent(JSON.parse(line.slice(6)));
                    } catch (e) {
                        console.error('Error parsing engine SSE event:', e);
                    }
                }
            }
        } catch (e) {
            console.error(`HTTP Event stream error: ${e.message || e}. Retrying in ${retryDelay}ms`);
        }
        await new Promise(r => setTimeout(r, retryDelay));
    }
}

if (!zmq) {
    startHttpEvents();
}

// --- Auth: Register (Phase 2, T1) ---
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Valid email required' });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const cleanName = (name || '').trim().slice(0, 80);

    try {
        const existing = await dbAll('SELECT id FROM users WHERE email = ?', [cleanEmail]);
        if (existing.length) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        const result = await dbRun(
            'INSERT INTO users (email, password, name, role, subscription_status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [cleanEmail, hashPassword(password), cleanName || null, 'user', 'inactive', new Date().toISOString()]
        );
        const user = { id: result.lastID, email: cleanEmail, name: cleanName || null, role: 'user', subscription_status: 'inactive' };
        const token = signToken({ sub: user.id, email: user.email });
        return res.json({ token, user });
    } catch (err) {
        console.error("Register DB Error:", err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// --- Auth: Login (Phase 2, T1) ---
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        const rows = await dbAll('SELECT id, email, password, name, role, subscription_status FROM users WHERE email = ?', [cleanEmail]);
        if (!rows.length) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const stored = rows[0];
        const match = comparePassword(password, stored.password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // T2: transparently upgrade legacy plaintext rows to bcrypt.
        if (match && match.upgraded) {
            await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashPassword(password), stored.id]);
        }
        const user = {
            id: stored.id,
            email: stored.email,
            name: stored.name,
            role: stored.role,
            subscription_status: stored.subscription_status,
        };
        const token = signToken({ sub: stored.id, email: stored.email });
        return res.json({ token, user });
    } catch (err) {
        console.error("Login DB Error:", err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// --- Auth: Me (Phase 2, T1) — fresh user from DB, never token claims (T6) ---
app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(
            'SELECT id, email, name, role, subscription_status, created_at FROM users WHERE id = ?',
            [req.user.sub]
        );
        if (!rows.length) return res.status(401).json({ error: 'Unknown user' });
        return res.json({ user: rows[0] });
    } catch (err) {
        console.error("Auth me Error:", err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// --- Admin: List Users ---
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const rows = await dbAll("SELECT id, email, name, role, subscription_status, created_at FROM users");
        return res.json(rows || []);
    } catch (err) {
        console.error("Admin Users DB Error:", err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// --- Admin: Upgrade User Subscription ---
app.post('/api/admin/upgrade', requireApiKey, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    try {
        await dbRun("UPDATE users SET subscription_status = 'active' WHERE email = ?", [email]);
        return res.json({ success: true, message: `Upgraded ${email}` });
    } catch (err) {
        console.error("Admin Upgrade DB Error:", err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// --- ZMQ Engine Communication ---
let zmqReq = zmq ? new zmq.Request() : null;
let zmqReqConnected = false;

// Serialize commands: ZMQ REQ sockets are strictly send/reply interleaved,
// so concurrent calls would throw "Socket is busy".
let commandQueue = Promise.resolve();

function sendCommand(payload, timeoutMs) {
    timeoutMs = timeoutMs || cmdTimeout(payload.cmd || '');
    if (!zmq) {
        return sendCommandHttp(payload, timeoutMs);
    }
    const run = commandQueue.then(() => sendCommandNow(payload, timeoutMs));
    // Keep the chain alive even when this command fails.
    commandQueue = run.catch(() => {});
    return run;
}

// HTTP transport (engine/http_bridge.py POST /cmd). Used automatically
// when the ZeroMQ addon is unavailable.
async function sendCommandHttp(payload, timeoutMs) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), (timeoutMs || 15000) + 5000);
        const resp = await fetch(`${ENGINE_HTTP_URL}/cmd`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, timeout: timeoutMs || 15000 }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        return await resp.json();
    } catch (e) {
        console.error('HTTP Engine Command Failed:', e.message || e);
        return { status: "error", message: "Engine Unreachable" };
    }
}

function recreateZmqReq() {
    try { zmqReq.close(); } catch (_) { /* already closed */ }
    zmqReq = new zmq.Request();
    zmqReqConnected = false;
}

async function sendCommandNow(payload, timeoutMs) {
    if (!zmqReqConnected) {
        console.log("Connecting to Engine Command Socket...");
        try {
            zmqReq.connect(`tcp://127.0.0.1:${ZMQ_CMD_PORT}`);
            zmqReqConnected = true;
        } catch (e) {
            console.error("ZMQ Connect Failed:", e);
            return { status: "error", message: "Engine Unreachable" };
        }
    }
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Engine timeout after ${timeoutMs}ms`)), timeoutMs)
    );
    try {
        await zmqReq.send(JSON.stringify(payload));
        const [result] = await Promise.race([zmqReq.receive(), timeout]);
        return JSON.parse(result.toString());
    } catch (e) {
        console.error("ZMQ Command Failed:", e.message || e);
        // A timed-out REQ socket is in an unusable state — recreate it so the
        // next command can succeed.
        recreateZmqReq();
        return { status: "error", message: "Engine Unreachable" };
    }
}

// --- WebSocket Connection Handling ---
io.on('connection', async (socket) => {
    // Phase 2 (T3): premium room is subscription-gated, decided per handshake
    // from the fresh DB row attached by the io.use auth middleware.
    const isPremium = socket.user?.subscription_status === 'active';
    if (isPremium) socket.join('premium');
    console.log(`[ROOM] ${socket.user?.email || 'anonymous'} connected premium=${isPremium}`);

    // Send initial data
    socket.emit('ticker-update', generateTickerData());

    // Fetch recent history from DB. Must NOT be awaited: this handler has to
    // register every socket listener synchronously, or an early client emit
    // can race ahead of its listener and get silently dropped.
    dbAll('SELECT * FROM signals ORDER BY timestamp DESC LIMIT 10')
        .then((rows) => {
            // Transform DB rows back to API format (merging raw_data if available)
            const history = rows.map(r => {
                try {
                    return { ...JSON.parse(r.raw_data), id: r.id };
                } catch (e) {
                    return r; // Fallback
                }
            });
            socket.emit('signal-history', history.reverse()); // Frontend expects oldest -> newest usually
        })
        .catch((e) => console.error("Error fetching history:", e));

    const tickerInterval = setInterval(() => {
        socket.emit('ticker-update', generateTickerData());
    }, 2000);

    // --- Risk Management Settings ---
    let riskSettings = {
        maxDailyDrawdown: 500, // USD
        maxOpenPositions: 3,
        maxRiskPerTrade: 2, // Percent
        tradingEnabled: true
    };

    // Load persisted risk settings (single-row table, id = 1)
    (async () => {
        try {
            const rows = await dbAll('SELECT settings FROM risk_settings WHERE id = 1');
            if (rows.length > 0 && rows[0].settings) {
                riskSettings = { ...riskSettings, ...JSON.parse(rows[0].settings) };
                console.log('🛡️ Risk Settings Loaded:', riskSettings);
            }
        } catch (e) {
            console.error('Error loading risk settings:', e);
        }
    })();

    // Calculate current stats from DB
    async function getDailyStats() {
        const today = new Date().toISOString().split('T')[0];
        try {
            // Need to store PL in trades table properly. 
            // The table schema has: pl REAL check database.py
            const trades = await dbAll("SELECT pl, status FROM trades WHERE timestamp LIKE ? || '%'", [today]);

            const profitLoss = trades.reduce((acc, t) => acc + (t.pl || 0), 0);
            const openPositions = trades.filter(t => t.status === 'open').length; // Check 'open' casing in DB logic

            return { profitLoss, openPositions };
        } catch (e) {
            console.error("Stats DB Error:", e);
            return { profitLoss: 0, openPositions: 0 };
        }
    }

    // Handle trade execution request
    socket.on('execute-trade', async (tradeData) => {
        console.log('📈 Trade execution requested:', tradeData);

        // 1. RISK SHIELD CHECK
        if (!riskSettings.tradingEnabled) {
            socket.emit('trade-rejected', { reason: 'Trading is globally disabled via Risk Shield.' });
            return;
        }

        const stats = await getDailyStats();

        // Check Max Open Positions (Simulated)
        // With DB, we could count real open positions. For now, trust stats.
        if (stats.openPositions >= riskSettings.maxOpenPositions) {
            socket.emit('trade-rejected', { reason: `Max open positions (${riskSettings.maxOpenPositions}) reached.` });
            return;
        }

        // Check Daily Drawdown
        if (stats.profitLoss <= -riskSettings.maxDailyDrawdown) {
            socket.emit('trade-rejected', { reason: `Daily drawdown limit ($${riskSettings.maxDailyDrawdown}) reached.` });
            return;
        }

        // Execute via Python Engine
        try {
            const cleanSymbol = tradeData.symbol.replace('/', '');
            console.log(`Sending execution to engine: ${cleanSymbol} ${tradeData.action}`);
            
            const result = await sendCommand({
                cmd: 'EXECUTE_TRADE',
                symbol: cleanSymbol,
                action: tradeData.action,
                volume: tradeData.volume || 0.01,
                // SL/TP are forwarded to the engine broker so the order is
                // placed with protective levels from the first fill.
                sl: tradeData.sl != null ? tradeData.sl : (tradeData.stopLoss != null ? tradeData.stopLoss : null),
                tp: tradeData.tp != null ? tradeData.tp : (tradeData.takeProfit != null ? tradeData.takeProfit : null),
            });

            if (result.status === 'filled') {
                const timestamp = new Date().toISOString();
                // Entry price comes from the engine's broker fill response,
                // never the client's requested price (stale by fill time).
                const entryPrice = result.price != null ? Number(result.price) : null;
                const executedTrade = {
                    symbol: tradeData.symbol,
                    action: tradeData.action,
                    volume: tradeData.volume || 0.01,
                    sl: tradeData.sl ?? null,
                    tp: tradeData.tp ?? null,
                    executedAt: timestamp,
                    status: 'open', // Real positions are open
                    entry_price: entryPrice,
                    executionPrice: entryPrice,
                    price: entryPrice, // legacy key, now carrying the real fill
                    pl: 0,
                    plType: 'neutral',
                    ticket: result.ticket,
                    position_id: result.position_id ?? null
                };

                // Store in DB (with broker ticket + position id for sync)
                await dbRun(`
                   INSERT INTO trades (timestamp, symbol, action, entry_price, pl, status, ticket, position_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    timestamp,
                    executedTrade.symbol,
                    executedTrade.action,
                    entryPrice,
                    0,
                    'open',
                    String(result.ticket ?? ''),
                    result.position_id != null ? String(result.position_id) : ''
                ]);

                socket.emit('trade-executed', executedTrade);
                console.log('✅ Real Trade executed & stored:', executedTrade);

                // Emit updated stats
                io.emit('risk-stats-update', await getDailyStats());

            } else {
                console.error("Execution Rejected by Engine:", result.message);
                socket.emit('trade-rejected', { reason: result.message || 'Engine rejected trade.' });
            }
        } catch (e) {
            console.error("Execution Communication Error:", e);
            socket.emit('trade-rejected', { reason: 'Error communicating with Python execution engine.' });
        }
    });

    // Close an open position via the engine broker (CLOSE_TRADE).
    socket.on('close-trade', async ({ positionId, symbol, volume } = {}) => {
        const payload = { cmd: 'CLOSE_TRADE' };
        if (positionId) payload.position_id = positionId;
        if (symbol) payload.symbol = symbol.replace('/', '');
        if (volume) payload.volume = volume;
        try {
            const result = await sendCommand(payload);
            if (result.status === 'closed') {
                socket.emit('trade:closed', {
                    position_id: result.position_id,
                    ticket: result.ticket,
                    price: result.price,
                });
                io.emit('notification', {
                    type: 'success',
                    title: 'Position Closed',
                    message: `Closed ${result.position_id ? '#' + result.position_id : 'position'}` +
                        (result.price ? ` @ ${result.price}` : ''),
                });
                io.emit('positions-update', { positions: await getLivePositions() });
            } else {
                socket.emit('trade-rejected', { reason: result.message || 'Close failed.' });
            }
        } catch (e) {
            console.error('close-trade error:', e);
            socket.emit('trade-rejected', { reason: 'Error communicating with execution engine.' });
        }
    });

    // Amend SL/TP of an open position via the engine broker (AMEND_TRADE).
    socket.on('amend-trade', async ({ positionId, symbol, sl, tp } = {}) => {
        const payload = { cmd: 'AMEND_TRADE' };
        if (positionId) payload.position_id = positionId;
        if (symbol) payload.symbol = symbol.replace('/', '');
        if (sl != null) payload.sl = sl;
        if (tp != null) payload.tp = tp;
        try {
            const result = await sendCommand(payload);
            if (result.status === 'amended') {
                io.emit('notification', {
                    type: 'success',
                    title: 'Order Amended',
                    message: 'Stop loss / take profit updated.',
                });
                io.emit('positions-update', { positions: await getLivePositions() });
            } else {
                socket.emit('trade-rejected', { reason: result.message || 'Amend failed.' });
            }
        } catch (e) {
            console.error('amend-trade error:', e);
            socket.emit('trade-rejected', { reason: 'Error communicating with execution engine.' });
        }
    });

    // Handle Risk Settings Updates from Frontend
    socket.on('update-risk-settings', async (newSettings) => {
        riskSettings = { ...riskSettings, ...newSettings };
        console.log('🛡️ Risk Settings Updated:', riskSettings);
        try {
            await dbRun(
                'INSERT INTO risk_settings (id, settings, updated_at) VALUES (1, ?, ?) ' +
                'ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at',
                [JSON.stringify(riskSettings), new Date().toISOString()]
            );
        } catch (e) {
            console.error('Error persisting risk settings:', e);
        }
        io.emit('risk-settings-updated', riskSettings);
    });

    socket.on('get-llm-models', async () => {
        const result = await sendCommand({ cmd: 'GET_MODELS' });
        if (result.status === 'ok') {
            socket.emit('llm-models-list', result.models_list || []);
        }
    });

    // Broker Account Status & Management
    socket.on('mt5-get-status', async () => {
        const result = await sendCommand({ cmd: 'BROKER_STATUS' });
        if (result.status === 'ok') {
            socket.emit('mt5-status', result.info);
            socket.emit('broker-status', result.info);   // Phase 1: provider-agnostic name
        } else {
            // Fail closed: never fabricate a zero balance/equity on errors.
            const degraded = {
                connected: false,
                account: null,
                server: null,
                balance: null,
                equity: null,
                message: result.message || 'Broker unreachable',
            };
            socket.emit('mt5-status', degraded);
            socket.emit('broker-status', degraded);
        }
    });

    // Phase 1: pull the current broker positions (cTrader/mock)
    socket.on('broker-positions', async () => {
        try {
            const result = await sendCommand({ cmd: 'BROKER_POSITIONS' });
            if (result.status === 'ok') {
                socket.emit('positions-update', { positions: result.positions || [] });
            }
        } catch (e) {
            console.error('broker-positions error:', e);
        }
    });

    socket.on('mt5-reconnect', async () => {
        // cTrader reconnects automatically via the engine's broker
        // supervisor — there is no manual reconnect command. Surface the
        // current status and explain, never a fake "reconnected" result.
        const result = await sendCommand({ cmd: 'BROKER_STATUS' });
        const info = result.status === 'ok'
            ? result.info
            : { connected: false, account: null, server: null, balance: null, equity: null };
        socket.emit('mt5-status', info);
        socket.emit('broker-status', info);
        socket.emit('notification', {
            type: result.status === 'ok' ? 'info' : 'error',
            title: 'Broker Connection',
            message: result.status === 'ok'
                ? 'cTrader reconnection is automatic — current status shown.'
                : (result.message || 'Broker unreachable; the engine reconnects automatically when possible.'),
        });
    });

    socket.on('switch-llm-model', async (modelName) => {
        console.log('Switching LLM to:', modelName);
        const result = await sendCommand({ cmd: 'SET_LLM_MODEL', model: modelName });

        // Notify all clients of the change
        if (result.status === 'ok') {
            io.emit('notification', { type: 'success', title: 'Model Switched', message: result.message });
            io.emit('model-changed', modelName);
        } else {
            socket.emit('notification', { type: 'error', title: 'Switch Failed', message: result.message });
        }
    });

    // Deep multi-agent analysis (Agent Arena) — forwards to the Python engine
    socket.on('agent:analyze', async (payload = {}) => {
        const query = payload.query || '';
        if (!query) {
            socket.emit('analysis:result', { status: 'error', message: 'No query provided' });
            return;
        }
        console.log(`🧠 Agent analysis requested: ${query.slice(0, 80)}`);
        const result = await sendCommand({
            cmd: 'ENGINE_AGENT_ANALYZE',
            query,
            active_agents: payload.active_agents || null,
            debate_rounds: payload.debate_rounds ?? null,
            risk_rounds: payload.risk_rounds ?? null,
        });
        socket.emit('analysis:result', result);
    });

    socket.on('disconnect', () => {
        clearInterval(tickerInterval);
        console.log('❌ Client disconnected:', socket.id);
    });
});

// --- REST API Endpoints ---
 app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        db: db ? 'connected' : 'disconnected'
    });
});

// Live engine status — surfaces engine /health plus broker state so the
// frontend status bar reflects real subsystem health instead of static text.
app.get('/api/engine/status', requireAuth, async (req, res) => {
    try {
        const [healthRes, brokerRes] = await Promise.allSettled([
            fetch(`${ENGINE_HTTP_URL}/health`),
            sendCommand({ cmd: 'BROKER_STATUS' }),
        ]);
        const health = healthRes.status === 'fulfilled' ? await healthRes.value.json().catch(() => ({})) : {};
        const broker = brokerRes.status === 'fulfilled' ? brokerRes.value : {};
        res.json({
            status: health.status || 'unreachable',
            uptime_seconds: health.uptime_seconds || null,
            subsystems: health.subsystems || null,
            broker: broker.status === 'ok' ? broker.info : null,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/vibe-research', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM vibe_research ORDER BY id DESC LIMIT 10');
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/signals', requireAuth, async (req, res) => {
    // Lightweight count mode: ?count=1 returns { count } — avoids shipping the
    // full 500KB+ signal bodies just to display "Signals Today".
    if (req.query.count !== undefined) {
        try {
            const rows = await dbAll('SELECT COUNT(*) AS cnt FROM signals');
            return res.json({ count: rows[0]?.cnt || 0 });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    const limit = parseInt(req.query.limit) || 20;
    try {
        const rows = await dbAll('SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?', [limit]);
        const signals = rows.map(r => {
            try {
                return { ...JSON.parse(r.raw_data), id: r.id };
            } catch (e) { return r; }
        });
        res.json(signals);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Phase 3 (T4): single signal from DB — raw_data carries the full payload
app.get('/api/signals/:id', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM signals WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Signal not found' });
        const r = rows[0];
        try {
            return res.json({ ...JSON.parse(r.raw_data), id: r.id });
        } catch (e) {
            return res.json(r);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/trades', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 50');
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/ticker', requireAuth, (req, res) => {
    res.json(generateTickerData());
});

app.get('/api/candles/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase().replace('/', '');
    const limit = Math.min(parseInt(req.query.limit) || 150, 500);
    try {
        const result = await sendCommand({ cmd: 'GET_CANDLES', symbol, limit });
        if (result.status === 'ok' && Array.isArray(result.candles)) {
            // Trust the engine's explicit source label. Only explicitly
            // cTrader-sourced bars are 'live'; anything else fails closed.
            const source = result.mock ? 'mock' : (result.source === 'ctrader' ? 'live' : null);
            if (!source) {
                return res.status(503).json({ error: `No live data available for ${symbol}` });
            }
            return res.json({ symbol, candles: result.candles, source });
        }
        return res.status(502).json({ error: result.message || 'Engine unavailable' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const totalTradesObj = await dbAll('SELECT COUNT(*) as count FROM trades');
        const totalTrades = Number(totalTradesObj[0].count);

        const winningTradesObj = await dbAll('SELECT COUNT(*) as count FROM trades WHERE pl > 0');
        const winningTrades = Number(winningTradesObj[0].count);

        const totalProfitObj = await dbAll('SELECT SUM(pl) as total FROM trades');
        const totalProfit = parseFloat(totalProfitObj[0].total) || 0;

        const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0;

        res.json({
            totalTrades,
            winningTrades,
            totalProfit: totalProfit.toFixed(2),
            winRate: parseFloat(winRate)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Autonomous-bot sessions ---
// The bot persists a win/loss summary per run to data/sessions.jsonl;
// expose it so the user can review autonomous runs from the UI.
const SESSIONS_FILE = path.resolve(__dirname, '../data/sessions.jsonl');
app.get('/api/sessions', requireAuth, (req, res) => {
    try {
        if (!fs.existsSync(SESSIONS_FILE)) {
            return res.json({ sessions: [], summary: null });
        }
        const sessions = fs.readFileSync(SESSIONS_FILE, 'utf8')
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => {
                try { return JSON.parse(l); } catch { return null; }
            })
            .filter(Boolean)
            .reverse();
        let summary = null;
        const done = sessions.filter((s) => s.trades > 0);
        if (done.length) {
            const total = done.reduce((a, s) => a + s.trades, 0);
            const wins = done.reduce((a, s) => a + s.wins, 0);
            const pl = done.reduce((a, s) => a + s.net_pl, 0);
            summary = {
                totalTrades: total,
                wins,
                losses: total - wins,
                winRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0,
                netPl: parseFloat(pl.toFixed(2)),
            };
        }
        res.json({ sessions, summary });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- PayFast ITN Webhook ---
// PayFast posts form-encoded ITN payloads here (public — no auth). After
// verifying the signature we upgrade the user server-to-server. This used to
// live in the Next.js app; with the static-export frontend the backend owns
// it (Express, same-origin, one URL).
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || 'your-secure-passphrase-here';

function generatePayFastSignature(data, passPhrase = null) {
    let payload = '';
    for (const key of Object.keys(data)) {
        if (key !== 'signature' && data[key] !== '') {
            payload += key + '=' + encodeURIComponent(data[key].trim()).replace(/%20/g, '+') + '&';
        }
    }
    let getString = payload.slice(0, -1);
    if (passPhrase !== null) {
        getString += `&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g, '+')}`;
    }
    return crypto.createHash('md5').update(getString).digest('hex');
}

app.post('/api/webhooks/payfast', express.urlencoded({ extended: false }), async (req, res) => {
    try {
        const data = req.body || {};
        const signature = generatePayFastSignature(data, PAYFAST_PASSPHRASE);
        if (data.signature !== signature) {
            console.error('PayFast signature mismatch.');
            return res.status(400).json({ error: 'Invalid Signature' });
        }

        if (data.payment_status === 'COMPLETE') {
            const userEmail = data.email_address;
            console.log(`[PAYFAST] Successful payment for ${userEmail}. Upgrading account...`);

            // Server-to-server call to upgrade the user (same container).
            const upgradeRes = await fetch(`http://127.0.0.1:${process.env.PORT || 4000}/api/admin/upgrade`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY
                },
                body: JSON.stringify({ email: userEmail })
            });

            if (!upgradeRes.ok) {
                throw new Error('Failed to upgrade user on backend');
            }
            return res.json({ success: true });
        }

        return res.json({ success: true, message: 'Ignored status' });
    } catch (error) {
        console.error('PayFast Webhook Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
});

// --- Static Frontend (single-origin on Render) ---
// Serve the Next.js static export built into frontend/out by the Docker
// image. The SPA fallback below only handles GETs outside /api and
// /socket.io so deep links (e.g. /dashboard) resolve to index.html while
// REST + WebSocket traffic keeps hitting the backend.
//
// Next's `output: 'export'` emits each page as a FLAT *.html file
// (dashboard.html, login.html, …) plus a sibling directory holding only
// RSC payload txt files (dashboard/, login/, … — no index.html inside).
// express.static's default directory-redirect would send /dashboard ->
// /dashboard/, find no dashboard/index.html, and fall through to the
// landing page. So: disable that redirect and resolve <path>.html before
// the index.html fallback.
const FRONTEND_OUT = path.resolve(__dirname, '../frontend/out');
if (fs.existsSync(FRONTEND_OUT)) {
    console.log('🌐 Serving static frontend from:', FRONTEND_OUT);
    app.use(express.static(FRONTEND_OUT, { redirect: false }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
        const clean = req.path.replace(/\/+$/, '') || '/';
        const htmlFile = path.join(FRONTEND_OUT, clean + '.html');
        const target = fs.existsSync(htmlFile)
            ? htmlFile
            : path.join(FRONTEND_OUT, 'index.html');
        res.sendFile(target);
    });
} else {
    console.warn('⚠️  frontend/out not found — serving API only (no UI). Build with: cd frontend && npm run build');
}

// --- Server Start ---
const PORT = process.env.PORT || 4000;
// Without this handler, EADDRINUSE (a stale backend already holding the
// port) surfaces as a bare Node crash dump. Catch it and exit cleanly
// with an actionable message instead.
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use — is another FX Analyzer backend running?`);
        console.error(`   Check with:  lsof -i :${PORT}   (or:  ps aux | grep node)\n`);
        process.exit(1);
    }
    throw err;
});
server.listen(PORT, () => {
    console.log(`\n🚀 FX Analyzer Bridge Server running on port ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`   REST API:  http://localhost:${PORT}/api/health\n`);
});

// --- Graceful Shutdown ---
// SIGTERM (systemd / start.sh) and SIGINT (Ctrl+C) drain open connections,
// close the HTTP server + Socket.IO and the SQLite DB, then exit 0. If
// anything refuses to drain within 5s, force an exit so the process never
// hangs around half-dead. The EADDRINUSE handler above stays untouched.
function shutdown(signal) {
    console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
    const forceTimer = setTimeout(() => {
        console.error('⚠️  Graceful shutdown timed out after 5s — forcing exit.');
        process.exit(1);
    }, 5000);
    forceTimer.unref();

    const finish = () => {
        clearTimeout(forceTimer);
        try {
            if (db) db.close();
        } catch (_) { /* connection already closed */ }
        console.log('👋 FX Analyzer backend shut down cleanly.');
        process.exit(0);
    };

    // Stop accepting new connections; disconnect Socket.IO clients so the
    // HTTP server's connection set drains and server.close() completes.
    try {
        server.close(finish);
    } catch (_) {
        finish();
    }
    try {
        io.close();
    } catch (_) { /* not listening yet */ }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
