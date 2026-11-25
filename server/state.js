// Server-side validation for saves submitted by the game client. The game is
// trusted-ish (same account) but a corrupt or hand-crafted payload must never
// poison the ranking or crash the social endpoints, so every field that other
// users can see is normalised here before it reaches SQLite.

const LIMITS = {
  cars: 200,
  garageItems: 600,
  friends: 200,
  jobs: 80,
  goals: 60,
  text: 80,
};

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value, max = LIMITS.text, fallback = '') {
  if (typeof value === 'string') return value.slice(0, max);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, max);
  return fallback;
}

function whole(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function number(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function timestamp(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, Date.now() + 86400000) : fallback;
}

function list(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function cleanConfig(raw) {
  const src = isObject(raw) ? raw : {};
  const cfg = { ...src, model: text(src.model, 40, 'hatch') || 'hatch' };
  const upgrades = isObject(src.upgrades) ? src.upgrades : {};
  cfg.upgrades = Object.fromEntries(
    Object.entries(upgrades)
      .slice(0, 40)
      .map(([key, value]) => [text(key, 40), whole(value, 0, 20, 0)]),
  );
  return cfg;
}

function cleanPlacement(raw) {
  if (!isObject(raw)) return null;
  return {
    x: number(raw.x, -5, 1000, 0),
    z: number(raw.z, -5, 1000, 0),
    rot: whole(raw.rot, 0, 3, 0),
    ...(raw.mountUid ? { mountUid: text(raw.mountUid, 80) } : {}),
  };
}

function cleanCar(raw) {
  if (!isObject(raw)) return null;
  const id = text(raw.id, 80);
  if (!id) return null;
  return { ...raw, id, cfg: cleanConfig(raw.cfg), placed: cleanPlacement(raw.placed) };
}

function cleanItem(raw) {
  if (!isObject(raw)) return null;
  const type = text(raw.type, 40);
  if (!type) return null;
  const item = {
    ...raw,
    uid: text(raw.uid, 80),
    type,
    x: number(raw.x, -5, 1000, 0),
    z: number(raw.z, -5, 1000, 0),
    rot: whole(raw.rot, 0, 3, 0),
  };
  if (!item.uid) item.uid = `it-${type}-${item.x}-${item.z}`;
  return item;
}

function cleanStringList(value, max) {
  return list(value, max).filter((entry) => typeof entry === 'string').map((entry) => entry.slice(0, 80));
}

function cleanGoals(raw) {
  if (raw === null) return null;
  if (!isObject(raw)) return null;
  return {
    ...raw,
    day: text(raw.day, 20),
    list: list(raw.list, LIMITS.goals)
      .filter(isObject)
      .map((goal) => ({
        id: text(goal.id, 40),
        progress: whole(goal.progress, 0, 1000000, 0),
        claimed: Boolean(goal.claimed),
      }))
      .filter((goal) => goal.id),
  };
}

export function sanitizeState(raw) {
  if (!isObject(raw)) {
    const error = new Error('invalid state');
    error.code = 'INVALID_STATE';
    throw error;
  }

  const player = isObject(raw.player) ? raw.player : {};
  const stats = isObject(raw.stats) ? raw.stats : {};
  const garage = isObject(raw.garage) ? raw.garage : {};
  const settings = isObject(raw.settings) ? raw.settings : {};
  const items = list(garage.items, LIMITS.garageItems).map(cleanItem).filter(Boolean);
  const cars = list(raw.cars, LIMITS.cars).map(cleanCar).filter(Boolean);
  const turntableUids = new Set(items.filter((it) => it.type === 'turntable').map((it) => it.uid));
  const mounted = new Set();
  for (const car of cars) {
    const uid = car.placed?.mountUid;
    if (!uid || !turntableUids.has(uid) || mounted.has(uid)) delete car.placed.mountUid;
    else mounted.add(uid);
  }
  const activeCar = cars.some((car) => car.id === raw.activeCar) ? raw.activeCar : cars[0]?.id ?? null;

  return {
    ...raw,
    version: 1,
    started: Boolean(raw.started),
    player: {
      ...player,
      name: text(player.name, 20, 'Player') || 'Player',
      avatar: isObject(player.avatar) ? player.avatar : {},
    },
    coins: whole(raw.coins, 0, 1e12, 0),
    cash: whole(raw.cash, 0, 1e9, 0),
    xp: whole(raw.xp, 0, 1e12, 0),
    level: whole(raw.level, 1, 500, 1),
    fuel: whole(raw.fuel, 0, 999, 0),
    fuelTs: timestamp(raw.fuelTs, Date.now()),
    cars,
    activeCar,
    garage: {
      ...garage,
      size: [14, 16, 18, 20, 22].includes(whole(garage.size, 1, 100, 14)) ? whole(garage.size, 1, 100, 14) : 14,
      floor: text(garage.floor, 40, 'tile') || 'tile',
      wall: text(garage.wall, 40, 'white') || 'white',
      ownedFloors: cleanStringList(garage.ownedFloors, 60),
      ownedWalls: cleanStringList(garage.ownedWalls, 60),
      items,
    },
    friends: list(raw.friends, LIMITS.friends).filter(isObject),
    stats: {
      ...stats,
      served: whole(stats.served, 0, 1e12, 0),
      races: whole(stats.races, 0, 1e12, 0),
      wins: whole(stats.wins, 0, 1e12, 0),
      earned: whole(stats.earned, 0, 1e15, 0),
      driven: number(stats.driven, 0, 1e15, 0),
    },
    goals: cleanGoals(raw.goals),
    jobs: list(raw.jobs, LIMITS.jobs).filter(isObject),
    staff: {
      mechanics: whole(isObject(raw.staff) ? raw.staff.mechanics : 2, 2, 6, 2),
    },
    settings: {
      ...settings,
      sfx: settings.sfx !== false,
      music: settings.music !== false,
      lang: ['es', 'en', 'pt'].includes(settings.lang) ? settings.lang : 'es',
      quality: ['low', 'medium', 'high'].includes(settings.quality) ? settings.quality : 'high',
      tutorialDone: Boolean(settings.tutorialDone),
    },
  };
}
