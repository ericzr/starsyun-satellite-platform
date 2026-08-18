export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
export type QuoteCurrency = 'CNY' | 'USD' | 'EUR' | 'AED';

export interface Quote {
  id: string;
  quoteNo: string;
  inquiryId: string;
  version: number;
  currency: QuoteCurrency;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  deliveryDays: number;
  validUntil: string;
  notes: string;
  status: QuoteStatus;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
}

export interface QuoteDraft {
  inquiryId: string;
  currency: QuoteCurrency;
  subtotal: number;
  taxRate: number;
  deliveryDays: number;
  validUntil: string;
  notes: string;
}

const API = '/api/quotes';

async function apiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error || `Quote request failed (${response.status})`);
}

export async function loadAdminQuotes() {
  const response = await fetch(API, { credentials: 'include' });
  if (!response.ok) return [] as Quote[];
  const payload = (await response.json()) as { quotes?: Quote[] };
  return Array.isArray(payload.quotes) ? payload.quotes : [];
}

export async function createQuote(draft: QuoteDraft) {
  const response = await fetch(API, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!response.ok) throw await apiError(response);
  const payload = (await response.json()) as { quote?: Quote };
  if (!payload.quote) throw new Error('Quote API returned no record');
  return payload.quote;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const response = await fetch(`${API}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw await apiError(response);
  const payload = (await response.json()) as { quote?: Quote };
  if (!payload.quote) throw new Error('Quote API returned no record');
  return payload.quote;
}

export async function loadCustomerQuotes() {
  const response = await fetch('/api/quotes/mine', { credentials: 'include' });
  if (!response.ok) return [] as Quote[];
  const payload = (await response.json()) as { quotes?: Quote[] };
  return Array.isArray(payload.quotes) ? payload.quotes : [];
}

export async function acceptQuote(id: string) {
  const response = await fetch(`${API}/${encodeURIComponent(id)}/accept`, { method: 'POST', credentials: 'include' });
  if (!response.ok) throw await apiError(response);
  const payload = (await response.json()) as { quote?: Quote; order?: ServerOrder };
  if (!payload.quote) throw new Error('Quote API returned no record');
  return { quote: payload.quote, order: payload.order };
}
import type { ServerOrder } from './orders';
