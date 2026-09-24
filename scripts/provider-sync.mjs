#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.STARSYUN_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/u, '');
const providerId = process.env.PROVIDER_SYNC_PROVIDER || 'earth-search';
const mode = process.env.PROVIDER_SYNC_MODE || 'health';
const token = process.env.PROVIDER_SYNC_TOKEN;
if (!token) {
  console.error('PROVIDER_SYNC_TOKEN is required.');
  process.exit(2);
}
const payload = { providerId, mode };
if (process.env.PUBLIC_CATALOG_SYNC_BBOX) payload.bbox = process.env.PUBLIC_CATALOG_SYNC_BBOX.split(',').map(Number);
const response = await fetch(`${baseUrl}/api/admin/provider-sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-provider-sync-token': token, 'x-request-id': `provider-sync-${randomUUID()}` },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30_000),
});
const text = await response.text();
if (!response.ok) { console.error(`provider sync failed (${response.status}): ${text}`); process.exit(1); }
console.log(text);
