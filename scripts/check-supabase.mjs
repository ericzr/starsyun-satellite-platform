const url = process.env.SUPABASE_URL?.replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Supabase check requires SUPABASE_URL and a server-only secret key');
  process.exit(1);
}

const checks = [
  { name: 'inquiries', resource: 'inquiries?select=*&limit=0' },
  { name: 'quotes', resource: 'quotes?select=*&limit=0' },
  // Migration 004 extends orders; it does not create a payment_intents table.
  { name: 'orders + payment columns', resource: 'orders?select=payment_provider,payment_intent_id,payment_client_secret,payment_created_at&limit=0' },
  { name: 'delivery_assets', resource: 'delivery_assets?select=*&limit=0' },
  { name: 'delivery_downloads', resource: 'delivery_downloads?select=*&limit=0' },
];
const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
const failures = [];

for (const check of checks) {
  try {
    const response = await fetch(`${url}/rest/v1/${check.resource}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) failures.push(`${check.name} (${response.status})`);
  } catch {
    failures.push(`${check.name} (unreachable)`);
  }
}

if (failures.length) {
  console.error(`Supabase schema check failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`Supabase schema check passed (${checks.length} checks)`);
