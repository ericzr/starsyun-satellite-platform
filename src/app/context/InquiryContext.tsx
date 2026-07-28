import { createContext, useContext, useState, ReactNode } from 'react';
import type { InquiryType } from '../lib/inquiries';

// Context carried across pages into the inquiry form.
export interface InquiryDraft {
  type: InquiryType;
  productId?: string;
  productName?: string;
  region?: string;
  areaKm2?: number;
  refPrice?: number;
  expectRes?: string;
}

interface InquiryCtx {
  draft: InquiryDraft;
  setDraft: (d: InquiryDraft) => void;
}

const Ctx = createContext<InquiryCtx | null>(null);

export function InquiryProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<InquiryDraft>({ type: 'history' });
  return <Ctx.Provider value={{ draft, setDraft }}>{children}</Ctx.Provider>;
}

export function useInquiryDraft() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useInquiryDraft must be used within InquiryProvider');
  return ctx;
}
