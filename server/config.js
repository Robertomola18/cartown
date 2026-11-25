import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizeBase(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return '/' + raw.replace(/^\/+|\/+$/g, '');
}

const BASE_PATH = normalizeBase(process.env.CARTON_BASE_PATH || '/cartown');
const DATA_DIR = path.resolve(process.env.CARTON_DATA_DIR || path.join(ROOT, 'var'));
const RAM_DIR = path.resolve(process.env.CARTON_RAM_DIR || path.join(DATA_DIR, 'ram'));
const EMERGENCY_DIR = path.resolve(
  process.env.CARTON_EMERGENCY_DIR || path.join(DATA_DIR, 'emergency'),
);
const NAS_DIR = path.resolve(process.env.CARTON_NAS_DIR || path.join(DATA_DIR, 'nas'));

export const config = {
  root: ROOT,
  dist: path.join(ROOT, 'dist'),
  basePath: BASE_PATH,
  dataDir: DATA_DIR,
  ramDir: RAM_DIR,
  emergencyDir: EMERGENCY_DIR,
  nasDir: NAS_DIR,
  dbPath: path.join(RAM_DIR, 'cartown.db'),
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  cookieName: 'cartown_session',
  csrfCookie: 'cartown_csrf',
  sessionMs: Number(process.env.CARTON_SESSION_DAYS || 30) * 24 * 60 * 60 * 1000,
  secureCookies: process.env.CARTON_COOKIE_SECURE === '1',
  maxStateBytes: Number(process.env.CARTON_MAX_STATE_BYTES || 2 * 1024 * 1024),
  snapshotIntervalMs: Number(process.env.CARTON_SNAPSHOT_MINUTES || 5) * 60 * 1000,
  registration: (process.env.CARTON_REGISTRATION || 'open').toLowerCase(),
  inviteCode: process.env.CARTON_INVITE_CODE || '',
  trustProxy: process.env.CARTON_TRUST_PROXY === '1',
};

export function withBase(p = '/') {
  const suffix = p.startsWith('/') ? p : `/${p}`;
  return `${config.basePath}${suffix}` || '/';
}

export function isSecure(req) {
  return Boolean(
    config.secureCookies ||
      req.socket?.encrypted ||
      (config.trustProxy &&
        String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'),
  );
}
