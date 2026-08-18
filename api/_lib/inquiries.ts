import { GatewayError } from './stac';

export type InquiryType = 'history' | 'tasking' | 'analysis';
export type InquiryStatus = 'submitted' | 'pending' | 'quoting' | 'quoted' | 'confirmed';

export interface InquiryInput {
  type: InquiryType;
  name: string;
  phone: string;
  email: string;
  company: string;
  region: string;
  usage: string;
  expectDate: string;
  expectRes: string;
  note: string;
  productName?: string;
  refPrice: number;
  areaKm2: number;
}

export interface InquiryRecord extends InquiryInput {
  id: string;
  code: string;
  status: InquiryStatus;
  assignee: string;
  createdAt: string;
  userId?: string;
}

type InquiryRow = Record<string, unknown>;

const ASSIGNEES = ['李航', '王遥', '陈星', 'Sarah Lin'];
const MAX_TEXT = 2000;

function text(value: unknown, field: string, required = false) {
  if (typeof value !== 'string') {
    if (!required && (value == null || value === '')) return '';
    throw new GatewayError(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (required && !normalized) throw new GatewayError(400, `${field} is required`);
  if (normalized.length > MAX_TEXT) throw new GatewayError(400, `${field} is too long`);
  return normalized;
}

function numberValue(value: unknown, field: string) {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new GatewayError(400, `${field} must be a non-negative number`);
  return parsed;
}

export function parseInquiryInput(body: unknown): InquiryInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const type = input.type;
  if (type !== 'history' && type !== 'tasking' && type !== 'analysis') {
    throw new GatewayError(400, 'type is invalid');
  }
  return {
    type,
    name: text(input.name, 'name', true),
    phone: text(input.phone, 'phone', true),
    email: text(input.email, 'email'),
    company: text(input.company, 'company', true),
    region: text(input.region, 'region'),
    usage: text(input.usage, 'usage'),
    expectDate: text(input.expectDate, 'expectDate'),
    expectRes: text(input.expectRes, 'expectRes'),
    note: text(input.note, 'note'),
    productName: text(input.productName, 'productName') || undefined,
    refPrice: numberValue(input.refPrice, 'refPrice'),
    areaKm2: numberValue(input.areaKm2, 'areaKm2'),
  };
}

export function buildInquiry(input: InquiryInput): InquiryRecord {
  const year = new Date().getFullYear();
  const code = `INQ-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
  return {
    ...input,
    id: crypto.randomUUID(),
    code,
    status: 'submitted',
    assignee: ASSIGNEES[Math.floor(Math.random() * ASSIGNEES.length)],
    createdAt: new Date().toISOString(),
  };
}

function recordFromRow(row: InquiryRow): InquiryRecord {
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? ''),
    type: row.type as InquiryType,
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    company: String(row.company ?? ''),
    region: String(row.region ?? ''),
    usage: String(row.usage ?? ''),
    expectDate: String(row.expect_date ?? ''),
    expectRes: String(row.expect_res ?? ''),
    note: String(row.note ?? ''),
    productName: row.product_name == null ? undefined : String(row.product_name),
    refPrice: Number(row.ref_price ?? 0),
    areaKm2: Number(row.area_km2 ?? 0),
    status: row.status as InquiryStatus,
    assignee: String(row.assignee ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

export function persistenceConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new GatewayError(503, 'inquiry persistence is not configured');
  return { url, key };
}

export async function insertInquiry(record: InquiryRecord) {
  const { url, key } = persistenceConfig();
  const row = {
    id: record.id,
    code: record.code,
    type: record.type,
    name: record.name,
    phone: record.phone,
    email: record.email,
    company: record.company,
    region: record.region,
    usage: record.usage,
    expect_date: record.expectDate,
    expect_res: record.expectRes,
    note: record.note,
    product_name: record.productName ?? null,
    ref_price: record.refPrice,
    area_km2: record.areaKm2,
    status: record.status,
    assignee: record.assignee,
    created_at: record.createdAt,
    user_id: record.userId ?? null,
  };
  const response = await fetch(`${url}/rest/v1/inquiries`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    await response.text().catch(() => undefined);
    throw new GatewayError(502, `inquiry persistence failed (${response.status})`);
  }
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  const persisted = rows[0];
  if (!persisted) return record;
  return recordFromRow(persisted);
}

export async function listInquiries() {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/inquiries?select=*&order=created_at.desc&limit=500`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new GatewayError(502, `inquiry persistence failed (${response.status})`);
  const rows = (await response.json()) as InquiryRow[];
  return rows.map(recordFromRow);
}

export async function listUserInquiries(userId: string) {
  if (!/^[0-9a-f-]{20,80}$/i.test(userId)) throw new GatewayError(400, 'invalid customer id');
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/inquiries?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new GatewayError(502, `inquiry persistence failed (${response.status})`);
  const rows = (await response.json()) as InquiryRow[];
  return rows.map(recordFromRow);
}

export async function updateInquiryStatus(id: string, status: InquiryStatus) {
  if (!/^[0-9a-f-]{20,80}$/i.test(id)) throw new GatewayError(400, 'invalid inquiry id');
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/inquiries?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new GatewayError(502, `inquiry persistence failed (${response.status})`);
  const rows = (await response.json()) as InquiryRow[];
  if (!rows[0]) throw new GatewayError(404, 'inquiry not found');
  return recordFromRow(rows[0]);
}
