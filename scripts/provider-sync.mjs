#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.STARSYUN_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/u, '');
const providerId = process.env.PROVIDER_SYNC_PROVIDER || 'earth-search';
const providerIds = (process.env.PROVIDER_SYNC_PROVIDERS || providerId).split(',').map((value) => value.trim()).filter(Boolean);
const mode = process.env.PROVIDER_SYNC_MODE || 'health';
const token = process.env.PROVIDER_SYNC_TOKEN;
if (!token) {
  console.error('PROVIDER_SYNC_TOKEN is required.');
  process.exit(2);
}
const results = [];
for (const currentProviderId of providerIds) {
  const payload = { providerId: currentProviderId, mode };
  if (process.env.PUBLIC_CATALOG_SYNC_BBOX) payload.bbox = process.env.PUBLIC_CATALOG_SYNC_BBOX.split(',').map(Number);
  const response = await fetch(`${baseUrl}/api/admin/provider-sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-provider-sync-token': token, 'x-request-id': `provider-sync-${randomUUID()}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  results.push({ providerId: currentProviderId, ok: response.ok, status: response.status, text });
  if (!response.ok) console.error(`provider sync failed for ${currentProviderId} (${response.status}): ${text}`);
}
for (const result of results) console.log(result.text);
if (results.some((result) => !result.ok)) process.exit(1);
