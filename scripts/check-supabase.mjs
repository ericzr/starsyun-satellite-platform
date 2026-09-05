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
  { name: 'public_downloads', resource: 'public_downloads?select=*&limit=0' },
  { name: 'admin_areas', resource: 'admin_areas?select=*&limit=0' },
  { name: 'data_sources', resource: 'data_sources?select=*&limit=0' },
  { name: 'catalog source fields', resource: 'data_sources?select=id,kind,display_name,status,public_config&limit=0' },
  { name: 'platform_users', resource: 'platform_users?select=*&limit=0' },
  { name: 'user_roles', resource: 'user_roles?select=*&limit=0' },
  { name: 'supplier_profiles', resource: 'supplier_profiles?select=*&limit=0' },
  { name: 'provider_products', resource: 'provider_products?select=*&limit=0' },
  { name: 'provider_quotes', resource: 'provider_quotes?select=*&limit=0' },
  { name: 'provider_orders', resource: 'provider_orders?select=*&limit=0' },
  { name: 'order_items', resource: 'order_items?select=*&limit=0' },
  { name: 'order_events', resource: 'order_events?select=*&limit=0' },
  { name: 'analysis_jobs', resource: 'analysis_jobs?select=*&limit=0' },
  { name: 'wallet_accounts', resource: 'wallet_accounts?select=*&limit=0' },
  { name: 'wallet_transactions', resource: 'wallet_transactions?select=*&limit=0' },
  { name: 'payment_events', resource: 'payment_events?select=*&limit=0' },
  { name: 'wallet balance RPC', resource: 'rpc/wallet_available_balance', method: 'POST', body: { p_wallet_id: '00000000-0000-4000-8000-000000000000' }, expected: [200] },
  // These probes deliberately use nonexistent IDs, so a correctly installed
  // function returns its domain validation error without mutating production.
  // PostgREST exposes PostgreSQL's P0002 (no_data_found) as HTTP 500. Match
  // the error code as well as the status so a missing test row proves that
  // the protected function is installed without mutating production data.
  { name: 'wallet transaction RPC', resource: 'rpc/record_wallet_transaction', method: 'POST', body: { p_wallet_id: '00000000-0000-4000-8000-000000000000', p_direction: 'credit', p_amount: 1, p_currency: 'CNY', p_reference_type: 'payment', p_reference_id: 'schema-check', p_idempotency_key: 'schema-check-wallet-1', p_status: 'posted', p_provider: 'bank-transfer', p_provider_transaction_id: 'schema-check', p_metadata: {} }, expected: [400], expectedErrorCodes: ['P0002'] },
  { name: 'wallet order hold RPC', resource: 'rpc/hold_order_from_wallet', method: 'POST', body: { p_order_id: '00000000-0000-4000-8000-000000000000', p_user_id: '00000000-0000-4000-8000-000000000000', p_amount: 1, p_currency: 'CNY', p_idempotency_key: 'schema-check-hold-1', p_request_id: 'schema-check' }, expected: [400], expectedErrorCodes: ['P0002'] },
  { name: 'payment event RPC', resource: 'rpc/record_payment_event', method: 'POST', body: { p_order_id: '00000000-0000-4000-8000-000000000000', p_provider: 'stripe', p_provider_event_id: 'schema-check-event-1', p_event_type: 'schema.check', p_status: 'verified', p_amount: 1, p_currency: 'CNY', p_payload: {} }, expected: [400, 409] },
  { name: 'order transition RPC', resource: 'rpc/transition_order', method: 'POST', body: { p_order_id: '00000000-0000-4000-8000-000000000000', p_to_status: 'paid', p_actor_type: 'system', p_actor_id: 'schema-check', p_request_id: 'schema-check', p_payload: {} }, expected: [400], expectedErrorCodes: ['P0002'] },
];
const headers = {
  apikey: key,
  ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
  Accept: 'application/json',
};
const failures = [];

for (const check of checks) {
  try {
    const response = await fetch(`${url}/rest/v1/${check.resource}`, {
      method: check.method || 'GET',
      headers: { ...headers, ...(check.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(check.body ? { body: JSON.stringify(check.body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const expected = check.expected || [200];
    if (!expected.includes(response.status)) {
      let errorCode = '';
      if (check.expectedErrorCodes?.length) {
        try {
          const payload = await response.json();
          errorCode = typeof payload.code === 'string' ? payload.code : '';
        } catch {
          // Keep the normal status failure below when the body is not JSON.
        }
      }
      if (!check.expectedErrorCodes?.includes(errorCode)) {
        failures.push(`${check.name} (${response.status}, expected ${expected.join('/')})`);
      }
    }
  } catch {
    failures.push(`${check.name} (unreachable)`);
  }
}

if (failures.length) {
  console.error(`Supabase schema check failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`Supabase schema check passed (${checks.length} checks)`);
