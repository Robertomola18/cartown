const ITEMS = {
  lift: { w: 3, d: 2, level: 1, station: 'lift' },
  washbay: { w: 3, d: 2, level: 3, station: 'wash' },
  paintbooth: { w: 3, d: 2, level: 6, station: 'paint' },
  toolchest: { w: 1, d: 1, level: 1 },
  tirerack: { w: 2, d: 1, level: 1 },
  workbench: { w: 2, d: 1, level: 1 },
  desk: { w: 2, d: 1, level: 1 },
  compressor: { w: 1, d: 1, level: 1 },
  barrels: { w: 1, d: 1, level: 1 },
  cones: { w: 1, d: 1, level: 1 },
  plant: { w: 1, d: 1, level: 1 },
  stopsign: { w: 1, d: 1, level: 1 },
  flag: { w: 1, d: 1, level: 2 },
  xmastree: { w: 1, d: 1, level: 2 },
  palm: { w: 1, d: 1, level: 3 },
  trophy: { w: 1, d: 1, level: 4 },
  statue: { w: 1, d: 1, level: 5 },
  turntable: { w: 3, d: 3, level: 8 },
  arcade: { w: 1, d: 1, level: 2 },
  vending: { w: 1, d: 1, level: 1 },
  sofa: { w: 2, d: 1, level: 2 },
  jukebox: { w: 1, d: 1, level: 3 },
  airhockey: { w: 2, d: 1, level: 5 },
  diner: { w: 2, d: 2, level: 6 },
  poster: { w: 1, d: 1, level: 1, wall: true },
  neonsign: { w: 2, d: 1, level: 3, wall: true },
  clock: { w: 1, d: 1, level: 1, wall: true },
  shelf: { w: 2, d: 1, level: 2, wall: true },
  hydraulicJack: { w: 1, d: 1, level: 1 },
  drill: { w: 1, d: 1, level: 1 },
  welder: { w: 1, d: 1, level: 2 },
  obdScanner: { w: 1, d: 1, level: 3 },
  jumpCables: { w: 1, d: 1, level: 1 },
  oilCan: { w: 1, d: 1, level: 1 },
  boxShelf: { w: 2, d: 1, level: 2 },
  pegboard: { w: 2, d: 1, level: 2, wall: true },
  metalLocker: { w: 1, d: 1, level: 3 },
  cratePallet: { w: 2, d: 2, level: 2 },
  ledBar: { w: 2, d: 1, level: 4 },
  tripodLight: { w: 1, d: 1, level: 3 },
  amberBeacon: { w: 1, d: 1, level: 2 },
  chalkboard: { w: 2, d: 1, level: 2, wall: true },
  fireExtinguisher: { w: 1, d: 1, level: 1 },
  firstAid: { w: 1, d: 1, level: 1 },
  wallPlaque: { w: 2, d: 1, level: 4, wall: true },
  filingCabinet: { w: 1, d: 1, level: 2 },
  miniFridge: { w: 1, d: 1, level: 4 },
  coffeeMachine: { w: 1, d: 1, level: 4 },
};
const FLOORS = { tile: {}, concrete: { level: 1 }, checker: { level: 2 }, wood: { level: 3 }, dark: { level: 4 }, blue: { level: 5 } };
const WALLS = { white: {}, yellow: { level: 1 }, brick: { level: 2 }, blue: { level: 3 }, dark: { level: 4 }, racing: { level: 6 } };
const EXPANSIONS = [{ size: 14, level: 1 }, { size: 16, level: 3 }, { size: 18, level: 6 }, { size: 20, level: 10 }, { size: 22, level: 14 }];
const MODELS = {
  hatch: { level: 1 }, sedan: { level: 2 }, muscle: { level: 5 }, pickup: { level: 4 },
  van: { level: 3 }, taxi: { level: 2 }, police: { level: 6 }, coupe: { level: 7 },
  super: { level: 12 }, offroad: { level: 4 }, beetle: { level: 1 }, rally: { level: 5 }, suv: { level: 3 },
  smart2: { level: 1 }, ioniq3: { level: 3 }, amgsuv: { level: 8 }, vapid: { level: 5 },
  frontera: { level: 2 }, musso: { level: 6 },
};
const MODEL_IDS = Object.keys(MODELS);

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(value) {
  let s = value >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function footprint(type, rot) {
  const def = ITEMS[type];
  const w = rot % 2 ? def.d : def.w;
  const d = rot % 2 ? def.w : def.d;
  return { w, d };
}

function unlocked(map, level) {
  return Object.keys(map).filter((id) => !map[id].level || level >= map[id].level);
}

const THEMES = {
  detailing: {
    label: 'detailing-spa',
    floors: ['tile', 'checker', 'wood', 'blue'],
    walls: ['white', 'yellow', 'blue'],
    station: 'washbay',
    featured: ['washbay', 'oilCan', 'plant', 'palm', 'xmastree', 'tripodLight', 'sofa', 'coffeeMachine', 'firstAid'],
    pool: ['plant', 'oilCan', 'coffeeMachine', 'toolchest', 'cones', 'vending', 'firstAid', 'workbench', 'jukebox', 'palm', 'tripodLight', 'barrels', 'miniFridge'],
    wallPool: ['wallPlaque', 'pegboard', 'poster', 'chalkboard', 'clock', 'neonsign'],
    anchors: [[1, 4], [1, 8], [5, 1], [9, 1]],
    carAnchor: [8, 8],
    turntableAnchor: [2, 2],
    wallSides: ['z', 'z', 'x'],
  },
  tuning: {
    label: 'tuning-performance',
    floors: ['dark', 'concrete', 'blue', 'checker'],
    walls: ['dark', 'blue', 'racing', 'brick'],
    station: 'lift',
    featured: ['obdScanner', 'compressor', 'tirerack', 'drill', 'hydraulicJack', 'jumpCables', 'ledBar', 'welder', 'metalLocker'],
    pool: ['toolchest', 'oilCan', 'drill', 'barrels', 'workbench', 'filingCabinet', 'tirerack', 'compressor', 'coffeeMachine', 'jumpCables', 'ledBar', 'welder'],
    wallPool: ['pegboard', 'shelf', 'wallPlaque', 'clock', 'neonsign'],
    anchors: [[8, 4], [8, 8], [4, 1], [1, 8]],
    carAnchor: [1, 6],
    turntableAnchor: [1, 1],
    wallSides: ['x', 'z', 'x'],
  },
  racing: {
    label: 'racing-trophies',
    floors: ['blue', 'checker', 'dark', 'tile'],
    walls: ['racing', 'dark', 'blue', 'brick'],
    station: 'lift',
    featured: ['flag', 'flag', 'trophy', 'statue', 'diner', 'arcade', 'amberBeacon', 'ledBar', 'jukebox'],
    pool: ['flag', 'trophy', 'cones', 'arcade', 'vending', 'sofa', 'airhockey', 'coffeeMachine', 'jukebox', 'ledBar', 'statue', 'miniFridge'],
    wallPool: ['neonsign', 'wallPlaque', 'poster', 'chalkboard', 'clock'],
    anchors: [[1, 4], [11, 1], [11, 8], [1, 11]],
    carAnchor: [10, 2],
    turntableAnchor: [6, 6],
    wallSides: ['z', 'x', 'z', 'x'],
  },
  auto: {
    label: 'auto-garage',
    floors: ['tile', 'concrete', 'checker', 'wood', 'dark', 'blue'],
    walls: ['white', 'yellow', 'brick', 'blue', 'dark', 'racing'],
    station: null,
    featured: [],
    pool: [],
    wallPool: [],
    anchors: [[1, 1], [7, 1], [1, 7], [7, 7]],
    carAnchor: [5, 5],
    turntableAnchor: [2, 2],
    wallSides: ['z', 'x'],
  },
};

function themeFor(bot) {
  const identity = `${bot?.id || ''}|${bot?.handle || ''}|${bot?.name || ''}`.toLowerCase();
  if (identity.includes('daisy')) return 'detailing';
  if (identity.includes('eddy')) return 'tuning';
  if (identity.includes('zoni')) return 'racing';
  return 'auto';
}

export function generateBotGarage(bot = {}) {
  const level = Math.max(1, Math.min(500, Number(bot.level) || 1));
  const seed = hash(`${bot.handle || bot.name || ''}|${bot.id || ''}|${level}`);
  const rand = seeded(seed);
  const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
  const size = [...EXPANSIONS].reverse().find((e) => level >= e.level)?.size || 14;
  const floors = unlocked(FLOORS, level);
  const walls = unlocked(WALLS, level);
  const theme = THEMES[themeFor(bot)];
  const prefer = (list, options) => {
    const valid = options.filter((id) => list.includes(id));
    return valid.length ? valid[seed % valid.length] : list[list.length - 1];
  };
  const floor = prefer(floors, theme.floors);
  const wall = prefer(walls, theme.walls);
  const taken = new Set();
  const wallTaken = { x: new Set(), z: new Set() };
  const reserve = (x, z, w, d) => {
    for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) taken.add(`${i},${j}`);
  };
  const freeSpot = (w, d, ax = 1, az = 1) => {
    const scan = (sx, sz) => {
      for (let z = Math.max(1, sz); z + d <= size - 1; z++) {
        for (let x = Math.max(1, sx); x + w <= size - 1; x++) {
          let ok = true;
          for (let i = x; i < x + w && ok; i++) for (let j = z; j < z + d; j++) if (taken.has(`${i},${j}`)) { ok = false; break; }
          if (ok) return { x, z };
        }
      }
      return null;
    };
    return scan(ax, az) || scan(1, 1);
  };
  const freeWall = (side, span) => {
    const set = wallTaken[side];
    for (let pass = 0; pass < 2; pass++) {
      const from = pass ? 1 : 1 + (seed % 3);
      for (let i = from; i + span <= size - 1; i++) {
        let ok = true;
        for (let k = i; k < i + span; k++) if (set.has(k)) { ok = false; break; }
        if (ok) {
          for (let k = i; k < i + span; k++) set.add(k);
          return i;
        }
      }
    }
    return null;
  };
  const items = [];
  const cars = [];
  let uidCount = 0;
  const nextUid = (prefix) => `${prefix}-bot-${seed.toString(36)}-${++uidCount}`;
  const addItem = (type, ax = 1, az = 1) => {
    if (!type || !ITEMS[type] || (ITEMS[type].level || 1) > level) return false;
    const rot = Math.floor(rand() * 4) % 4;
    const f = footprint(type, rot);
    const spot = freeSpot(f.w, f.d, ax, az);
    if (!spot) return false;
    reserve(spot.x, spot.z, f.w, f.d);
    items.push({ uid: nextUid('it'), type, x: spot.x, z: spot.z, rot });
    return true;
  };
  const addWallItem = (type, side) => {
    const def = ITEMS[type];
    if (!def?.wall || (def.level || 1) > level) return false;
    const at = freeWall(side, def.w);
    if (at === null) return false;
    items.push({ uid: nextUid('it'), type, x: side === 'z' ? at : 0, z: side === 'x' ? at : 0, rot: 0, wall: side });
    return true;
  };
  let turntable = null;
  if (level >= 8) {
    const spot = freeSpot(3, 3, theme.turntableAnchor[0], theme.turntableAnchor[1]);
    if (spot) {
      turntable = { uid: nextUid('it'), type: 'turntable', x: spot.x, z: spot.z, rot: 0 };
      items.push(turntable);
      reserve(spot.x, spot.z, 3, 3);
    }
  }
  const models = MODEL_IDS.filter((id) => !MODELS[id].custom && (MODELS[id].level || 1) <= level);
  const palette = ['#d9262b', '#2f6fd6', '#ffb300', '#2fbf71', '#7b4bd6', '#121316', '#ff6fb3'];
  const base = bot.car && typeof bot.car === 'object' ? { ...bot.car } : {};
  const primary = {
    ...base,
    model: models.includes(base.model) ? base.model : pick(models),
    paint: base.paint || palette[seed % palette.length],
  };
  const carCount = Math.min(4, 1 + Math.floor(level / 12));
  for (let i = 0; i < carCount; i++) {
    const cfg = i === 0 ? primary : { ...primary, model: pick(models), paint: palette[(seed + i * 3) % palette.length] };
    const mounted = i === 0 && turntable;
    const spot = mounted ? turntable : freeSpot(3, 2, theme.carAnchor[0], theme.carAnchor[1]);
    if (!spot) break;
    if (!mounted) reserve(spot.x, spot.z, 3, 2);
    cars.push({
      id: nextUid('car'),
      cfg,
      placed: { x: spot.x, z: spot.z, rot: 0, ...(mounted ? { mountUid: turntable.uid } : {}) },
    });
  }
  const stationPool = Object.keys(ITEMS).filter((id) => ITEMS[id].station && (ITEMS[id].level || 1) <= level);
  const genericPool = Object.keys(ITEMS).filter((id) => !ITEMS[id].wall && !ITEMS[id].station && id !== 'turntable' && (ITEMS[id].level || 1) <= level);
  const genericWalls = Object.keys(ITEMS).filter((id) => ITEMS[id].wall && (ITEMS[id].level || 1) <= level);
  if (level >= 3) addItem(theme.station || (stationPool.length ? pick(stationPool) : null), theme.anchors[0][0], theme.anchors[0][1]);
  const featured = theme.featured.length ? theme.featured : ['toolchest', 'plant', 'oilCan'];
  featured.forEach((type, i) => {
    const a = theme.anchors[i % theme.anchors.length];
    addItem(type, a[0], a[1]);
  });
  const wallPool = (theme.wallPool.length ? theme.wallPool : genericWalls).filter((id) => (ITEMS[id].level || 1) <= level);
  const wallCount = Math.min(4, 2 + Math.floor(level / 6));
  for (let i = 0; i < wallCount && wallPool.length; i++) addWallItem(wallPool[(i + seed) % wallPool.length], theme.wallSides[i % theme.wallSides.length]);
  const fillPool = (theme.pool.length ? theme.pool : genericPool).filter((id) => (ITEMS[id].level || 1) <= level);
  const target = Math.min(28, 10 + Math.floor(level * 1.2));
  for (let i = 0; items.length < target && fillPool.length; i++) {
    const a = theme.anchors[(i + seed) % theme.anchors.length];
    if (!addItem(fillPool[(i + seed) % fillPool.length], a[0], a[1])) break;
  }
  return {
    size,
    floor,
    wall,
    ownedFloors: floors,
    ownedWalls: walls,
    items,
    cars,
    theme: theme.label,
    autoGenerated: true,
  };
}

export function fitBotGarageToLevel(garage = {}, level = 1) {
  const lv = Math.max(1, Math.min(500, Number(level) || 1));
  const size = [...EXPANSIONS].reverse().find((e) => lv >= e.level)?.size || 14;
  const floors = unlocked(FLOORS, lv);
  const walls = unlocked(WALLS, lv);
  const items = (Array.isArray(garage.items) ? garage.items : []).filter((it) => {
    const def = ITEMS[it?.type];
    if (!def || (def.level || 1) > lv) return false;
    const f = footprint(it.type, it.rot || 0);
    return (it.x || 0) >= 0 && (it.z || 0) >= 0 && (it.x || 0) + f.w <= size && (it.z || 0) + f.d <= size;
  });
  const kept = new Set(items.map((it) => it.uid));
  const cars = (Array.isArray(garage.cars) ? garage.cars : []).filter((car) => {
    const model = car?.cfg?.model;
    if (!model || (MODELS[model]?.level || 1) > lv) return false;
    if (car.placed?.mountUid && !kept.has(car.placed.mountUid)) delete car.placed.mountUid;
    return true;
  });
  return {
    ...garage,
    size,
    floor: floors.includes(garage.floor) ? garage.floor : floors[floors.length - 1],
    wall: walls.includes(garage.wall) ? garage.wall : walls[walls.length - 1],
    ownedFloors: floors,
    ownedWalls: walls,
    items,
    cars,
  };
}
