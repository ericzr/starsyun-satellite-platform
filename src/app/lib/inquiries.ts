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
  data: Omit<Inquiry, 'id' | 'code' | 'status' | 'assignee' | 'createdAt'>,
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

export function updateStatus(id: string, status: InquiryStatus) {
  const list = loadInquiries();
  const next = list.map((i) => (i.id === id ? { ...i, status } : i));
  save(next);
  return next;
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
