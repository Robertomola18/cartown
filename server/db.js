import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { generateBotGarage } from './botGarage.js';

let db = null;
let snapshotTimer = null;

function ensureDirs() {
  for (const dir of [config.dataDir, config.ramDir, config.emergencyDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function snapshotFiles(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /^cartown-\d{8}-\d{6}(?:-\d{3})?-\d+\.db$/.test(name))
      .map((name) => {
        const file = path.join(dir, name);
        return { file, mtime: fs.statSync(file).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

function isUsable(file) {
  try {
    const probe = new DatabaseSync(file, { readOnly: true });
    const row = probe.prepare('PRAGMA quick_check').get();
    probe.close();
    return String(row?.quick_check || '').toLowerCase() === 'ok';
  } catch {
    return false;
  }
}

function restoreIfNeeded() {
  if (fs.existsSync(config.dbPath)) {
    if (isUsable(config.dbPath)) return;
    try {
      fs.renameSync(config.dbPath, `${config.dbPath}.corrupt-${Date.now()}`);
    } catch {
      fs.rmSync(config.dbPath, { force: true });
    }
    fs.rmSync(`${config.dbPath}-wal`, { force: true });
    fs.rmSync(`${config.dbPath}-shm`, { force: true });
  }

  const candidates = [...snapshotFiles(config.emergencyDir), ...snapshotFiles(config.nasDir)]
    .sort((a, b) => b.mtime - a.mtime);
  for (const candidate of candidates) {
    try {
      fs.rmSync(`${config.dbPath}-wal`, { force: true });
      fs.rmSync(`${config.dbPath}-shm`, { force: true });
      fs.copyFileSync(candidate.file, config.dbPath);
      if (isUsable(config.dbPath)) {
        console.log(`[db] restored snapshot ${candidate.file}`);
        return;
      }
    } catch (error) {
      console.warn(`[db] could not restore ${candidate.file}: ${error.message}`);
    }
  }
  fs.rmSync(config.dbPath, { force: true });
  fs.rmSync(`${config.dbPath}-wal`, { force: true });
  fs.rmSync(`${config.dbPath}-shm`, { force: true });
}

function hasColumn(table, column) {
  return getDb()
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrate() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER,
      is_admin INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS saves (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  ensureColumn('users', 'banned_at', 'INTEGER');
  ensureColumn('users', 'ban_reason', 'TEXT');
  ensureColumn('users', 'force_tutorial', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'force_tutorial_at', 'INTEGER');
  ensureColumn('users', 'ranking_opt_out', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      admin_name TEXT,
      target_id INTEGER,
      target_name TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at);
    CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit(target_id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS friends_friend_idx ON friends(friend_id);

    CREATE TABLE IF NOT EXISTS wall_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wall_posts_created_idx ON wall_posts(created_at);

    CREATE TABLE IF NOT EXISTS wall_likes (
      post_id INTEGER NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenger_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opponent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      car_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      responded_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS challenges_opponent_idx ON challenges(opponent_id, status);

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visitor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS visits_host_idx ON visits(host_id, created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      ref_id INTEGER,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at, created_at);

    CREATE TABLE IF NOT EXISTS bots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
      avatar_json TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      races INTEGER NOT NULL DEFAULT 0,
      car_json TEXT,
      garage_json TEXT,
      visitable INTEGER NOT NULL DEFAULT 1,
      challengeable INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_cars (
      id TEXT PRIMARY KEY,
      base_model TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT 'RSILVA',
      class TEXT NOT NULL DEFAULT 'Custom',
      price INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      cash INTEGER NOT NULL DEFAULT 0,
      paint TEXT,
      finish TEXT,
      hp INTEGER,
      kg INTEGER,
      grip REAL,
      gears INTEGER,
      redline INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS garage_likes (
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (host_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS garage_likes_host_idx ON garage_likes(host_id);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, recipient_id, created_at);
    CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages(recipient_id, read_at, created_at);

    CREATE TABLE IF NOT EXISTS friend_races (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opponent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opponent_name TEXT NOT NULL,
      won INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS friend_races_user_idx ON friend_races(user_id, claimed_at, created_at);
  `);
  db.prepare(
    "INSERT INTO meta(key, value) VALUES ('schema', '4') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run();
  if (!db.prepare("SELECT 1 FROM meta WHERE key = 'bot_garages_v1'").get()) {
    const rows = db.prepare('SELECT id, handle, name, level, car_json FROM bots').all();
    const update = db.prepare('UPDATE bots SET garage_json = ?, updated_at = ? WHERE id = ?');
    for (const row of rows) {
      const garage = jsonParse(row.garage_json, null);
      if (garage && Array.isArray(garage.items) && garage.items.length) continue;
      const car = jsonParse(row.car_json, {});
      update.run(JSON.stringify(generateBotGarage({ id: row.id, handle: row.handle, name: row.name, level: row.level, car })), Date.now(), row.id);
    }
    db.prepare("INSERT INTO meta(key, value) VALUES ('bot_garages_v1', '1')").run();
  }
}

export function initDb() {
  if (db) return db;
  ensureDirs();
  restoreIfNeeded();
  db = new DatabaseSync(config.dbPath);
  migrate();
  seedCustomCars();
  seedBots();
  return db;
}

export function getDb() {
  return db || initDb();
}

const HYPERCARS = [
  {
    id: 'hyper_apex', base_model: 'super', name: 'Apex GT', brand: 'RSILVA', class: 'Hypercar',
    price: 25000000, level: 100, cash: 0, paint: '#1b1f3a', finish: 'metallic',
    hp: 1400, kg: 1200, grip: 1.35, gears: 8, redline: 9500, sort: 100,
  },
  {
    id: 'hyper_nova', base_model: 'super', name: 'Nova X', brand: 'RSILVA', class: 'Hypercar',
    price: 45000000, level: 130, cash: 0, paint: '#ff2bd6', finish: 'candy',
    hp: 1750, kg: 1150, grip: 1.4, gears: 8, redline: 10000, sort: 110,
  },
  {
    id: 'hyper_zenith', base_model: 'coupe', name: 'Zenith R', brand: 'RSILVA', class: 'Hyper GT',
    price: 70000000, level: 170, cash: 0, paint: '#0f6b4a', finish: 'pearl',
    hp: 2100, kg: 1250, grip: 1.45, gears: 8, redline: 10500, sort: 120,
  },
  {
    id: 'hyper_titan', base_model: 'amgsuv', name: 'Titan One', brand: 'RSILVA', class: 'Hyper SUV',
    price: 120000000, level: 200, cash: 0, paint: '#121316', finish: 'matte',
    hp: 2500, kg: 1800, grip: 1.5, gears: 9, redline: 11000, sort: 130,
  },
];

function seedCustomCars() {
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO custom_cars(
       id, base_model, name, brand, class, price, level, cash, paint, finish,
       hp, kg, grip, gears, redline, enabled, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  );
  for (const car of HYPERCARS) {
    stmt.run(
      car.id, car.base_model, car.name, car.brand, car.class, car.price, car.level, car.cash,
      car.paint, car.finish, car.hp, car.kg, car.grip, car.gears, car.redline, car.sort, now, now,
    );
  }
}

const DEFAULT_BOTS = [
  {
    handle: 'daisy', name: 'Daisy', level: 8, xp: 2400, wins: 3, races: 9,
    avatar: { skin: '#f1c7a3', hair: '#e9b949', shirt: '#ff7aa8', style: 'long' },
    car: { model: 'beetle', paint: '#ff6fb3' },
    garage: {
      size: 14, floor: 'tile', wall: 'white',
      items: [{ uid: 'bot-daisy-1', type: 'plant', x: 0, z: 0, rot: 0 }, { uid: 'bot-daisy-2', type: 'poster', x: 4, z: 0, rot: 0, wall: 'z' }],
      cars: [{ id: 'bot-daisy-car', cfg: { model: 'beetle', paint: '#ff6fb3' }, placed: { x: 8, z: 8, rot: 0 } }],
    },
  },
  {
    handle: 'eddy', name: 'Eddy', level: 14, xp: 6800, wins: 8, races: 20,
    avatar: { skin: '#c68a5e', hair: '#2a1b10', shirt: '#2f8be0', style: 'short' },
    car: { model: 'muscle', paint: '#2f5fb8', livery: 'stripes', liveryColor: '#f3f3f1' },
    garage: {
      size: 16, floor: 'checker', wall: 'blue',
      items: [{ uid: 'bot-eddy-1', type: 'lift', x: 11, z: 1, rot: 0 }, { uid: 'bot-eddy-2', type: 'toolchest', x: 15, z: 0, rot: 0 }],
      cars: [{ id: 'bot-eddy-car', cfg: { model: 'muscle', paint: '#2f5fb8', livery: 'stripes', liveryColor: '#f3f3f1' }, placed: { x: 7, z: 7, rot: 0 } }],
    },
  },
  {
    handle: 'zoni', name: 'Zoni', level: 22, xp: 16400, wins: 17, races: 31,
    avatar: { skin: '#5a3825', hair: '#111111', shirt: '#d9262b', style: 'short' },
    car: { model: 'super', paint: '#121316', neon: '#ff2bd6' },
    garage: {
      size: 18, floor: 'blue', wall: 'dark',
      items: [{ uid: 'bot-zoni-1', type: 'neonsign', x: 9, z: 0, rot: 0, wall: 'z' }, { uid: 'bot-zoni-2', type: 'arcade', x: 3, z: 15, rot: 0 }],
      cars: [{ id: 'bot-zoni-car', cfg: { model: 'super', paint: '#121316', neon: '#ff2bd6' }, placed: { x: 9, z: 9, rot: 0 } }],
    },
  },
];

function seedBots() {
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO bots(name, handle, avatar_json, level, xp, wins, races, car_json, garage_json,
       visitable, challengeable, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`,
  );
  for (const bot of DEFAULT_BOTS) {
    stmt.run(bot.name, bot.handle, JSON.stringify(bot.avatar), bot.level, bot.xp, bot.wins, bot.races,
      JSON.stringify(bot.car), JSON.stringify(bot.garage), now, now);
  }
}

function jsonParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function publicBot(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    handle: String(row.handle),
    avatar: jsonParse(row.avatar_json, {}),
    level: Math.max(1, Number(row.level) || 1),
    xp: Math.max(0, Number(row.xp) || 0),
    wins: Math.max(0, Number(row.wins) || 0),
    races: Math.max(0, Number(row.races) || 0),
    car: jsonParse(row.car_json, { model: 'hatch' }),
    garage: jsonParse(row.garage_json, {}),
    visitable: Boolean(row.visitable),
    challengeable: Boolean(row.challengeable),
    active: Boolean(row.active),
    createdAt: Number(row.created_at) || null,
    updatedAt: Number(row.updated_at) || null,
  };
}

export function listBots({ includeInactive = false } = {}) {
  const sql = includeInactive
    ? 'SELECT * FROM bots ORDER BY level DESC, name COLLATE NOCASE'
    : 'SELECT * FROM bots WHERE active = 1 ORDER BY level DESC, name COLLATE NOCASE';
  return getDb().prepare(sql).all().map(publicBot);
}

export function getBot(id) {
  const row = getDb().prepare('SELECT * FROM bots WHERE id = ?').get(Number(id));
  return row ? publicBot(row) : null;
}

export function createBot(data = {}) {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO bots(name, handle, avatar_json, level, xp, wins, races, car_json, garage_json,
         visitable, challengeable, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      String(data.name || 'Bot').slice(0, 40),
      String(data.handle || data.name || `bot_${now}`).slice(0, 40).toLowerCase(),
      JSON.stringify(data.avatar || {}),
      Math.max(1, Math.min(500, Number(data.level) || 1)),
      Math.max(0, Math.round(Number(data.xp) || 0)),
      Math.max(0, Math.round(Number(data.wins) || 0)),
      Math.max(0, Math.round(Number(data.races) || 0)),
      JSON.stringify(data.car || { model: 'hatch' }),
      JSON.stringify(data.garage || generateBotGarage(data)),
      data.visitable === false ? 0 : 1,
      data.challengeable === false ? 0 : 1,
      data.active === false ? 0 : 1,
      now,
      now,
    );
  return getBot(Number(result.lastInsertRowid));
}

export function regenerateBotGarages({ force = false } = {}) {
  const rows = getDb().prepare('SELECT id, handle, name, level, car_json, garage_json FROM bots').all();
  const update = getDb().prepare('UPDATE bots SET garage_json = ?, updated_at = ? WHERE id = ?');
  let changed = 0;
  for (const row of rows) {
    const garage = jsonParse(row.garage_json, null);
    if (!force && garage && Array.isArray(garage.items) && garage.items.length) continue;
    const car = jsonParse(row.car_json, {});
    update.run(JSON.stringify(generateBotGarage({ id: row.id, handle: row.handle, name: row.name, level: row.level, car })), Date.now(), row.id);
    changed++;
  }
  return changed;
}

export function updateBot(id, data = {}) {
  const current = getBot(id);
  if (!current) return null;
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE bots SET name = ?, handle = ?, avatar_json = ?, level = ?, xp = ?, wins = ?, races = ?,
         car_json = ?, garage_json = ?, visitable = ?, challengeable = ?, active = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      String(data.name ?? current.name).slice(0, 40),
      String(data.handle ?? current.handle).slice(0, 40).toLowerCase(),
      JSON.stringify(data.avatar ?? current.avatar),
      Math.max(1, Math.min(500, Number(data.level ?? current.level) || 1)),
      Math.max(0, Math.round(Number(data.xp ?? current.xp) || 0)),
      Math.max(0, Math.round(Number(data.wins ?? current.wins) || 0)),
      Math.max(0, Math.round(Number(data.races ?? current.races) || 0)),
      JSON.stringify(data.car ?? current.car),
      JSON.stringify(data.garage ?? current.garage),
      (data.visitable ?? current.visitable) ? 1 : 0,
      (data.challengeable ?? current.challengeable) ? 1 : 0,
      (data.active ?? current.active) ? 1 : 0,
      now,
      Number(id),
    );
  return getBot(id);
}

export function deleteBot(id) {
  getDb().prepare('DELETE FROM bots WHERE id = ?').run(Number(id));
  return { ok: true };
}

function publicCustomCar(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    baseModel: String(row.base_model),
    name: String(row.name),
    brand: String(row.brand),
    class: String(row.class),
    price: Math.max(0, Number(row.price) || 0),
    level: Math.max(1, Number(row.level) || 1),
    cash: Math.max(0, Number(row.cash) || 0),
    paint: row.paint || null,
    finish: row.finish || null,
    hp: row.hp === null ? null : Number(row.hp),
    kg: row.kg === null ? null : Number(row.kg),
    grip: row.grip === null ? null : Number(row.grip),
    gears: row.gears === null ? null : Number(row.gears),
    redline: row.redline === null ? null : Number(row.redline),
    enabled: Boolean(row.enabled),
    sort: Number(row.sort) || 0,
  };
}

export function listCustomCars({ includeDisabled = true } = {}) {
  const sql = includeDisabled
    ? 'SELECT * FROM custom_cars ORDER BY sort ASC, level ASC, name COLLATE NOCASE'
    : 'SELECT * FROM custom_cars WHERE enabled = 1 ORDER BY sort ASC, level ASC, name COLLATE NOCASE';
  return getDb().prepare(sql).all().map(publicCustomCar);
}

export function createCustomCar(data = {}) {
  const now = Date.now();
  const id = String(data.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (!id) throw new Error('id requerido');
  getDb()
    .prepare(
      `INSERT INTO custom_cars(id, base_model, name, brand, class, price, level, cash, paint, finish,
         hp, kg, grip, gears, redline, enabled, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id, String(data.baseModel || 'super'), String(data.name || 'Custom').slice(0, 40),
      String(data.brand || 'RSILVA').slice(0, 40), String(data.class || 'Custom').slice(0, 40),
      Math.max(0, Math.round(Number(data.price) || 0)),
      Math.max(1, Math.min(500, Math.round(Number(data.level) || 1))),
      Math.max(0, Math.round(Number(data.cash) || 0)),
      data.paint || null, data.finish || null,
      data.hp ? Math.round(Number(data.hp)) : null,
      data.kg ? Math.round(Number(data.kg)) : null,
      data.grip ? Number(data.grip) : null,
      data.gears ? Math.round(Number(data.gears)) : null,
      data.redline ? Math.round(Number(data.redline)) : null,
      data.enabled === false ? 0 : 1,
      Math.round(Number(data.sort) || 0), now, now,
    );
  return publicCustomCar(getDb().prepare('SELECT * FROM custom_cars WHERE id = ?').get(id));
}

export function updateCustomCar(id, data = {}) {
  const row = getDb().prepare('SELECT * FROM custom_cars WHERE id = ?').get(String(id));
  if (!row) return null;
  const current = publicCustomCar(row);
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE custom_cars SET base_model = ?, name = ?, brand = ?, class = ?, price = ?, level = ?,
         cash = ?, paint = ?, finish = ?, hp = ?, kg = ?, grip = ?, gears = ?, redline = ?,
         enabled = ?, sort = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      String(data.baseModel ?? current.baseModel),
      String(data.name ?? current.name).slice(0, 40),
      String(data.brand ?? current.brand).slice(0, 40),
      String(data.class ?? current.class).slice(0, 40),
      Math.max(0, Math.round(Number(data.price ?? current.price) || 0)),
      Math.max(1, Math.min(500, Math.round(Number(data.level ?? current.level) || 1))),
      Math.max(0, Math.round(Number(data.cash ?? current.cash) || 0)),
      data.paint ?? current.paint, data.finish ?? current.finish,
      data.hp === '' ? null : Math.round(Number(data.hp ?? current.hp) || 0) || null,
      data.kg === '' ? null : Math.round(Number(data.kg ?? current.kg) || 0) || null,
      data.grip === '' ? null : Number(data.grip ?? current.grip) || null,
      data.gears === '' ? null : Math.round(Number(data.gears ?? current.gears) || 0) || null,
      data.redline === '' ? null : Math.round(Number(data.redline ?? current.redline) || 0) || null,
      (data.enabled ?? current.enabled) ? 1 : 0,
      Math.round(Number(data.sort ?? current.sort) || 0), now, String(id),
    );
  return publicCustomCar(getDb().prepare('SELECT * FROM custom_cars WHERE id = ?').get(String(id)));
}

export function deleteCustomCar(id) {
  getDb().prepare('DELETE FROM custom_cars WHERE id = ?').run(String(id));
  return { ok: true };
}

export function toggleGarageLike(hostId, userId) {
  const host = Number(hostId);
  const me = Number(userId);
  if (!host || !me || host === me) return { ok: false, error: 'invalid' };
  const dbh = getDb();
  const existing = dbh.prepare('SELECT 1 FROM garage_likes WHERE host_id = ? AND user_id = ?').get(host, me);
  if (existing) {
    dbh.prepare('DELETE FROM garage_likes WHERE host_id = ? AND user_id = ?').run(host, me);
    return { ok: true, liked: false, likes: garageLikeCount(host) };
  }
  dbh.prepare('INSERT INTO garage_likes(host_id, user_id, created_at) VALUES (?, ?, ?)').run(host, me, Date.now());
  const liker = getUserById(me);
  notifyOnce(host, me, 'like', null, `${liker?.display_name || 'Player'} le gustó tu garaje`, 60 * 1000);
  return { ok: true, liked: true, likes: garageLikeCount(host) };
}

export function garageLikeCount(hostId) {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM garage_likes WHERE host_id = ?').get(Number(hostId));
  return Number(row?.n) || 0;
}

export function garageLikedBy(hostId, userId) {
  return Boolean(getDb().prepare('SELECT 1 FROM garage_likes WHERE host_id = ? AND user_id = ?').get(Number(hostId), Number(userId)));
}

export function createUser(username, displayName, passwordHash) {
  const now = Date.now();
  const result = getDb()
    .prepare(
      'INSERT INTO users(username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(username, displayName, passwordHash, now);
  return getUserById(Number(result.lastInsertRowid));
}

export function getUserByUsername(username) {
  return (
    getDb()
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(String(username)) || null
  );
}

export function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) || null;
}

export function touchLogin(userId) {
  getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), Number(userId));
}

export function createSession(tokenHash, userId, expiresAt, ip, userAgent) {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(tokenHash, Number(userId), now, Number(expiresAt), now, ip || null, userAgent || null);
}

export function findSession(tokenHash) {
  const now = Date.now();
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  return (
    getDb()
      .prepare(
        `SELECT s.token_hash, s.expires_at, u.id, u.username, u.display_name, u.is_admin,
                u.banned_at, u.force_tutorial
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned_at IS NULL`,
      )
      .get(String(tokenHash), now) || null
  );
}

export function touchSession(tokenHash) {
  getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(Date.now(), tokenHash);
}

export function deleteSession(tokenHash) {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(String(tokenHash));
}

export function deleteUserSessions(userId) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(userId));
}

export function deleteUser(userId) {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(Number(userId));
}

export function listUsers() {
  return getDb()
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.created_at, u.last_login_at, u.is_admin,
              u.banned_at, u.ban_reason, u.force_tutorial, u.force_tutorial_at,
              u.ranking_opt_out, s.revision, s.updated_at
       FROM users u LEFT JOIN saves s ON s.user_id = u.id
       ORDER BY u.id`,
    )
    .all();
}

export function setUserAdmin(userId, value) {
  getDb().prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(value ? 1 : 0, Number(userId));
}

export function setUserBanned(userId, banned, reason = '') {
  getDb()
    .prepare('UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?')
    .run(banned ? Date.now() : null, banned ? String(reason || '').slice(0, 200) : null, Number(userId));
  if (banned) deleteUserSessions(userId);
}

export function setUserForceTutorial(userId, value) {
  getDb()
    .prepare('UPDATE users SET force_tutorial = ?, force_tutorial_at = ? WHERE id = ?')
    .run(value ? 1 : 0, value ? Date.now() : null, Number(userId));
}

export function clearUserForceTutorial(userId) {
  getDb()
    .prepare('UPDATE users SET force_tutorial = 0 WHERE id = ? AND force_tutorial = 1')
    .run(Number(userId));
}

export function setUserRankingOptOut(userId, value) {
  getDb().prepare('UPDATE users SET ranking_opt_out = ? WHERE id = ?').run(value ? 1 : 0, Number(userId));
}

export function updateUserPasswordHash(userId, passwordHash) {
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, Number(userId));
}

export function deleteSave(userId) {
  getDb().prepare('DELETE FROM saves WHERE user_id = ?').run(Number(userId));
}

export function insertAudit({ adminId = null, adminName = '', targetId = null, targetName = '', action, detail = '', ip = '' }) {
  getDb()
    .prepare(
      `INSERT INTO admin_audit(admin_id, admin_name, target_id, target_name, action, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      adminId === null ? null : Number(adminId),
      String(adminName || '').slice(0, 40),
      targetId === null ? null : Number(targetId),
      String(targetName || '').slice(0, 40),
      String(action || '').slice(0, 80),
      String(detail || '').slice(0, 500),
      String(ip || '').slice(0, 80),
      Date.now(),
    );
}

export function listAudit(limit = 60) {
  return getDb()
    .prepare(
      `SELECT id, admin_name, target_name, action, detail, ip, created_at
       FROM admin_audit ORDER BY id DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(500, Number(limit) || 60)));
}

export function getSave(userId) {
  const row =
    getDb()
      .prepare('SELECT state_json, revision, updated_at FROM saves WHERE user_id = ?')
      .get(Number(userId)) || null;
  if (!row) return null;
  try {
    return {
      state: JSON.parse(row.state_json),
      revision: Number(row.revision),
      updatedAt: Number(row.updated_at),
    };
  } catch (error) {
    console.warn(`[db] save JSON corrupt for user ${userId}: ${error.message}`);
    return {
      state: null,
      revision: Number(row.revision),
      updatedAt: Number(row.updated_at),
    };
  }
}

export function putSave(userId, state, expectedRevision = null) {
  const json = JSON.stringify(state);
  if (Buffer.byteLength(json, 'utf8') > config.maxStateBytes) {
    const error = new Error('state too large');
    error.code = 'STATE_TOO_LARGE';
    throw error;
  }
  if (expectedRevision !== null && expectedRevision !== undefined) {
    const current = getDb()
      .prepare('SELECT revision FROM saves WHERE user_id = ?')
      .get(Number(userId));
    const revision = current ? Number(current.revision) : 0;
    if (Number(expectedRevision) !== revision) {
      const error = new Error('save revision conflict');
      error.code = 'STATE_CONFLICT';
      error.revision = revision;
      throw error;
    }
  }
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO saves(user_id, state_json, revision, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         state_json = excluded.state_json,
         revision = saves.revision + 1,
         updated_at = excluded.updated_at`,
    )
    .run(Number(userId), json, now);
  return (
    getDb()
      .prepare('SELECT revision, updated_at FROM saves WHERE user_id = ?')
      .get(Number(userId)) || null
  );
}

function pruneSnapshots(dir, keep) {
  const files = snapshotFiles(dir);
  for (const item of files.slice(keep)) {
    try {
      fs.rmSync(item.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function snapshotNow() {
  if (!db) return null;
  try {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
    const file = path.join(
      config.emergencyDir,
      `cartown-${stamp.slice(0, 8)}-${stamp.slice(8, 14)}-${stamp.slice(14)}-${process.pid}.db`,
    );
    const escaped = file.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
    pruneSnapshots(config.emergencyDir, 2);

    if (fs.existsSync(config.nasDir) && fs.statSync(config.nasDir).isDirectory()) {
      try {
        fs.copyFileSync(file, path.join(config.nasDir, path.basename(file)));
        pruneSnapshots(config.nasDir, 30);
      } catch (error) {
        console.warn(`[snapshot] NAS copy failed: ${error.message}`);
      }
    }
    return file;
  } catch (error) {
    console.warn(`[snapshot] failed: ${error.message}`);
    return null;
  }
}

export function startSnapshots() {
  if (snapshotTimer) return;
  snapshotTimer = setInterval(snapshotNow, config.snapshotIntervalMs);
  snapshotTimer.unref?.();
}

export function closeDb() {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  if (!db) return;
  try {
    let file = snapshotNow();
    if (!file) {
      console.warn('[snapshot] closeDb: first snapshot failed, retrying');
      file = snapshotNow();
    }
    if (file) console.log(`[snapshot] closeDb: saved ${path.basename(file)}`);
    else console.error('[snapshot] closeDb: snapshot failed after retry');
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}

const CAR_KEYS = ['model', 'paint', 'roof', 'finish', 'rim', 'rimColor', 'caliper', 'livery', 'liveryColor', 'number', 'spoiler', 'tint', 'neon', 'lower', 'upgrades'];

function pickCfg(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { model: 'hatch' };
  const out = {};
  for (const k of CAR_KEYS) if (cfg[k] !== undefined && cfg[k] !== null) out[k] = cfg[k];
  if (!out.model) out.model = 'hatch';
  return out;
}

function safeCars(state) {
  return (Array.isArray(state?.cars) ? state.cars : []).filter(
    (car) => car && typeof car === 'object' && !Array.isArray(car),
  );
}

function pickCar(state) {
  const cars = safeCars(state);
  const car = cars.find((c) => c.id === state?.activeCar) || cars[0];
  return pickCfg(car?.cfg);
}

function publicUser(user, save = null) {
  if (!user) return null;
  const state = save?.state && typeof save.state === 'object' ? save.state : null;
  const stats = state?.stats && typeof state.stats === 'object' ? state.stats : {};
  const player = state?.player && typeof state.player === 'object' ? state.player : {};
  const name = typeof player.name === 'string' && player.name.trim()
    ? player.name
    : user.display_name || user.username;
  const cars = safeCars(state);
  return {
    id: Number(user.id),
    username: user.username,
    name: String(name),
    avatar: player.avatar && typeof player.avatar === 'object' ? player.avatar : {},
    level: Math.max(1, Number(state?.level) || 1),
    xp: Math.max(0, Number(state?.xp) || 0),
    wins: Math.max(0, Number(stats.wins) || 0),
    races: Math.max(0, Number(stats.races) || 0),
    car: pickCar(state),
    cars: cars.slice(0, 8).map((c) => pickCfg(c.cfg)),
    garageCars: cars.length,
    garageSize: Number(state?.garage?.size) || 0,
    lastLoginAt: user.last_login_at || null,
  };
}

function notify(userId, actorId, type, refId, text) {
  getDb()
    .prepare('INSERT INTO notifications(user_id, actor_id, type, ref_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Number(userId), actorId === null ? null : Number(actorId), String(type).slice(0, 30), refId === null ? null : Number(refId), String(text).slice(0, 200), Date.now());
}

function notifyOnce(userId, actorId, type, refId, text, windowMs = 0) {
  const cutoff = windowMs > 0 ? Date.now() - windowMs : 0;
  const exists = getDb()
    .prepare(
      `SELECT 1 FROM notifications
       WHERE user_id = ? AND actor_id = ? AND type = ? AND ref_id IS ?
         AND created_at >= ? LIMIT 1`,
    )
    .get(Number(userId), actorId === null ? null : Number(actorId), String(type), refId === null ? null : Number(refId), cutoff);
  if (!exists) notify(userId, actorId, type, refId, text);
}

export function listFriends(userId) {
  const rows = getDb()
    .prepare(
      `SELECT u.* FROM friends f JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ? AND u.banned_at IS NULL ORDER BY u.display_name COLLATE NOCASE`,
    )
    .all(Number(userId));
  return rows.map((u) => publicUser(u, getSave(u.id)));
}

function ensureFriendship(userId, targetId) {
  const now = Date.now();
  const ins = getDb().prepare('INSERT OR IGNORE INTO friends(user_id, friend_id, created_at) VALUES (?, ?, ?)');
  const a = ins.run(Number(userId), Number(targetId), now);
  ins.run(Number(targetId), Number(userId), now);
  if (Number(a.changes) > 0) {
    const me = getUserById(userId);
    notify(targetId, userId, 'friend', userId, `${me?.display_name || me?.username || 'Player'} te añadió como amigo`);
  }
  return Number(a.changes) > 0;
}

function resolveFriendTarget(ref) {
  if (ref && typeof ref === 'object') {
    if (ref.userId !== undefined && ref.userId !== null) return getUserById(Number(ref.userId));
    ref = ref.username;
  }
  const text = String(ref ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return getUserById(Number(text));
  return getUserByUsername(text.replace(/^@/, ''));
}

export function addFriend(userId, targetRef) {
  const target = resolveFriendTarget(targetRef);
  if (!target || target.banned_at) return { ok: false, error: 'user_not_found' };
  if (Number(target.id) === Number(userId)) return { ok: false, error: 'self' };
  ensureFriendship(userId, target.id);
  return { ok: true, friend: publicUser(target, getSave(target.id)) };
}

function normalizeProfileName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function linkFriendByProfile(userId, profile = {}) {
  const me = getUserById(userId);
  if (!me) return { ok: false, error: 'user_not_found' };
  let target = null;
  if (profile.username) target = getUserByUsername(String(profile.username).replace(/^@/, ''));
  if (!target) {
    const name = normalizeProfileName(profile.name);
    if (!name) return { ok: false, error: 'not_found' };
    const level = Number(profile.level) || 0;
    const model = String(profile.model || '');
    const rows = getDb().prepare('SELECT * FROM users WHERE banned_at IS NULL AND id <> ?').all(Number(userId));
    const matches = [];
    for (const row of rows) {
      const pub = publicUser(row, getSave(row.id));
      if (normalizeProfileName(pub.name) !== name) continue;
      if (level && Number(pub.level) !== level) continue;
      if (model && String(pub.car?.model || '') !== model) continue;
      matches.push(row);
    }
    if (matches.length > 1) return { ok: false, error: 'ambiguous' };
    target = matches[0] || null;
  }
  if (!target || target.banned_at) return { ok: false, error: 'not_found' };
  if (Number(target.id) === Number(userId)) return { ok: false, error: 'self' };
  const created = ensureFriendship(userId, target.id);
  return { ok: true, created, friend: publicUser(target, getSave(target.id)) };
}

function areFriends(userId, otherId) {
  return Boolean(getDb().prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(Number(userId), Number(otherId)));
}

export function sendMessage(senderId, recipientId, body) {
  const text = String(body || '').trim().slice(0, 500);
  if (!text) return { ok: false, error: 'empty' };
  const recipient = getUserById(recipientId);
  if (!recipient || recipient.banned_at) return { ok: false, error: 'user_not_found' };
  if (Number(senderId) === Number(recipientId)) return { ok: false, error: 'self' };
  if (!areFriends(senderId, recipientId)) return { ok: false, error: 'not_friend' };
  const result = getDb()
    .prepare('INSERT INTO messages(sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(Number(senderId), Number(recipientId), text, Date.now());
  const me = getUserById(senderId);
  notifyOnce(recipientId, senderId, 'message', Number(result.lastInsertRowid), `${me?.display_name || me?.username || 'Player'} te envió un mensaje`, 60 * 1000);
  return { ok: true, message: { id: Number(result.lastInsertRowid), body: text, createdAt: Date.now(), mine: true } };
}

export function listMessages(userId, otherId, limit = 120) {
  const other = getUserById(otherId);
  if (!other || other.banned_at) return { ok: false, error: 'user_not_found' };
  if (!areFriends(userId, otherId)) return { ok: false, error: 'not_friend' };
  getDb()
    .prepare('UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL')
    .run(Date.now(), Number(otherId), Number(userId));
  const rows = getDb()
    .prepare(
      `SELECT * FROM (SELECT * FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
        ORDER BY id DESC LIMIT ?) ORDER BY id ASC`,
    )
    .all(Number(userId), Number(otherId), Number(otherId), Number(userId), Math.max(1, Math.min(300, Number(limit) || 120)));
  return {
    ok: true,
    other: publicUser(other, getSave(other.id)),
    messages: rows.map((m) => ({
      id: Number(m.id),
      body: m.body,
      createdAt: Number(m.created_at),
      mine: Number(m.sender_id) === Number(userId),
      read: Boolean(m.read_at),
    })),
  };
}

export function listMessageThreads(userId) {
  const rows = getDb()
    .prepare('SELECT * FROM messages WHERE sender_id = ? OR recipient_id = ? ORDER BY id DESC')
    .all(Number(userId), Number(userId));
  const byOther = new Map();
  for (const m of rows) {
    const otherId = Number(m.sender_id) === Number(userId) ? Number(m.recipient_id) : Number(m.sender_id);
    if (byOther.has(otherId)) continue;
    const user = getUserById(otherId);
    if (!user || user.banned_at) continue;
    byOther.set(otherId, {
      user: publicUser(user, getSave(otherId)),
      last: m.body,
      createdAt: Number(m.created_at),
      mine: Number(m.sender_id) === Number(userId),
      unread: Number(getDb().prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').get(otherId, Number(userId))?.n || 0),
    });
  }
  return [...byOther.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
}

export function messageUnread(userId) {
  return Number(getDb().prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL').get(Number(userId))?.n || 0);
}

export function reportFriendRace(userId, opponentId, opponentWon) {
  if (!areFriends(userId, opponentId)) return { ok: false, error: 'not_friend' };
  const opponent = getUserById(opponentId);
  const me = getUserById(userId);
  if (!opponent || opponent.banned_at || !me) return { ok: false, error: 'user_not_found' };
  const won = Boolean(opponentWon);
  const mePub = publicUser(me, getSave(userId));
  const coins = won ? 120 + (Math.max(1, Number(mePub?.level) || 1) * 20) : 0;
  const xp = won ? 25 : 6;
  const racerName = String(mePub?.name || me.display_name || me.username || 'Player').slice(0, 80);
  const result = getDb()
    .prepare('INSERT INTO friend_races(user_id, opponent_id, opponent_name, won, coins, xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(Number(opponentId), Number(userId), racerName, won ? 1 : 0, coins, xp, Date.now());
  notify(opponentId, userId, 'race', Number(result.lastInsertRowid), `${racerName} ${won ? 'perdió' : 'ganó'} la carrera contra ti`);
  return { ok: true };
}

export function claimFriendRaces(userId) {
  const rows = getDb()
    .prepare('SELECT * FROM friend_races WHERE user_id = ? AND claimed_at IS NULL ORDER BY id ASC LIMIT 20')
    .all(Number(userId));
  if (!rows.length) return { ok: true, results: [] };
  const now = Date.now();
  const mark = getDb().prepare('UPDATE friend_races SET claimed_at = ? WHERE id = ?');
  for (const r of rows) mark.run(now, Number(r.id));
  return {
    ok: true,
    results: rows.map((r) => ({
      id: Number(r.id),
      opponentName: r.opponent_name,
      won: Boolean(r.won),
      coins: Number(r.coins) || 0,
      xp: Number(r.xp) || 0,
      createdAt: Number(r.created_at),
    })),
  };
}

export function removeFriend(userId, friendId) {
  getDb().prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
    .run(Number(userId), Number(friendId), Number(friendId), Number(userId));
  return { ok: true };
}

export function listWall(userId, limit = 50) {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.user_id, p.author_id, p.body, p.created_at, u.display_name,
              (SELECT COUNT(*) FROM wall_likes l WHERE l.post_id = p.id) AS likes,
              EXISTS(SELECT 1 FROM wall_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
       FROM wall_posts p JOIN users u ON u.id = p.author_id
       ORDER BY p.id DESC LIMIT ?`,
    )
    .all(Number(userId), Math.max(1, Math.min(100, Number(limit) || 50)));
  return rows.map((r) => {
    const author = publicUser(getUserById(r.author_id), getSave(r.author_id));
    return {
      id: Number(r.id),
      body: r.body,
      createdAt: Number(r.created_at),
      likes: Number(r.likes),
      liked: Boolean(r.liked),
      mine: Number(r.author_id) === Number(userId),
      author,
    };
  });
}

export function createWallPost(userId, body) {
  const text = String(body || '').trim().slice(0, 500);
  if (!text) return { ok: false, error: 'empty' };
  const result = getDb()
    .prepare('INSERT INTO wall_posts(user_id, author_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(Number(userId), Number(userId), text, Date.now());
  const me = getUserById(userId);
  const friends = getDb().prepare('SELECT friend_id FROM friends WHERE user_id = ?').all(Number(userId));
  for (const f of friends) notify(f.friend_id, userId, 'wall', Number(result.lastInsertRowid), `${me?.display_name || 'Player'} publicó en el muro`);
  return { ok: true, wall: listWall(userId, 1) };
}

export function toggleLike(postId, userId) {
  const post = getDb().prepare('SELECT id, author_id FROM wall_posts WHERE id = ?').get(Number(postId));
  if (!post) return { ok: false, error: 'not_found' };
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  let liked;
  try {
    const existing = db.prepare('SELECT 1 FROM wall_likes WHERE post_id = ? AND user_id = ?').get(Number(postId), Number(userId));
    if (existing) {
      db.prepare('DELETE FROM wall_likes WHERE post_id = ? AND user_id = ?').run(Number(postId), Number(userId));
    } else {
      db.prepare('INSERT OR IGNORE INTO wall_likes(post_id, user_id, created_at) VALUES (?, ?, ?)').run(Number(postId), Number(userId), Date.now());
    }
    liked = !existing;
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
  if (liked && Number(post.author_id) !== Number(userId)) {
    const me = getUserById(userId);
    notifyOnce(post.author_id, userId, 'like', Number(postId), `${me?.display_name || 'Player'} le gustó tu publicación`);
  }
  const count = getDb().prepare('SELECT COUNT(*) AS n FROM wall_likes WHERE post_id = ?').get(Number(postId))?.n || 0;
  return { ok: true, liked, likes: Number(count) };
}

export function createChallenge(userId, opponentId) {
  if (Number(userId) === Number(opponentId)) return { ok: false, error: 'self' };
  const friend = getDb().prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(Number(userId), Number(opponentId));
  if (!friend) return { ok: false, error: 'not_friend' };
  const opponent = getUserById(opponentId);
  if (!opponent || opponent.banned_at) return { ok: false, error: 'user_not_found' };
  const car = pickCar(getSave(userId)?.state);
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  let challengeId;
  try {
    const pending = db.prepare("SELECT 1 FROM challenges WHERE challenger_id = ? AND opponent_id = ? AND status = 'pending'").get(Number(userId), Number(opponentId));
    if (pending) {
      db.exec('ROLLBACK');
      return { ok: false, error: 'already_pending' };
    }
    const result = db
      .prepare("INSERT INTO challenges(challenger_id, opponent_id, car_json, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
      .run(Number(userId), Number(opponentId), JSON.stringify(car), Date.now());
    challengeId = Number(result.lastInsertRowid);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
  const me = getUserById(userId);
  notifyOnce(opponentId, userId, 'challenge', challengeId, `${me?.display_name || 'Player'} te ha lanzado un reto`);
  return { ok: true };
}

export function listChallenges(userId) {
  const rows = getDb()
    .prepare(
      `SELECT c.* FROM challenges c
       WHERE (c.opponent_id = ? AND c.status = 'pending')
          OR (c.challenger_id = ? AND c.created_at > ?)
       ORDER BY c.id DESC LIMIT 40`,
    )
    .all(Number(userId), Number(userId), Date.now() - 7 * 86400000);
  return rows.map((c) => {
    let car = { model: 'hatch' };
    try { car = JSON.parse(c.car_json); } catch { /* ignore */ }
    return {
      id: Number(c.id),
      status: c.status,
      createdAt: Number(c.created_at),
      incoming: Number(c.opponent_id) === Number(userId),
      car,
      challenger: publicUser(getUserById(c.challenger_id), getSave(c.challenger_id)),
      opponent: publicUser(getUserById(c.opponent_id), getSave(c.opponent_id)),
    };
  });
}

export function respondChallenge(userId, challengeId, accept) {
  const c = getDb().prepare("SELECT * FROM challenges WHERE id = ? AND opponent_id = ? AND status = 'pending'").get(Number(challengeId), Number(userId));
  if (!c) return { ok: false, error: 'not_found' };
  const status = accept ? 'accepted' : 'declined';
  getDb().prepare('UPDATE challenges SET status = ?, responded_at = ? WHERE id = ?').run(status, Date.now(), Number(c.id));
  const me = getUserById(userId);
  notify(c.challenger_id, userId, 'challenge_reply', Number(c.id), `${me?.display_name || 'Player'} ${accept ? 'aceptó' : 'rechazó'} tu reto`);
  let car = { model: 'hatch' };
  try { car = JSON.parse(c.car_json); } catch { /* ignore */ }
  return {
    ok: true,
    accepted: Boolean(accept),
    challenge: {
      id: Number(c.id),
      car,
      challenger: publicUser(getUserById(c.challenger_id), getSave(c.challenger_id)),
    },
  };
}

function publicGarage(state) {
  const garage = state?.garage && typeof state.garage === 'object' ? state.garage : {};
  const items = (Array.isArray(garage.items) ? garage.items : []).slice(0, 600).filter((it) => it && typeof it === 'object').map((it) => ({
    uid: String(it.uid || ''),
    type: String(it.type || ''),
    x: Number(it.x) || 0,
    z: Number(it.z) || 0,
    rot: Number(it.rot) || 0,
    wall: it.wall === 'x' || it.wall === 'z' ? it.wall : undefined,
  })).filter((it) => it.type);
  const turntableUids = new Set(items.filter((it) => it.type === 'turntable').map((it) => it.uid));
  const mounted = new Set();
  const cars = safeCars(state)
    .filter((car) => car.placed && typeof car.placed === 'object')
    .slice(0, 60)
    .map((car) => {
      const uid = String(car.placed.mountUid || '');
      const mountUid = turntableUids.has(uid) && !mounted.has(uid) ? uid : null;
      if (mountUid) mounted.add(mountUid);
      return {
        id: String(car.id || ''),
        cfg: pickCfg(car.cfg),
        placed: {
          x: Number(car.placed.x) || 0,
          z: Number(car.placed.z) || 0,
          rot: Number(car.placed.rot) || 0,
          ...(mountUid ? { mountUid } : {}),
        },
      };
    });
  return {
    size: Math.max(1, Math.min(100, Number(garage.size) || 14)),
    floor: typeof garage.floor === 'string' ? garage.floor : 'tile',
    wall: typeof garage.wall === 'string' ? garage.wall : 'white',
    items,
    cars,
  };
}

export function visitBot(userId, botId) {
  const bot = getBot(botId);
  if (!bot || !bot.active || !bot.visitable) return { ok: false, error: 'not_found' };
  const garage = bot.garage && typeof bot.garage === 'object' ? bot.garage : publicGarage({
    garage: { size: 16, floor: 'tile', wall: 'white', items: [] },
    cars: [{ id: 'bot-car-1', cfg: bot.car, placed: { x: 8, z: 8, rot: 0 } }],
    activeCar: 'bot-car-1',
  });
  void userId;
  return {
    ok: true,
    host: {
      id: `bot-${bot.id}`,
      botId: bot.id,
      isBot: true,
      username: `@${bot.handle}`,
      name: bot.name,
      avatar: bot.avatar,
      level: bot.level,
      xp: bot.xp,
      wins: bot.wins,
      races: bot.races,
      car: bot.car,
      cars: [bot.car],
      garageCars: (garage.cars || []).length,
      garageSize: garage.size || 0,
      garage,
      likes: 0,
      liked: false,
      lastLoginAt: null,
    },
  };
}

export function recordVisit(userId, hostId, { preview = false } = {}) {
  const host = getUserById(hostId);
  if (!host || host.banned_at) return { ok: false, error: 'user_not_found' };
  if (Number(userId) === Number(hostId)) return { ok: false, error: 'self' };
  const friend = getDb().prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(Number(userId), Number(hostId));
  if (!friend) return { ok: false, error: 'not_friend' };
  const now = Date.now();
  const recent = getDb()
    .prepare('SELECT 1 FROM visits WHERE host_id = ? AND visitor_id = ? AND created_at >= ? LIMIT 1')
    .get(Number(hostId), Number(userId), now - 10 * 60 * 1000);
  if (!recent && !preview) {
    getDb().prepare('INSERT INTO visits(host_id, visitor_id, created_at) VALUES (?, ?, ?)').run(Number(hostId), Number(userId), now);
    const me = getUserById(userId);
    notifyOnce(hostId, userId, 'visit', null, `${me?.display_name || 'Player'} visitó tu garaje`, 10 * 60 * 1000);
  }
  const save = getSave(hostId);
  return {
    ok: true,
    host: {
      ...publicUser(host, save),
      garage: publicGarage(save?.state),
      likes: garageLikeCount(hostId),
      liked: garageLikedBy(hostId, userId),
    },
  };
}

export function listRanking(userId, limit = 50) {
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.last_login_at, u.ranking_opt_out, s.state_json
       FROM users u LEFT JOIN saves s ON s.user_id = u.id
       WHERE u.banned_at IS NULL ORDER BY u.id`,
    )
    .all();
  const me = rows.find((r) => Number(r.id) === Number(userId));
  const list = rows
    .filter((r) => !r.ranking_opt_out)
    .map((r) => {
      let state = null;
      try { state = r.state_json ? JSON.parse(r.state_json) : null; } catch { /* ignore */ }
      return publicUser(r, { state });
    })
    .filter((u) => u.level > 1 || u.xp > 0 || u.wins > 0 || u.garageCars > 0)
    .concat(listBots().filter((bot) => bot.active).map((bot) => ({
      id: `bot-${bot.id}`,
      botId: bot.id,
      isBot: true,
      username: `@${bot.handle}`,
      name: bot.name,
      avatar: bot.avatar,
      level: bot.level,
      xp: bot.xp,
      wins: bot.wins,
      races: bot.races,
      car: bot.car,
      garageCars: (bot.garage?.cars || []).length,
      garageSize: bot.garage?.size || 0,
    })))
    .sort((a, b) => b.level - a.level || b.xp - a.xp || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 50)))
    .map((u, i) => ({ ...u, rank: i + 1 }));
  return { ranking: list, optOut: Boolean(me?.ranking_opt_out) };
}

export function listNotifications(userId, limit = 40) {
  return getDb()
    .prepare('SELECT id, type, ref_id, text, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(Number(userId), Math.max(1, Math.min(100, Number(limit) || 40)))
    .map((n) => ({ id: Number(n.id), type: n.type, refId: n.ref_id, text: n.text, createdAt: Number(n.created_at), read: Boolean(n.read_at) }));
}

export function markNotificationsRead(userId) {
  getDb().prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(Date.now(), Number(userId));
  return { ok: true };
}

export function socialUnread(userId) {
  return Number(getDb().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(Number(userId))?.n || 0);
}
