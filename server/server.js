// Car Town Remake server: static game, account auth, per-user saves and
// online drag races over WebSocket.
//
//   npm run build && npm start      -> http://localhost:3000/cartown/

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { config, withBase } from './config.js';
import {
  clearUserForceTutorial,
  closeDb,
  countUsers,
  createUser,
  dbPing,
  getBot,
  getSave,
  getUserByUsername,
  initDb,
  listAudit,
  listBots,
  listCustomCars,
  listUsers,
  putSave,
  startSnapshots,
  touchLogin,
} from './db.js';
import {
  checkCsrf,
  clientIp,
  destroySession,
  ensureCsrfToken,
  getSession,
  hashPassword,
  issueSession,
  normalizeUsername,
  parseCookies,
  parseForm,
  rateLimit,
  readBody,
  resetRateLimit,
  safeNext,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './auth.js';
import { adminPage, loginPage, registerPage, simplePage } from './pages.js';
import { applyAdminAction, sanitizeBotGarage } from './adminOps.js';
import { handleSocialApi } from './social.js';
import { sanitizeState } from './state.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function send(res, status, body, headers = {}) {
  setSecurityHeaders(res);
  res.writeHead(status, headers);
  res.end(body);
}

function sendHtml(res, status, html, headers = {}) {
  send(res, status, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

function sendJson(res, status, value, headers = {}) {
  send(res, status, JSON.stringify(value), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

function redirect(res, location, status = 302, headers = {}) {
  send(res, status, '', { Location: location, 'Cache-Control': 'no-store', ...headers });
}

function gameFile(rel) {
  const clean = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = path.join(config.dist, clean);
  const root = config.dist.endsWith(path.sep) ? config.dist : config.dist + path.sep;
  return file === config.dist || file.startsWith(root) ? file : null;
}

function serveFile(req, res, file, { cache = 'no-store' } = {}) {
  if (!file || !fs.existsSync(file)) return false;
  try {
    if (fs.statSync(file).isDirectory()) return false;
    setSecurityHeaders(res);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function loginError(req, res, message, status = 400, next = '', notice = '') {
  const csrf = ensureCsrfToken(req, res);
  sendHtml(
    res,
    status,
    loginPage({
      csrf,
      next,
      error: message,
      notice,
      registrationOpen: config.registration !== 'closed',
      lang: readLang(req),
    }),
  );
}

function registrationError(req, res, message, status = 400, next = '') {
  const csrf = ensureCsrfToken(req, res);
  sendHtml(
    res,
    status,
    registerPage({ csrf, next, error: message, inviteRequired: Boolean(config.inviteCode), lang: readLang(req) }),
  );
}

async function handleLogin(req, res) {
  let form;
  try {
    form = parseForm(await readBody(req, 16 * 1024));
  } catch (error) {
    loginError(req, res, error.code === 'PAYLOAD_TOO_LARGE' ? 'Solicitud demasiado grande.' : 'Solicitud inválida.', 400);
    return;
  }
  const next = safeNext(form.get('next'));
  if (!checkCsrf(req, form.get('_csrf'))) {
    loginError(req, res, 'La sesión del formulario ha caducado. Inténtalo de nuevo.', 403, next);
    return;
  }

  const username = normalizeUsername(form.get('username'));
  const password = String(form.get('password') || '');
  const key = `login:${clientIp(req)}:${username.toLowerCase()}`;
  const limit = rateLimit(key, 5, 5 * 60 * 1000);
  if (!limit.ok) {
    loginError(req, res, `Demasiados intentos. Espera ${limit.retryAfter} segundos.`, 429, next);
    return;
  }

  const user = getUserByUsername(username);
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!ok) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    loginError(req, res, 'Usuario o contraseña incorrectos.', 401, next);
    return;
  }
  if (user.banned_at) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    loginError(req, res, 'Esta cuenta está suspendida. Contacta con el administrador.', 403, next);
    return;
  }

  resetRateLimit(key);
  touchLogin(user.id);
  issueSession(req, res, user.id);
  redirect(res, next);
}

async function handleRegister(req, res) {
  if (config.registration === 'closed') {
    sendHtml(res, 403, simplePage('Registro cerrado', 'Las cuentas nuevas están desactivadas.', readLang(req)));
    return;
  }

  let form;
  try {
    form = parseForm(await readBody(req, 16 * 1024));
  } catch (error) {
    registrationError(req, res, error.code === 'PAYLOAD_TOO_LARGE' ? 'Solicitud demasiado grande.' : 'Solicitud inválida.', 400);
    return;
  }
  const next = safeNext(form.get('next'));
  if (!checkCsrf(req, form.get('_csrf'))) {
    registrationError(req, res, 'La sesión del formulario ha caducado. Inténtalo de nuevo.', 403, next);
    return;
  }

  const limit = rateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    registrationError(req, res, `Demasiados registros. Espera ${limit.retryAfter} segundos.`, 429, next);
    return;
  }
  if (config.inviteCode && !safeEqualText(form.get('invite_code'), config.inviteCode)) {
    registrationError(req, res, 'Código de invitación incorrecto.', 403, next);
    return;
  }

  const username = normalizeUsername(form.get('username'));
  const displayName = String(form.get('display_name') || '').normalize('NFKC').trim().slice(0, 20) || username;
  const password = String(form.get('password') || '');
  const confirmation = String(form.get('password_confirm') || '');
  const userError = validateUsername(username);
  if (userError) {
    registrationError(req, res, userError, 400, next);
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    registrationError(req, res, passwordError, 400, next);
    return;
  }
  if (password !== confirmation) {
    registrationError(req, res, 'Las contraseñas no coinciden.', 400, next);
    return;
  }
  if (getUserByUsername(username)) {
    registrationError(req, res, 'Ese usuario ya existe.', 409, next);
    return;
  }

  try {
    const hash = await hashPassword(password);
    const user = createUser(username, displayName, hash);
    issueSession(req, res, user.id);
    redirect(res, next);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      registrationError(req, res, 'Ese usuario ya existe.', 409, next);
      return;
    }
    console.error('[auth] registration failed', error);
    registrationError(req, res, 'No se pudo crear la cuenta. Inténtalo de nuevo.', 500, next);
  }
}

const PAGE_LANG_COOKIE = 'cartown_lang';
const ADMIN_LANG_FLAG_COOKIE = 'cartown_admin_lang_set';
const PAGE_LANGS = new Set(['es', 'en', 'pt']);

function readLang(req, url = null) {
  let query = '';
  try {
    query = url ? url.searchParams.get('lang') : new URL(req.url, 'http://localhost').searchParams.get('lang');
  } catch {
    query = '';
  }
  if (PAGE_LANGS.has(query)) return query;
  const cookie = parseCookies(req)[PAGE_LANG_COOKIE];
  return PAGE_LANGS.has(cookie) ? cookie : 'es';
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', [cookie]);
  else res.setHeader('Set-Cookie', Array.isArray(current) ? [...current, cookie] : [current, cookie]);
}

function requestLang(req, url, res) {
  const lang = readLang(req, url);
  const queryLang = url?.searchParams.get('lang');
  if (PAGE_LANGS.has(queryLang)) {
    appendCookie(
      res,
      `${PAGE_LANG_COOKIE}=${encodeURIComponent(lang)}; Path=${config.basePath || '/'}; Max-Age=31536000; SameSite=Lax`,
    );
  }
  return lang;
}

function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function handleLogout(req, res) {
  let form;
  try {
    form = parseForm(await readBody(req, 16 * 1024));
  } catch {
    form = new URLSearchParams();
  }
  if (!checkCsrf(req, form.get('_csrf'))) {
    sendJson(res, 403, { ok: false, error: 'csrf' });
    return;
  }
  destroySession(req, res);
  redirect(res, withBase('/login'));
}

function requireApiSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'auth_required' });
    return null;
  }
  return session;
}

function requireAdminSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'auth_required' });
    return null;
  }
  if (!session.user.isAdmin) {
    sendJson(res, 403, { ok: false, error: 'forbidden' });
    return null;
  }
  return session;
}

async function handleApi(req, res, rel) {
  const session = requireApiSession(req, res);
  if (!session) return;

  if (req.method === 'GET' && rel === '/api/session') {
    const csrf = ensureCsrfToken(req, res);
    sendJson(res, 200, {
      ok: true,
      user: session.user,
      csrf,
      forceTutorial: Boolean(session.user.forceTutorial),
      serverNow: Date.now(),
    });
    return;
  }

  if (req.method === 'GET' && rel === '/api/catalog') {
    sendJson(res, 200, {
      ok: true,
      cars: listCustomCars({ includeDisabled: true }),
      bots: listBots({ includeInactive: false }),
    });
    return;
  }

  if (req.method === 'GET' && rel === '/api/state') {
    const save = getSave(session.user.id);
    sendJson(res, 200, {
      ok: true,
      state: save?.state ?? null,
      revision: save?.revision ?? 0,
      updatedAt: save?.updatedAt ?? null,
      serverNow: Date.now(),
    });
    return;
  }

  if (req.method === 'PUT' && rel === '/api/state') {
    let body;
    try {
      body = await readBody(req, config.maxStateBytes);
    } catch (error) {
      sendJson(res, error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
        ok: false,
        error: error.code === 'PAYLOAD_TOO_LARGE' ? 'state_too_large' : 'bad_request',
      });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    if (!payload || typeof payload !== 'object') {
      sendJson(res, 400, { ok: false, error: 'invalid_state' });
      return;
    }
    let state;
    try {
      state = sanitizeState(payload.state);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: 'invalid_state' });
      return;
    }
    const expectedRevision = payload.revision === undefined ? null : Number(payload.revision);
    try {
      const saved = putSave(session.user.id, state, Number.isFinite(expectedRevision) ? expectedRevision : null);
      sendJson(res, 200, {
        ok: true,
        revision: saved?.revision ?? 0,
        updatedAt: saved?.updatedAt ?? Date.now(),
      });
    } catch (error) {
      if (error.code === 'STATE_CONFLICT') {
        sendJson(res, 409, {
          ok: false,
          error: 'save_conflict',
          revision: error.revision ?? 0,
        });
        return;
      }
      sendJson(res, error.code === 'STATE_TOO_LARGE' ? 413 : 500, {
        ok: false,
        error: error.code || 'save_failed',
      });
    }
    return;
  }

  if (req.method === 'POST' && rel === '/api/tutorial/ack') {
    if (!checkCsrf(req, req.headers['x-csrf-token'])) {
      sendJson(res, 403, { ok: false, error: 'csrf' });
      return;
    }
    clearUserForceTutorial(session.user.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (rel === '/api/social' || rel.startsWith('/api/social/')) {
    const handled = await handleSocialApi(req, res, rel, session, sendJson);
    if (handled) return;
  }

  if (req.method === 'GET' && rel === '/api/admin/users') {
    const admin = requireAdminSession(req, res);
    if (!admin) return;
    sendJson(res, 200, {
      ok: true,
      users: listUsers(),
      audit: listAudit(60),
      serverNow: Date.now(),
    });
    return;
  }

  if (req.method === 'GET' && rel === '/api/admin/bot-garage') {
    const admin = requireAdminSession(req, res);
    if (!admin) return;
    const bot = getBot(Number(new URL(req.url, 'http://localhost').searchParams.get('id')));
    if (!bot) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      bot: {
        id: bot.id,
        name: bot.name,
        handle: bot.handle,
        avatar: bot.avatar,
        level: bot.level,
        car: bot.car,
        garage: sanitizeBotGarage(bot.garage, bot.car),
      },
    });
    return;
  }

  if (req.method === 'POST' && rel === '/api/admin/bot-garage') {
    const admin = requireAdminSession(req, res);
    if (!admin) return;
    if (!checkCsrf(req, req.headers['x-csrf-token'])) {
      sendJson(res, 403, { ok: false, error: 'csrf' });
      return;
    }
    const limit = rateLimit(`admin:${admin.user.id}`, 120, 60 * 1000);
    if (!limit.ok) {
      sendJson(res, 429, { ok: false, error: 'rate_limited', retryAfter: limit.retryAfter });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(await readBody(req, config.maxStateBytes));
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    const result = await applyAdminAction({
      actor: admin.user,
      action: 'save-bot-garage',
      target: payload?.id,
      garage: payload?.garage,
      ip: clientIp(req),
    });
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'POST' && rel === '/api/admin/action') {
    const admin = requireAdminSession(req, res);
    if (!admin) return;
    if (!checkCsrf(req, req.headers['x-csrf-token'])) {
      sendJson(res, 403, { ok: false, error: 'csrf' });
      return;
    }
    const limit = rateLimit(`admin:${admin.user.id}`, 120, 60 * 1000);
    if (!limit.ok) {
      sendJson(res, 429, { ok: false, error: 'rate_limited', retryAfter: limit.retryAfter });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(await readBody(req, 16 * 1024));
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    const result = await applyAdminAction({
      actor: admin.user,
      action: payload?.action,
      target: payload?.target,
      level: payload?.level,
      coins: payload?.coins,
      cash: payload?.cash,
      password: payload?.password,
      reason: payload?.reason,
      username: payload?.username,
      displayName: payload?.displayName,
      isAdmin: Boolean(payload?.isAdmin),
      name: payload?.name,
      handle: payload?.handle,
      carModel: payload?.carModel,
      paint: payload?.paint,
      visitable: payload?.visitable !== false,
      challengeable: payload?.challengeable !== false,
      enabled: payload?.enabled !== false,
      baseModel: payload?.baseModel,
      brand: payload?.brand,
      carClass: payload?.carClass,
      price: payload?.price,
      hp: payload?.hp,
      kg: payload?.kg,
      grip: payload?.grip,
      gears: payload?.gears,
      redline: payload?.redline,
      sort: payload?.sort,
      sourceBot: payload?.sourceBot,
      sourceUser: payload?.sourceUser,
      includeCars: payload?.includeCars !== false,
      garage: payload?.garage,
      force: payload?.force,
      ip: clientIp(req),
    });
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not_found' });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(res, 400, 'Bad request');
    return;
  }

  if (pathname === '/health' || pathname === withBase('/health')) {
    const healthy = dbPing();
    sendJson(res, healthy ? 200 : 503, {
      ok: healthy,
      rooms: rooms.size,
      players: wss.clients.size,
      users: healthy ? countUsers() : 0,
      basePath: config.basePath,
    });
    return;
  }

  if (config.basePath) {
    if (pathname === '/' || pathname === config.basePath) {
      redirect(res, withBase('/'));
      return;
    }
    if (pathname !== config.basePath && !pathname.startsWith(config.basePath + '/')) {
      send(res, 404, 'Not found');
      return;
    }
  }

  const rel = config.basePath ? pathname.slice(config.basePath.length) || '/' : pathname;
  if (rel === '/' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) {
      redirect(res, withBase('/login'));
      return;
    }
    ensureCsrfToken(req, res);
    if (!serveFile(req, res, path.join(config.dist, 'index.html'))) {
      sendHtml(res, 503, simplePage('Sin build', 'Ejecuta "npm run build" antes de arrancar el servidor.', readLang(req)));
    }
    return;
  }

  if (rel === '/login') {
    if (req.method === 'GET') {
      if (getSession(req)) {
        redirect(res, withBase('/'));
        return;
      }
      const lang = requestLang(req, url, res);
      const csrf = ensureCsrfToken(req, res);
      sendHtml(
        res,
        200,
        loginPage({
          csrf,
          next: safeNext(url.searchParams.get('next')),
          registrationOpen: config.registration !== 'closed',
          lang,
        }),
      );
      return;
    }
    if (req.method === 'POST') {
      await handleLogin(req, res);
      return;
    }
  }

  if (rel === '/register') {
    if (config.registration === 'closed') {
      sendHtml(res, 403, simplePage('Registro cerrado', 'Las cuentas nuevas están desactivadas.', readLang(req)));
      return;
    }
    if (req.method === 'GET') {
      if (getSession(req)) {
        redirect(res, withBase('/'));
        return;
      }
      const lang = requestLang(req, url, res);
      const csrf = ensureCsrfToken(req, res);
      sendHtml(
        res,
        200,
        registerPage({
          csrf,
          next: safeNext(url.searchParams.get('next')),
          inviteRequired: Boolean(config.inviteCode),
          lang,
        }),
      );
      return;
    }
    if (req.method === 'POST') {
      await handleRegister(req, res);
      return;
    }
  }

  if (rel === '/logout') {
    if (req.method === 'POST') {
      await handleLogout(req, res);
      return;
    }
    redirect(res, withBase('/login'));
    return;
  }

  if (rel === '/admin') {
    const session = getSession(req);
    if (!session) {
      redirect(res, withBase('/login?next=' + encodeURIComponent(withBase('/admin'))));
      return;
    }
    if (!session.user.isAdmin) {
      sendHtml(res, 403, simplePage('Acceso denegado', 'Esta zona es solo para administradores.', readLang(req)));
      return;
    }
    const csrf = ensureCsrfToken(req, res);
    const lang = requestLang(req, url, res);
    sendHtml(
      res,
      200,
      adminPage({
        admin: session.user,
        users: listUsers(),
        bots: listBots({ includeInactive: true }),
        cars: listCustomCars({ includeDisabled: true }),
        audit: listAudit(60),
        csrf,
        lang,
        needsLang: parseCookies(req)[ADMIN_LANG_FLAG_COOKIE] !== '1',
        notice: String(url.searchParams.get('notice') || '').slice(0, 300),
        error: String(url.searchParams.get('error') || '').slice(0, 300),
      }),
    );
    return;
  }

  if (rel === '/admin/action' && req.method === 'POST') {
    const session = getSession(req);
    if (!session) {
      redirect(res, withBase('/login'));
      return;
    }
    if (!session.user.isAdmin) {
      send(res, 403, 'Forbidden');
      return;
    }
    let form;
    try {
      form = parseForm(await readBody(req, 64 * 1024));
    } catch {
      redirect(res, withBase('/admin?error=' + encodeURIComponent('Solicitud inválida.')));
      return;
    }
    if (!checkCsrf(req, form.get('_csrf'))) {
      redirect(res, withBase('/admin?error=' + encodeURIComponent('La sesión del formulario ha caducado.')));
      return;
    }
    const limit = rateLimit(`admin:${session.user.id}`, 120, 60 * 1000);
    if (!limit.ok) {
      redirect(res, withBase('/admin?error=' + encodeURIComponent(`Demasiadas acciones. Espera ${limit.retryAfter}s.`)));
      return;
    }
    if (form.get('action') === 'set-admin-lang') {
      const selected = form.get('lang');
      if (!PAGE_LANGS.has(selected)) {
        redirect(res, withBase('/admin?error=language_invalid'));
        return;
      }
      const cookiePath = config.basePath || '/';
      appendCookie(res, `${PAGE_LANG_COOKIE}=${encodeURIComponent(selected)}; Path=${cookiePath}; Max-Age=31536000; SameSite=Lax`);
      appendCookie(res, `${ADMIN_LANG_FLAG_COOKIE}=1; Path=${cookiePath}; Max-Age=31536000; SameSite=Lax`);
      redirect(res, withBase('/admin?notice=language_saved'));
      return;
    }
    const result = await applyAdminAction({
      actor: session.user,
      action: form.get('action'),
      target: form.get('target'),
      level: form.get('level'),
      coins: form.get('coins'),
      cash: form.get('cash'),
      password: form.get('password'),
      reason: form.get('reason'),
      username: form.get('username'),
      displayName: form.get('displayName'),
      isAdmin: form.get('isAdmin') === '1',
      name: form.get('name'),
      handle: form.get('handle'),
      carModel: form.get('carModel'),
      paint: form.get('paint'),
      visitable: form.get('visitable') !== '0',
      challengeable: form.get('challengeable') !== '0',
      enabled: form.get('enabled') !== '0',
      baseModel: form.get('baseModel'),
      brand: form.get('brand'),
      carClass: form.get('carClass'),
      price: form.get('price'),
      hp: form.get('hp'),
      kg: form.get('kg'),
      grip: form.get('grip'),
      gears: form.get('gears'),
      redline: form.get('redline'),
      sort: form.get('sort'),
      sourceBot: form.get('sourceBot'),
      sourceUser: form.get('sourceUser'),
      includeCars: form.get('includeCars') === '1',
      ip: clientIp(req),
    });
    const params = new URLSearchParams();
    if (result.ok) params.set('notice', result.message || 'Hecho.');
    else params.set('error', result.message || 'No se pudo completar la acción.');
    redirect(res, withBase('/admin?' + params.toString()));
    return;
  }

  if (rel.startsWith('/api/')) {
    await handleApi(req, res, rel);
    return;
  }

  if (rel === '/ws') {
    send(res, 426, 'WebSocket upgrade required');
    return;
  }

  if (rel.startsWith('/assets/')) {
    const file = gameFile(rel);
    if (serveFile(req, res, file, { cache: 'public, max-age=31536000, immutable' })) return;
    send(res, 404, 'Not found');
    return;
  }

  if (rel === '/favicon.ico') {
    send(res, 204, '');
    return;
  }

  const file = gameFile(rel);
  if (serveFile(req, res, file)) return;

  const session = getSession(req);
  if (!session) {
    redirect(res, withBase('/login?next=' + encodeURIComponent(pathname)));
    return;
  }
  ensureCsrfToken(req, res);
  if (!serveFile(req, res, path.join(config.dist, 'index.html'))) {
    sendHtml(res, 503, simplePage('Sin build', 'Ejecuta "npm run build" antes de arrancar el servidor.', readLang(req)));
  }
}

// ---------------------------------------------------------------------------
// Online drag races
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });
const rooms = new Map();
let nextId = 1;

function code4() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function wsSend(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function roomInfo(room) {
  return {
    code: room.code,
    players: room.players.map((p) => ({ id: p.id, player: p.player, ready: p.ready })),
    state: room.state,
  };
}

function broadcast(room, msg) {
  for (const player of room.players) wsSend(player.ws, msg);
}

function sanitizePlayer(player) {
  const name = String(player?.name || 'Racer').slice(0, 14);
  const car = player?.car && typeof player.car === 'object' ? player.car : { model: 'hatch' };
  const avatar = player?.avatar && typeof player.avatar === 'object' ? player.avatar : {};
  return {
    name,
    car: JSON.parse(JSON.stringify(car)),
    avatar: JSON.parse(JSON.stringify(avatar)),
    level: Number(player?.level) || 1,
  };
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  room.players = room.players.filter((player) => player !== client);
  client.room = null;
  client.ready = false;
  if (!room.players.length) {
    rooms.delete(room.code);
    return;
  }
  if (room.state === 'racing') {
    for (const player of room.players) {
      wsSend(player.ws, { type: 'result', winner: player.id, forfeit: true, times: {} });
    }
  }
  room.state = 'lobby';
  for (const player of room.players) player.ready = false;
  broadcast(room, { type: 'room', room: roomInfo(room) });
}

function maybeStart(room) {
  if (room.players.length === 2 && room.players.every((p) => p.ready) && room.state === 'lobby') {
    room.state = 'racing';
    room.finish = {};
    room.startAt = Date.now() + 4500;
    broadcast(room, { type: 'start', startAt: room.startAt, now: Date.now(), room: roomInfo(room) });
    room.timeout = setTimeout(() => decide(room), 30000);
  }
}

function decide(room) {
  if (room.state !== 'racing') return;
  clearTimeout(room.timeout);
  const entries = Object.entries(room.finish);
  let winner = null;
  if (entries.length) winner = entries.sort((a, b) => a[1].time - b[1].time)[0][0];
  broadcast(room, { type: 'result', winner: winner ? Number(winner) : null, times: room.finish });
  room.state = 'lobby';
  for (const player of room.players) player.ready = false;
}

wss.on('connection', (ws, req) => {
  const client = {
    id: nextId++,
    ws,
    room: null,
    ready: false,
    player: null,
    userId: req.cartownUser?.id || null,
  };
  wsSend(ws, { type: 'hello', id: client.id });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'create': {
        leaveRoom(client);
        client.player = sanitizePlayer(msg.player);
        const room = { code: code4(), players: [client], state: 'lobby' };
        rooms.set(room.code, room);
        client.room = room;
        wsSend(ws, { type: 'room', room: roomInfo(room) });
        break;
      }
      case 'join': {
        const room = rooms.get(String(msg.code || '').toUpperCase());
        if (!room) {
          wsSend(ws, { type: 'error', error: 'Room not found' });
          break;
        }
        if (room.players.length >= 2) {
          wsSend(ws, { type: 'error', error: 'Room is full' });
          break;
        }
        leaveRoom(client);
        client.player = sanitizePlayer(msg.player);
        room.players.push(client);
        client.room = room;
        broadcast(room, { type: 'room', room: roomInfo(room) });
        break;
      }
      case 'player': {
        client.player = sanitizePlayer(msg.player);
        if (client.room) broadcast(client.room, { type: 'room', room: roomInfo(client.room) });
        break;
      }
      case 'ready': {
        if (!client.room) break;
        client.ready = true;
        broadcast(client.room, { type: 'room', room: roomInfo(client.room) });
        maybeStart(client.room);
        break;
      }
      case 'progress': {
        const room = client.room;
        if (!room || room.state !== 'racing') break;
        client.pendingProgress = {
          type: 'progress',
          id: client.id,
          dist: Number(msg.dist) || 0,
          v: Number(msg.v) || 0,
          rpm: Number(msg.rpm) || 0,
          gear: Number(msg.gear) || 1,
          nitro: Boolean(msg.nitro),
          launched: Boolean(msg.launched),
        };
        const now = Date.now();
        if (now - (client.lastProgressAt || 0) < 33) break;
        client.lastProgressAt = now;
        const progress = client.pendingProgress;
        client.pendingProgress = null;
        for (const player of room.players) {
          if (player !== client) wsSend(player.ws, progress);
        }
        break;
      }
      case 'finish': {
        const room = client.room;
        if (!room || room.state !== 'racing') break;
        room.finish[client.id] = {
          time: Number(msg.time) || 99,
          trap: Number(msg.trap) || 0,
        };
        for (const player of room.players) {
          if (player !== client) {
            wsSend(player.ws, {
              type: 'opponentFinish',
              id: client.id,
              time: room.finish[client.id].time,
              trap: room.finish[client.id].trap,
            });
          }
        }
        if (Object.keys(room.finish).length >= room.players.length) decide(room);
        break;
      }
      case 'leave':
        leaveRoom(client);
        break;
      default:
        break;
    }
  });
  ws.on('close', () => leaveRoom(client));
});

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[http]', error);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal_error' });
    else res.destroy();
  });
});

const wsPaths = new Set([withBase('/ws'), '/ws']);
server.on('upgrade', (req, socket, head) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    socket.destroy();
    return;
  }
  if (!wsPaths.has(pathname)) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).hostname;
      const requestHost = new URL(`http://${req.headers.host || 'localhost'}`).hostname;
      if (originHost !== requestHost && originHost !== 'localhost') throw new Error('bad origin');
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
  }
  const session = getSession(req);
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  req.cartownUser = session.user;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

initDb();
startSnapshots();

server.listen(config.port, config.host, () => {
  console.log(`Car Town Remake listening on http://${config.host}:${config.port}${withBase('/')}`);
  console.log(`Auth at ${withBase('/login')} | WS ${withBase('/ws')}`);
});

function shutdown(signal) {
  console.log(`[server] ${signal}, saving snapshot...`);
  try {
    server.close();
  } catch {
    /* ignore */
  }
  let snapshotOk = false;
  try {
    snapshotOk = closeDb();
  } finally {
    process.exit(snapshotOk ? 0 : 1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
