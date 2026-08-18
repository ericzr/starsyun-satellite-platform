import { GatewayError } from './stac';
import type { ApiRequest, ApiResponse } from './http';

const ACCESS_COOKIE = 'starsyun_customer_access';
const REFRESH_COOKIE = 'starsyun_customer_refresh';
const COOKIE_TTL = 60 * 60 * 24 * 30;

export interface CustomerUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  company?: string;
  role: 'user';
}

interface SupabaseAuthResponse {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new GatewayError(503, 'customer authentication is not configured');
  return { url, key };
}

function requestHeaders(key: string, token?: string) {
  return {
    apikey: key,
    Authorization: token ? `Bearer ${token}` : `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function cookieHeader(req: ApiRequest) {
  const value = req.headers.cookie;
  return Array.isArray(value) ? value[0] : value ?? '';
}

function readCookies(req: ApiRequest) {
  return Object.fromEntries(cookieHeader(req).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    try {
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
    } catch {
      return ['', ''];
    }
  }).filter(([key]) => key));
}

function mapUser(user: SupabaseAuthResponse['user']): CustomerUser {
  if (!user?.id || !user.email) throw new GatewayError(502, 'customer authentication returned an invalid user');
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email,
    name: typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name : user.email.split('@')[0],
    phone: typeof metadata.phone === 'string' ? metadata.phone : undefined,
    company: typeof metadata.company === 'string' ? metadata.company : undefined,
    role: 'user',
  };
}

async function parseAuthResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as SupabaseAuthResponse & { error_description?: string; msg?: string };
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) throw new GatewayError(401, 'invalid customer credentials');
    if (response.status === 422) throw new GatewayError(409, 'customer account already exists');
    throw new GatewayError(502, 'customer authentication provider failed');
  }
  return payload;
}

export async function signInCustomer(email: string, password: string) {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: requestHeaders(key),
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const payload = await parseAuthResponse(response);
  if (!payload.access_token || !payload.refresh_token) throw new GatewayError(502, 'customer authentication returned no session');
  return { user: mapUser(payload.user), accessToken: payload.access_token, refreshToken: payload.refresh_token };
}

export async function signUpCustomer(data: { email: string; password: string; name: string; phone?: string; company?: string }) {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: requestHeaders(key),
    body: JSON.stringify({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      data: { name: data.name, phone: data.phone, company: data.company },
    }),
  });
  const payload = await parseAuthResponse(response);
  if (!payload.user) throw new GatewayError(502, 'customer registration returned no user');
  return {
    user: mapUser(payload.user),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

export async function requireCustomer(req: ApiRequest) {
  const { url, key } = config();
  const cookies = readCookies(req);
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!accessToken && !refreshToken) throw new GatewayError(401, 'customer session required');
  const response = accessToken
    ? await fetch(`${url}/auth/v1/user`, { headers: requestHeaders(key, accessToken) })
    : new Response(null, { status: 401 });
  if (response.status === 401 && refreshToken) {
    const refreshed = await refreshCustomer(url, key, refreshToken);
    return { user: refreshed.user, accessToken: refreshed.accessToken, refreshed };
  }
  if (response.status === 401) throw new GatewayError(401, 'customer session expired');
  const payload = (await response.json().catch(() => ({}))) as SupabaseAuthResponse['user'];
  if (!response.ok) throw new GatewayError(502, 'customer authentication provider failed');
  return { user: mapUser(payload), accessToken };
}

async function refreshCustomer(url: string, key: string, refreshToken: string) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: requestHeaders(key),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const payload = await parseAuthResponse(response);
  if (!payload.access_token || !payload.refresh_token) throw new GatewayError(401, 'customer session expired');
  return { user: mapUser(payload.user), accessToken: payload.access_token, refreshToken: payload.refresh_token };
}

function cookie(name: string, value: string, maxAge = COOKIE_TTL) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function setCustomerCookies(res: ApiResponse, accessToken?: string, refreshToken?: string) {
  if (!accessToken || !refreshToken) return;
  res.setHeader('Set-Cookie', [cookie(ACCESS_COOKIE, accessToken), cookie(REFRESH_COOKIE, refreshToken)]);
}

export function clearCustomerCookies(res: ApiResponse) {
  res.setHeader('Set-Cookie', clearCustomerCookieValues());
}

export function clearCustomerCookieValues() {
  return [cookie(ACCESS_COOKIE, '', 0), cookie(REFRESH_COOKIE, '', 0)];
}
