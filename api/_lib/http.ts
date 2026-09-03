export interface ApiRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(payload: unknown): void;
  setHeader(name: string, value: string | string[]): void;
  end(): void;
}

export function setCors(req: ApiRequest, res: ApiResponse) {
  const configured = process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  const requestOrigin = req.headers.origin;
  const origin = Array.isArray(requestOrigin) ? requestOrigin[0] : requestOrigin;
  if (configured.length === 0 && process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && configured.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

export function clientIdentity(req: ApiRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || 'anonymous';
}

export function sendError(res: ApiResponse, error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : 500;
  const message = status === 500 ? 'internal server error' : error instanceof Error ? error.message : 'internal server error';
  res.status(status).json({ error: message });
}
