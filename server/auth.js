import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config, isSecure, withBase } from './config.js';
import {
  createSession,
  deleteSession,
  findSession,
  touchSession,
} from './db.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function safeEqual(a, b) {
  const aa = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(String(password), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
    let value = part.slice(index + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    out[key] = value;
  }
  return out;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || config.basePath || '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', [cookie]);
  else res.setHeader('Set-Cookie', Array.isArray(current) ? [...current, cookie] : [current, cookie]);
}

export function setSessionCookie(req, res, token) {
  appendCookie(
    res,
    serializeCookie(config.cookieName, token, {
      maxAge: Math.floor(config.sessionMs / 1000),
      httpOnly: true,
      secure: isSecure(req),
    }),
  );
}

export function clearSessionCookie(req, res) {
  appendCookie(
    res,
    serializeCookie(config.cookieName, '', {
      maxAge: 0,
      httpOnly: true,
      secure: isSecure(req),
    }),
  );
}

export function ensureCsrfToken(req, res) {
  const cookies = parseCookies(req);
  if (cookies[config.csrfCookie]) return cookies[config.csrfCookie];
  const token = randomToken(24);
  appendCookie(
    res,
    serializeCookie(config.csrfCookie, token, {
      maxAge: Math.floor(config.sessionMs / 1000),
      secure: isSecure(req),
    }),
  );
  return token;
}

export function csrfTokenFrom(req) {
  return parseCookies(req)[config.csrfCookie] || '';
}

export function checkCsrf(req, submitted) {
  const cookieToken = csrfTokenFrom(req);
  const token = submitted || req.headers['x-csrf-token'] || '';
  return Boolean(cookieToken && token && safeEqual(cookieToken, token));
}

export function getSession(req) {
  const token = parseCookies(req)[config.cookieName];
  if (!token) return null;
  const row = findSession(hashToken(token));
  if (!row) return null;
  touchSession(row.token_hash);
  return {
    user: {
      id: Number(row.id),
      username: row.username,
      displayName: row.display_name,
      isAdmin: Boolean(row.is_admin),
      forceTutorial: Boolean(row.force_tutorial),
    },
    tokenHash: row.token_hash,
  };
}

export function issueSession(req, res, userId) {
  const token = randomToken(32);
  createSession(
    hashToken(token),
    userId,
    Date.now() + config.sessionMs,
    clientIp(req),
    String(req.headers['user-agent'] || '').slice(0, 255),
  );
  setSessionCookie(req, res, token);
  return token;
}

export function destroySession(req, res) {
  const token = parseCookies(req)[config.cookieName];
  if (token) deleteSession(hashToken(token));
  clearSessionCookie(req, res);
}

export function clientIp(req) {
  if (config.trustProxy) {
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real) return real;
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return String(req.socket?.remoteAddress || 'unknown');
}

export function safeNext(value) {
  const fallback = withBase('/');
  if (!value) return fallback;
  let next = String(value);
  try {
    next = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (next.includes('\\') || next.startsWith('//')) return fallback;
  if (config.basePath) {
    if (next !== config.basePath && !next.startsWith(config.basePath + '/')) return fallback;
  } else if (!next.startsWith('/')) {
    return fallback;
  }
  return next;
}

const buckets = new Map();

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  current.count++;
  if (current.count > limit) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

export function resetRateLimit(key) {
  buckets.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
}, 5 * 60 * 1000).unref?.();

export function normalizeUsername(raw) {
  return String(raw || '').normalize('NFKC').trim();
}

export function validateUsername(username) {
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username)) {
    return 'El usuario debe tener entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.';
  }
  return '';
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'La contraseña no puede estar vacía.';
  }
  if (password.length > 128) return 'La contraseña es demasiado larga.';
  return '';
}

export function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error('payload too large');
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('aborted')));
  });
}

export function parseForm(body) {
  return new URLSearchParams(body);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
