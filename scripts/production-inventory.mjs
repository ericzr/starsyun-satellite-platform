#!/usr/bin/env node

// A metadata-only read of launch-critical production tables. It deliberately
// returns counts, not customer, payment, object-key or provider payload data.
const url = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required');
  process.exit(2);
}
const headers = { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }), Prefer: 'count=exact' };
const tables = [
  'provider_products', 'provider_quotes', 'provider_orders', 'orders',
  'order_items', 'delivery_assets', 'delivery_downloads', 'public_downloads',
  'analysis_jobs', 'wallet_accounts', 'wallet_transactions', 'payment_events',
];
async function count(table) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const match = (response.headers.get('content-range') || '').match(/\/(\d+)$/u);
  if (!match) throw new Error(`${table}: exact count unavailable`);
  return Number(match[1]);
}
const results = await Promise.allSettled(tables.map(async (table) => [table, await count(table)]));
let failed = false;
for (const [index, result] of results.entries()) {
  const table = tables[index];
  if (result.status === 'fulfilled') console.log(`${table}: ${result.value[1]}`);
  else if (/HTTP (401|403)/u.test(result.reason.message)) {
    // Commercial order rows are intentionally not countable through the
    // public REST role; do not weaken RLS merely for an operations report.
    console.log(`${table}: protected (row count not exposed by REST)`);
  } else {
    failed = true;
    console.error(`${table}: unavailable (${result.reason.message})`);
  }
}
if (failed) process.exitCode = 1;
