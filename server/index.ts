import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import login from '../api/auth/login';
import logout from '../api/auth/logout';
import register from '../api/auth/register';
import session from '../api/auth/session';
import inquiryDetail from '../api/inquiries/[id]';
import inquiries from '../api/inquiries/index';
import myInquiries from '../api/inquiries/mine';
import orderDetail from '../api/orders/[id]';
import paymentIntent from '../api/orders/[id]/payment-intent';
import myOrders from '../api/orders/mine';
import quoteDetail from '../api/quotes/[id]';
import acceptQuote from '../api/quotes/[id]/accept';
import quotes from '../api/quotes/index';
import myQuotes from '../api/quotes/mine';
import stacItem from '../api/stac/item/[id]';
import stacSearch from '../api/stac/search';
import stripeWebhook from '../api/webhooks/stripe';
import type { ApiRequest, ApiResponse } from '../api/_lib/http';

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<unknown> | unknown;

interface ApiRoute {
  pattern: RegExp;
  handler: Handler;
  rawBody?: boolean;
  parameter?: string;
}

const routes: ApiRoute[] = [
  { pattern: /^\/api\/auth\/login\/?$/, handler: login },
  { pattern: /^\/api\/auth\/logout\/?$/, handler: logout },
  { pattern: /^\/api\/auth\/register\/?$/, handler: register },
  { pattern: /^\/api\/auth\/session\/?$/, handler: session },
  { pattern: /^\/api\/inquiries\/mine\/?$/, handler: myInquiries },
  { pattern: /^\/api\/inquiries\/([^/]+)\/?$/, handler: inquiryDetail, parameter: 'id' },
  { pattern: /^\/api\/inquiries\/?$/, handler: inquiries },
  { pattern: /^\/api\/quotes\/mine\/?$/, handler: myQuotes },
  { pattern: /^\/api\/quotes\/([^/]+)\/accept\/?$/, handler: acceptQuote, parameter: 'id' },
  { pattern: /^\/api\/quotes\/([^/]+)\/?$/, handler: quoteDetail, parameter: 'id' },
  { pattern: /^\/api\/quotes\/?$/, handler: quotes },
  { pattern: /^\/api\/orders\/mine\/?$/, handler: myOrders },
  { pattern: /^\/api\/orders\/([^/]+)\/payment-intent\/?$/, handler: paymentIntent, parameter: 'id' },
  { pattern: /^\/api\/orders\/([^/]+)\/?$/, handler: orderDetail, parameter: 'id' },
  { pattern: /^\/api\/stac\/item\/([^/]+)\/?$/, handler: stacItem, parameter: 'id' },
  { pattern: /^\/api\/stac\/search\/?$/, handler: stacSearch },
  { pattern: /^\/api\/webhooks\/stripe\/?$/, handler: stripeWebhook, rawBody: true },
];

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const staticDirectory = resolve(process.env.STATIC_DIR || resolve(currentDirectory, '../dist'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const bodyLimit = Number(process.env.REQUEST_BODY_LIMIT_BYTES || 1_048_576);

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function apiResponse(response: ServerResponse): ApiResponse {
  const adapter: ApiResponse = {
    status(code) {
      response.statusCode = code;
      return adapter;
    },
    json(payload) {
      if (response.writableEnded) return;
      if (!response.hasHeader('Content-Type')) response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(payload));
    },
    setHeader(name, value) {
      if (!response.writableEnded) response.setHeader(name, value);
    },
    end() {
      if (!response.writableEnded) response.end();
    },
  };
  return adapter;
}

function queryObject(url: URL) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const current = query[key];
    query[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return query;
}

async function requestBody(request: IncomingMessage, raw: boolean) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > bodyLimit) throw Object.assign(new Error('request body is too large'), { status: 413 });
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  const buffer = Buffer.concat(chunks);
  if (raw) return buffer;
  const contentType = request.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      throw Object.assign(new Error('invalid JSON request body'), { status: 400 });
    }
  }
  return buffer.toString('utf8');
}

function applySecurityHeaders(response: ServerResponse) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function dispatchApi(request: IncomingMessage, response: ServerResponse, url: URL) {
  for (const route of routes) {
    const match = route.pattern.exec(url.pathname);
    if (!match) continue;
    const query = queryObject(url);
    if (route.parameter && match[1]) query[route.parameter] = decodeURIComponent(match[1]);
    const apiRequest: ApiRequest = {
      method: request.method,
      headers: request.headers,
      query,
      body: await requestBody(request, Boolean(route.rawBody)),
    };
    await route.handler(apiRequest, apiResponse(response));
    if (!response.writableEnded) response.end();
    return true;
  }
  return false;
}

function safeStaticPath(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const resolvedPath = resolve(staticDirectory, `.${decoded}`);
  return resolvedPath === staticDirectory || resolvedPath.startsWith(`${staticDirectory}${sep}`) ? resolvedPath : null;
}

function serveFile(request: IncomingMessage, response: ServerResponse, filePath: string, immutable = false) {
  const extension = extname(filePath).toLowerCase();
  response.statusCode = 200;
  response.setHeader('Content-Type', contentTypes[extension] || 'application/octet-stream');
  response.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (request.method === 'HEAD') return response.end();
  createReadStream(filePath).on('error', () => sendJson(response, 500, { error: 'failed to read static asset' })).pipe(response);
}

function serveFrontend(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'method not allowed' });
  const requestedPath = safeStaticPath(url.pathname);
  if (requestedPath && existsSync(requestedPath) && statSync(requestedPath).isFile()) {
    return serveFile(request, response, requestedPath, url.pathname.startsWith('/assets/'));
  }
  const indexPath = resolve(staticDirectory, 'index.html');
  if (!existsSync(indexPath)) return sendJson(response, 503, { error: 'frontend build is unavailable' });
  return serveFile(request, response, indexPath);
}

const server = createServer(async (request, response) => {
  applySecurityHeaders(response);
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/healthz') return sendJson(response, 200, { status: 'ok' });
    if (url.pathname === '/readyz') {
      const services = {
        supabase: Boolean(
          process.env.SUPABASE_URL
          && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
          && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY),
        ),
        adminAuth: Boolean(process.env.ADMIN_EMAILS && process.env.ADMIN_PASSWORD_SHA256 && process.env.AUTH_SESSION_SECRET),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      };
      const ready = services.supabase && services.adminAuth;
      return sendJson(response, ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
        services,
      });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!(await dispatchApi(request, response, url))) sendJson(response, 404, { error: 'API route not found' });
      return;
    }
    serveFrontend(request, response, url);
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    const message = status < 500 && error instanceof Error ? error.message : 'internal server error';
    if (status >= 500) console.error(error);
    if (!response.writableEnded) sendJson(response, status, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`starsyun server listening on http://${host}:${port}`);
});

function shutdown(signal: string) {
  console.log(`received ${signal}, shutting down`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
