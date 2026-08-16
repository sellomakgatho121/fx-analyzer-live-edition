const { spawn } = require('child_process');

const PORT = 4199;
const server = spawn('node', ['server.js'], {
    cwd: require('path').resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), ZMQ_PORT: '5599', ZMQ_CMD_PORT: '5560' },
    stdio: ['ignore', 'pipe', 'pipe'],
});

let log = '';
server.stdout.on('data', (d) => (log += d.toString()));
server.stderr.on('data', (d) => (log += d.toString()));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // health endpoint must NOT be rate limited (probes stay open)
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.status === 200) break;
    } catch (e) { /* server still booting */ }
    await wait(400);
  }

  const health = await fetch(`http://127.0.0.1:${PORT}/api/health`);
  console.log('health (x1 after warmup) status:', health.status, '(expected 200)');

  // Auth limiter: 20 failed logins allowed, 21st+ = 429
  const statuses = [];
  for (let i = 0; i < 26; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `nope${i}@x.com`, password: 'wrongpass' }),
    });
    statuses.push(r.status);
    if (r.status === 429) {
      const body = await r.json();
      console.log(`first 429 at attempt #${i + 1}:`, body.error);
      break;
    }
  }
  console.log('auth limiter statuses (max 26):', statuses.join(','));
  const ok = health.status === 200 && statuses.includes(429);
  console.log(ok ? 'RATE-LIMIT VERIFY: PASS' : 'RATE-LIMIT VERIFY: FAIL');
  server.kill();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); server.kill(); process.exit(1); });