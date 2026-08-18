import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { GatewayError } from './stac';
import type { ApiRequest, ApiResponse } from './http';

const COOKIE_NAME = 'starsyun_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function configuredAdmins() {
  return process.env.ADMIN_EMAILS?.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean) ?? [];
}

export function isConfiguredAdminEmail(email: string) {
  return configuredAdmins().includes(email.trim().toLowerCase());
}

function authConfig() {
  const admins = configuredAdmins();
  const passwordHash = process.env.ADMIN_PASSWORD_SHA256?.trim().toLowerCase();
  const secret = process.env.AUTH_SESSION_SECRET;
  if (admins.length === 0 || !passwordHash || !secret) {
    throw new GatewayError(503, 'admin authentication is not configured');
  }
  return { admins, passwordHash, secret };
}

function header(req: ApiRequest, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function base64url(value: string) {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function passwordDigest(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookies(req: ApiRequest) {
  const raw = header(req, 'cookie') ?? '';
  return Object.fromEntries(raw.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    try {
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
    } catch {
      return ['', ''];
    }
  }).filter(([key]) => key));
}

export function verifyAdminCredentials(email: string, password: string) {
  const config = authConfig();
  const normalizedEmail = email.trim().toLowerCase();
  if (!config.admins.includes(normalizedEmail)) throw new GatewayError(401, 'invalid admin credentials');
  if (!safeEqual(passwordDigest(password), config.passwordHash)) throw new GatewayError(401, 'invalid admin credentials');
  return { email: normalizedEmail, role: 'admin' as const };
}

export function issueAdminCookie(email: string) {
  const { secret } = authConfig();
  const payload = base64url(JSON.stringify({ email, role: 'admin', exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }));
  const token = `${payload}.${sign(payload, secret)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearAdminCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function requireAdmin(req: ApiRequest) {
  const { secret, admins } = authConfig();
  const token = cookies(req)[COOKIE_NAME];
  if (!token) throw new GatewayError(401, 'admin session required');
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) {
    throw new GatewayError(401, 'invalid admin session');
  }
  let data: { email?: string; role?: string; exp?: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: string; role?: string; exp?: number };
  } catch {
    throw new GatewayError(401, 'invalid admin session');
  }
  if (data.role !== 'admin' || !data.email || !admins.includes(data.email.toLowerCase()) || !data.exp || data.exp < Math.floor(Date.now() / 1000)) {
    throw new GatewayError(401, 'admin session expired');
  }
  return { email: data.email, role: 'admin' as const };
}

export function setAuthCookie(res: ApiResponse, cookie: string | string[]) {
  res.setHeader('Set-Cookie', cookie);
}
