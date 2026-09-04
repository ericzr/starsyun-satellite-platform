const url = process.env.SUPABASE_URL?.replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Supabase check requires SUPABASE_URL and a server-only secret key');
  process.exit(1);
}

const tables = [
  'inquiries',
  'quotes',
  'orders',
  'payment_intents',
  'delivery_assets',
  'delivery_downloads',
];
const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
const failures = [];

for (const table of tables) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers });
  if (!response.ok) failures.push(`${table} (${response.status})`);
}

if (failures.length) {
  console.error(`Supabase schema check failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`Supabase schema check passed (${tables.length} tables)`);
