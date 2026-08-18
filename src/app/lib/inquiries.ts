// localStorage-backed inquiry store (mock "backend inbox").

export type InquiryType = 'history' | 'tasking' | 'analysis';
export type InquiryStatus = 'submitted' | 'pending' | 'quoting' | 'quoted' | 'confirmed';

export interface Inquiry {
  id: string;
  code: string;
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
  status: InquiryStatus;
  assignee: string;
  createdAt: string;
}

export type InquiryDraftInput = Omit<Inquiry, 'id' | 'code' | 'status' | 'assignee' | 'createdAt'>;
export type InquirySubmission = { inquiry: Inquiry; persisted: boolean };
export type AdminInquiryLoad = { inquiries: Inquiry[]; persisted: boolean };

const KEY = 'orbitdata-inquiries';

const ASSIGNEES = ['李航', '王遥', '陈星', 'Sarah Lin'];

export function loadInquiries(): Inquiry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedIfEmpty();
    const parsed = JSON.parse(raw) as Inquiry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seedIfEmpty();
    return parsed;
  } catch {
    return [];
  }
}

function save(list: Inquiry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function genCode(): string {
  const d = new Date();
  const y = d.getFullYear();
  const seq = Math.floor(1000 + Math.random() * 8999);
  return `INQ-${y}-${seq}`;
}

export function addInquiry(
  data: InquiryDraftInput,
): Inquiry {
  const list = loadInquiries();
  const inquiry: Inquiry = {
    ...data,
    id: crypto.randomUUID(),
    code: genCode(),
    status: 'submitted',
    assignee: ASSIGNEES[Math.floor(Math.random() * ASSIGNEES.length)],
    createdAt: new Date().toISOString(),
  };
  const next = [inquiry, ...list];
  save(next);
  return inquiry;
}

function cacheInquiry(inquiry: Inquiry) {
  const list = loadInquiries().filter((item) => item.id !== inquiry.id && item.code !== inquiry.code);
  save([inquiry, ...list]);
}

function inquiryApiUrl() {
  return import.meta.env.VITE_INQUIRY_API_URL || '/api/inquiries';
}

function inquiryItemApiUrl(id: string) {
  return `${inquiryApiUrl().replace(/\/$/, '')}/${encodeURIComponent(id)}`;
}

export async function submitInquiry(data: InquiryDraftInput): Promise<InquirySubmission> {
  try {
    const response = await fetch(inquiryApiUrl(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      const payload = (await response.json()) as { inquiry?: Inquiry };
      if (!payload.inquiry) throw new Error('inquiry API returned no record');
      cacheInquiry(payload.inquiry);
      return { inquiry: payload.inquiry, persisted: true };
    }

    if (response.status >= 400 && response.status < 500 && response.status !== 404 && response.status !== 429) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || 'inquiry was rejected');
    }
  } catch (error) {
    // Network failures may have browser-specific messages; validation/API errors must remain visible.
    if (!(error instanceof TypeError)) throw error;
  }

  return { inquiry: addInquiry(data), persisted: false };
}

export async function loadCustomerInquiries(email?: string, phone?: string): Promise<AdminInquiryLoad> {
  try {
    const response = await fetch(`${inquiryApiUrl().replace(/\/$/, '')}/mine`, { credentials: 'include' });
    if (response.ok) {
      const payload = (await response.json()) as { inquiries?: Inquiry[] };
      if (!Array.isArray(payload.inquiries)) throw new Error('inquiry API returned invalid data');
      return { inquiries: payload.inquiries, persisted: true };
    }
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  return {
    inquiries: loadInquiries().filter((inquiry) => inquiry.email === email || inquiry.phone === phone),
    persisted: false,
  };
}

export function updateStatus(id: string, status: InquiryStatus) {
  const list = loadInquiries();
  const next = list.map((i) => (i.id === id ? { ...i, status } : i));
  save(next);
  return next;
}

export async function loadAdminInquiries(): Promise<AdminInquiryLoad> {
  try {
    const response = await fetch(inquiryApiUrl(), { credentials: 'include' });
    if (response.ok) {
      const payload = (await response.json()) as { inquiries?: Inquiry[] };
      if (!Array.isArray(payload.inquiries)) throw new Error('inquiry API returned invalid data');
      save(payload.inquiries);
      return { inquiries: payload.inquiries, persisted: true };
    }
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  return { inquiries: loadInquiries(), persisted: false };
}

export async function saveInquiryStatus(id: string, status: InquiryStatus): Promise<InquirySubmission> {
  try {
    const response = await fetch(inquiryItemApiUrl(id), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { inquiry?: Inquiry };
      if (!payload.inquiry) throw new Error('inquiry API returned no record');
      cacheInquiry(payload.inquiry);
      return { inquiry: payload.inquiry, persisted: true };
    }
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  const inquiry = updateStatus(id, status).find((item) => item.id === id);
  if (!inquiry) throw new Error('inquiry not found');
  return { inquiry, persisted: false };
}

// Seed a couple of demo leads so the console isn't empty on first view.
function seedIfEmpty(): Inquiry[] {
  const now = Date.now();
  const seed: Inquiry[] = [
    {
      id: crypto.randomUUID(),
      code: 'INQ-2026-2048',
      type: 'history',
      name: '张伟',
      phone: '138****2048',
      email: 'zhang@energy-corp.cn',
      company: '华东能源集团',
      region: '鄂尔多斯 · 矿区',
      usage: '矿区越界开采监测',
      expectDate: '2026-08-01',
      expectRes: '≤ 1m',
      note: '需要近一年的历史影像用于堆料体积变化对比。',
      productName: '吉林一号 鄂尔多斯 · 矿区 影像',
      refPrice: 128000,
      areaKm2: 640,
      status: 'quoting',
      assignee: '李航',
      createdAt: new Date(now - 3 * 3600000).toISOString(),
    },
    {
      id: crypto.randomUUID(),
      code: 'INQ-2026-1975',
      type: 'analysis',
      name: 'Ahmed K.',
      phone: '+971 5x xxx',
      email: 'ahmed@ports-me.com',
      company: 'Gulf Ports Authority',
      region: 'Jebel Ali Port, Dubai',
      usage: 'Container yard change detection',
      expectDate: '2026-07-30',
      expectRes: '≤ 0.5m',
      note: 'Quarterly change detection over the container terminal.',
      productName: 'Pléiades Neo Jebel Ali Port Scene',
      refPrice: 86000,
      areaKm2: 45,
      status: 'submitted',
      assignee: 'Sarah Lin',
      createdAt: new Date(now - 26 * 3600000).toISOString(),
    },
  ];
  save(seed);
  return seed;
}
