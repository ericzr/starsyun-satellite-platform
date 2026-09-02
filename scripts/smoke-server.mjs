import { spawn } from 'node:child_process';

const port = 30_000 + Math.floor(Math.random() * 10_000);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist-server/server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'smoke-test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'smoke-test-service-role-key',
    ADMIN_EMAILS: 'smoke@example.com',
    ADMIN_PASSWORD_SHA256: 'smoke-test-hash',
    AUTH_SESSION_SECRET: 'smoke-test-session-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited before becoming ready\n${output}`);
    try {
      const response = await fetch(`${origin}/healthz`);
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready\n${output}`);
}

async function expectStatus(path, expected) {
  const response = await fetch(`${origin}${path}`);
  if (response.status !== expected) throw new Error(`${path} returned ${response.status}, expected ${expected}`);
  return response;
}

try {
  await waitForServer();
  const health = await (await expectStatus('/healthz', 200)).json();
  if (health.status !== 'ok') throw new Error('health payload is invalid');
  const ready = await (await expectStatus('/readyz', 200)).json();
  if (ready.status !== 'ready' || !ready.services?.supabase || !ready.services?.adminAuth) {
    throw new Error('readiness payload is invalid');
  }
  const spa = await expectStatus('/explore', 200);
  if (!(await spa.text()).includes('<div id="root"></div>')) throw new Error('SPA fallback did not return the frontend shell');
  await expectStatus('/api/does-not-exist', 404);
  console.log('server smoke test passed');
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}
