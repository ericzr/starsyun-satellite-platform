import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import { getCustomerOrder } from './orders';
import { supabaseApiHeaders } from './supabase';

export type WalletCurrency = 'CNY' | 'USD' | 'EUR' | 'AED';
export type WalletDirection = 'credit' | 'debit' | 'hold' | 'release' | 'refund';

export interface WalletAccount {
  id: string;
  userId: string;
  currency: WalletCurrency;
  status: 'active' | 'frozen' | 'closed';
  balance: number;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  direction: WalletDirection;
  amount: number;
  currency: WalletCurrency;
  status: 'pending' | 'posted' | 'voided';
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  provider?: string;
  providerTransactionId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  postedAt?: string;
}

type Row = Record<string, unknown>;

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(value)) throw new GatewayError(400, `${field} is invalid`);
  return value;
}

function currency(value: unknown): WalletCurrency {
  if (value !== 'CNY' && value !== 'USD' && value !== 'EUR' && value !== 'AED') throw new GatewayError(400, 'currency is invalid');
  return value;
}

function mapAccount(row: Row, balance = 0): WalletAccount {
  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    currency: currency(row.currency ?? 'CNY'),
    status: row.status as WalletAccount['status'],
    balance,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapTransaction(row: Row): WalletTransaction {
  return {
    id: String(row.id ?? ''),
    walletId: String(row.wallet_id ?? ''),
    direction: row.direction as WalletDirection,
    amount: Number(row.amount ?? 0),
    currency: currency(row.currency),
    status: row.status as WalletTransaction['status'],
    referenceType: String(row.reference_type ?? ''),
    referenceId: String(row.reference_id ?? ''),
    idempotencyKey: String(row.idempotency_key ?? ''),
    provider: row.provider == null ? undefined : String(row.provider),
    providerTransactionId: row.provider_transaction_id == null ? undefined : String(row.provider_transaction_id),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    createdAt: String(row.created_at ?? ''),
    postedAt: row.posted_at == null ? undefined : String(row.posted_at),
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...supabaseApiHeaders(key),
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    if (response.status === 409) throw new GatewayError(409, 'wallet account already exists');
    throw new GatewayError(502, `wallet persistence failed (${response.status})`);
  }
  return response;
}

async function rpc<T>(name: string, body: Record<string, unknown>) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...supabaseApiHeaders(key), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 400 && /insufficient|positive|invalid/iu.test(detail)) throw new GatewayError(409, 'wallet operation is not allowed');
    throw new GatewayError(502, `wallet operation failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function findAccount(userId: string, accountCurrency: WalletCurrency) {
  const response = await rest(`wallet_accounts?select=*&user_id=eq.${encodeURIComponent(userId)}&currency=eq.${accountCurrency}&limit=1`);
  const rows = (await response.json()) as Row[];
  return rows[0] ?? null;
}

export async function getOrCreateWallet(userId: string, accountCurrency: WalletCurrency = 'CNY') {
  uuid(userId, 'customer id');
  const existing = await findAccount(userId, accountCurrency);
  if (existing) return mapAccount(existing, Number(await rpc<number>('wallet_available_balance', { p_wallet_id: existing.id })) || 0);
  const record = { id: crypto.randomUUID(), user_id: userId, currency: accountCurrency, status: 'active', created_at: new Date().toISOString() };
  try {
    const response = await rest('wallet_accounts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
    const rows = (await response.json()) as Row[];
    if (!rows[0]) throw new GatewayError(502, 'wallet persistence returned no account');
    return mapAccount(rows[0], 0);
  } catch (error) {
    if (error instanceof GatewayError && error.status === 409) {
      const concurrent = await findAccount(userId, accountCurrency);
      if (concurrent) return mapAccount(concurrent, Number(await rpc<number>('wallet_available_balance', { p_wallet_id: concurrent.id })) || 0);
    }
    throw error;
  }
}

export async function listWalletTransactions(userId: string, accountCurrency: WalletCurrency = 'CNY') {
  const account = await getOrCreateWallet(userId, accountCurrency);
  const response = await rest(`wallet_transactions?select=*&wallet_id=eq.${encodeURIComponent(account.id)}&order=created_at.desc&limit=100`);
  return { account, transactions: ((await response.json()) as Row[]).map(mapTransaction) };
}

export interface WalletOperationInput {
  direction: WalletDirection;
  amount: number;
  currency: WalletCurrency;
  referenceType: 'order' | 'payment' | 'manual-adjustment' | 'refund';
  referenceId: string;
  idempotencyKey: string;
  provider?: string;
  providerTransactionId?: string;
  metadata?: Record<string, unknown>;
}

export function parseWalletOperation(body: unknown): WalletOperationInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const direction = input.direction;
  if (direction !== 'hold' && direction !== 'debit' && direction !== 'release' && direction !== 'refund' && direction !== 'credit') throw new GatewayError(400, 'direction is invalid');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new GatewayError(400, 'amount is invalid');
  const referenceType = input.referenceType;
  if (referenceType !== 'order' && referenceType !== 'payment' && referenceType !== 'manual-adjustment' && referenceType !== 'refund') throw new GatewayError(400, 'referenceType is invalid');
  const referenceId = input.referenceId;
  if (typeof referenceId !== 'string' || referenceId.length < 1 || referenceId.length > 160) throw new GatewayError(400, 'referenceId is invalid');
  const idempotencyKey = input.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) throw new GatewayError(400, 'idempotencyKey is invalid');
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata as Record<string, unknown> : {};
  if (JSON.stringify(metadata).length > 8000) throw new GatewayError(400, 'metadata is too large');
  return { direction, amount: Math.round(amount * 100) / 100, currency: currency(input.currency ?? 'CNY'), referenceType, referenceId, idempotencyKey, provider: typeof input.provider === 'string' ? input.provider.slice(0, 80) : undefined, providerTransactionId: typeof input.providerTransactionId === 'string' ? input.providerTransactionId.slice(0, 160) : undefined, metadata };
}

export async function recordWalletOperation(userId: string, input: WalletOperationInput) {
  const account = await getOrCreateWallet(userId, input.currency);
  if (account.status !== 'active') throw new GatewayError(409, 'wallet is not active');
  const rows = await rpc<Row[]>('record_wallet_transaction', {
    p_wallet_id: account.id,
    p_direction: input.direction,
    p_amount: input.amount,
    p_currency: input.currency,
    p_reference_type: input.referenceType,
    p_reference_id: input.referenceId,
    p_idempotency_key: input.idempotencyKey,
    p_status: 'posted',
    p_provider: input.provider ?? null,
    p_provider_transaction_id: input.providerTransactionId ?? null,
    p_metadata: input.metadata ?? {},
  });
  const transaction = Array.isArray(rows) ? rows[0] : rows;
  if (!transaction) throw new GatewayError(502, 'wallet operation returned no transaction');
  const balance = Number(await rpc<number>('wallet_available_balance', { p_wallet_id: account.id })) || 0;
  return { account: { ...account, balance }, transaction: mapTransaction(transaction) };
}

/**
 * Capture a tasking order from the customer's wallet in one database transaction.
 * The RPC locks both the order and wallet account, validates the exact total,
 * writes the ledger entry, advances the order, and appends the audit event.
 */
export async function holdOrderFromWallet(userId: string, input: WalletOperationInput, requestId?: string) {
  if (input.direction !== 'hold' || input.referenceType !== 'order') {
    throw new GatewayError(400, 'only order holds are supported here');
  }
  const account = await getOrCreateWallet(userId, input.currency);
  if (account.status !== 'active') throw new GatewayError(409, 'wallet is not active');

  const orderRows = await rpc<Row[]>('hold_order_from_wallet', {
    p_order_id: input.referenceId,
    p_user_id: userId,
    p_amount: input.amount,
    p_currency: input.currency,
    p_idempotency_key: input.idempotencyKey,
    p_request_id: requestId ?? null,
  });
  if (!orderRows[0]) throw new GatewayError(502, 'wallet hold returned no order');

  // The RPC returns the order for a stable API response. Read the idempotent
  // ledger row afterwards so callers can display the actual hold identifier.
  const transactionResponse = await rest(
    `wallet_transactions?select=*&wallet_id=eq.${encodeURIComponent(account.id)}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&limit=1`,
  );
  const transactionRows = (await transactionResponse.json()) as Row[];
  if (!transactionRows[0]) throw new GatewayError(502, 'wallet hold transaction was not persisted');
  const balance = Number(await rpc<number>('wallet_available_balance', { p_wallet_id: account.id })) || 0;
  const order = await getCustomerOrder(input.referenceId, userId);
  if (!order) throw new GatewayError(404, 'order not found');
  return {
    account: { ...account, balance },
    transaction: mapTransaction(transactionRows[0]),
    order,
    persisted: true,
  };
}
