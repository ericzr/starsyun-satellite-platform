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

async function expectStatus(path, expected, init) {
  const response = await fetch(`${origin}${path}`, init);
  if (response.status !== expected) throw new Error(`${path} returned ${response.status}, expected ${expected}`);
  return response;
}

try {
  await waitForServer();
  const healthResponse = await expectStatus('/healthz', 200);
  if (!healthResponse.headers.get('x-request-id')) throw new Error('health response is missing x-request-id');
  if (!healthResponse.headers.get('content-security-policy-report-only')) throw new Error('security policy header is missing');
  const health = await healthResponse.json();
  if (health.status !== 'ok') throw new Error('health payload is invalid');
  const ready = await (await expectStatus('/readyz', 200)).json();
  if (ready.status !== 'ready' || !ready.services?.supabase || !ready.services?.adminAuth) {
    throw new Error('readiness payload is invalid');
  }
  const spa = await expectStatus('/explore', 200);
  if (!(await spa.text()).includes('<div id="root"></div>')) throw new Error('SPA fallback did not return the frontend shell');
  const sampleOrderId = '00000000-0000-4000-8000-000000000001';
  await expectStatus('/api/does-not-exist', 404);
  await expectStatus('/api/admin/areas?level=0', 502);
  await expectStatus('/api/catalog/sources', 502);
  await expectStatus('/api/catalog/products', 502);
  await expectStatus('/api/analysis/jobs', 401);
  await expectStatus('/api/downloads', 401);
  await expectStatus('/api/downloads', 401, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 'earth-search-example', productCode: 'EXAMPLE', productName: 'Example', sourceUrl: 'https://example.com' }),
  });
  await expectStatus('/api/wallet', 401);
  await expectStatus('/api/wallet/holds', 401, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'hold', amount: 1, currency: 'CNY', referenceType: 'order', referenceId: sampleOrderId, idempotencyKey: 'smoke-wallet-hold-1' }),
  });
  await expectStatus('/api/admin/provider-quotes', 401);
  await expectStatus('/api/admin/provider-orders', 401);
  await expectStatus('/api/admin/analysis-jobs', 401);
  await expectStatus('/api/admin/catalog-products', 401);
  await expectStatus('/api/admin/wallet-operation', 401, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  await expectStatus('/api/orders', 401);
  await expectStatus(`/api/orders/${sampleOrderId}/cancel`, 401, { method: 'POST' });
  await expectStatus(`/api/orders/${sampleOrderId}/delivery-assets`, 401, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objectKey: 'delivery/test.zip', fileName: 'test.zip' }),
  });
  await expectStatus(`/api/orders/${sampleOrderId}/delivery-status`, 401, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'delivered' }),
  });
  console.log('server smoke test passed');
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}
