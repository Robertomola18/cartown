// Persistent game state: economy, levels, fuel, owned cars and garage layout.

import { Emitter, uid, clamp } from '../core/util.js';
import { defaultConfig } from '../cars/carFactory.js';
import { ITEMS, FLOORS, WALLS, EXPANSIONS, GOAL_DEFS, MAX_MECHANICS, MECHANIC_HIRES } from './catalog.js';
import {
  CUSTOMER_JOB_SLOTS,
  OWN_JOB_SLOTS,
  CUSTOMER_SERVICES,
  customerJob,
  ownJob,
  ownJobOptions,
  jobReady,
  jobRushCost,
  serviceStation,
} from './jobs.js';
import { normalizeTutorial, tutorialSessionFromLegacy } from './tutorialMachine.js';
import { apiUrl, redirectLogin } from '../core/api.js';
import { detectLang } from '../core/i18n.js';

const SAVE_KEY = 'cartown-remake-save-v1';
export const FUEL_REGEN_SECONDS = 150;

export function xpForLevel(level) {
  // cumulative XP needed to reach `level`
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(60 * Math.pow(l, 1.45) + 40);
  return total;
}

function freshState() {
  return {
    version: 1,
    started: false,
    player: { name: 'Player', avatar: { skin: '#f1c7a3', hair: '#3b2414', shirt: '#d9262b', style: 'short' } },
    coins: 3116,
    cash: 5,
    xp: 0,
    level: 1,
    fuel: 10,
    fuelTs: Date.now(),
    cars: [],
    activeCar: null,
    garage: {
      size: 14,
      floor: 'tile',
      wall: 'white',
      ownedFloors: ['tile'],
      ownedWalls: ['white'],
      items: [],
    },
    friends: [],
    stats: { served: 0, races: 0, wins: 0, earned: 0, driven: 0 },
    goals: null,
    jobs: [],
    staff: { mechanics: 2 },
    settings: { sfx: true, music: true, lang: detectLang(), quality: 'high', tutorial: null },
  };
}

function starterItems(size) {
  const n = size;
  const items = [
    { type: 'lift', x: n - 5, z: 1, rot: 0 },
    { type: 'lift', x: n - 5, z: 4, rot: 0 },
    { type: 'toolchest', x: n - 1, z: 0, rot: 0 },
    { type: 'tirerack', x: n - 4, z: 0, rot: 0 },
    { type: 'compressor', x: n - 6, z: 0, rot: 0 },
    { type: 'desk', x: 6, z: n - 3, rot: 0 },
    { type: 'arcade', x: 3, z: n - 3, rot: 0 },
    { type: 'xmastree', x: 4, z: n - 3, rot: 0 },
    { type: 'stopsign', x: 8, z: n - 4, rot: 0 },
    { type: 'vending', x: 0, z: n - 1, rot: 0 },
    { type: 'plant', x: 0, z: 0, rot: 0 },
    { type: 'barrels', x: n - 1, z: 6, rot: 0 },
    { type: 'poster', x: 0, z: 3, rot: 0, wall: 'x' },
    { type: 'poster', x: 0, z: 6, rot: 0, wall: 'x' },
    { type: 'poster', x: 0, z: 9, rot: 0, wall: 'x' },
    { type: 'poster', x: 4, z: 0, rot: 0, wall: 'z' },
    { type: 'neonsign', x: 7, z: 0, rot: 0, wall: 'z' },
    { type: 'clock', x: 2, z: 0, rot: 0, wall: 'z' },
  ];
  return items.map((it) => ({ uid: uid('it'), ...it }));
}

export class GameState extends Emitter {
  constructor(initialState, opts = {}) {
    super();
    this.remote = Boolean(opts.remote);
    this.userId = opts.userId ?? null;
    this.revision = Number.isFinite(Number(opts.revision)) ? Math.max(0, Number(opts.revision)) : 0;
    this.remoteConflict = false;
    this.conflictRevision = null;
    this.data = freshState();
    this._saveTimer = null;
    this._remoteTimer = null;
    this._remoteSaving = false;
    this._remoteAgain = false;
    this._remotePromise = null;
    if (this.remote) {
      if (initialState) this.data = { ...freshState(), ...initialState };
      this.normalize();
    } else {
      this.load();
    }
  }

  normalize() {
    const base = freshState();
    this.data.garage = { ...base.garage, ...this.data.garage };
    this.data.settings = { ...base.settings, ...this.data.settings };
    if (!this.data.settings.tutorial && Number.isFinite(Number(this.data.settings.tutorialStep))) {
      this.data.settings.tutorial = tutorialSessionFromLegacy(this.data.settings.tutorialStep);
    }
    delete this.data.settings.tutorialStep;
    this.data.settings.tutorial = normalizeTutorial(this.data.settings.tutorial);
    this.data.stats = { ...base.stats, ...this.data.stats };
    this.data.staff = { ...base.staff, ...(this.data.staff || {}) };
    this.data.staff.mechanics = Math.max(2, Math.min(MAX_MECHANICS, Math.round(Number(this.data.staff.mechanics) || 2)));
    const size = Number(this.data.garage.size);
    this.data.garage.size = EXPANSIONS.some((e) => e.size === size) ? size : EXPANSIONS[0].size;
    if (!Array.isArray(this.data.garage.items)) this.data.garage.items = [];
    for (const it of this.data.garage.items) {
      if (!it || it.type !== 'wallPlaque') continue;
      it.wall = true;
      it.z = 0;
      it.rot = 0;
      it.x = clamp(Number(it.x) || 0, 0, Math.max(0, size - (ITEMS.wallPlaque?.w || 2)));
    }
    if (!Array.isArray(this.data.cars)) this.data.cars = [];
    if (!Number.isFinite(Number(this.data.level))) this.data.level = 1;
    this.ensureJobs();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) this.data = { ...freshState(), ...parsed };
      }
    } catch (e) {
      console.warn('Could not load save', e);
    }
    this.normalize();
  }

  save() {
    clearTimeout(this._saveTimer);
    if (this.remote) {
      clearTimeout(this._remoteTimer);
      this._remoteTimer = setTimeout(() => this.saveNow(), 800);
      return;
    }
    this._saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  saveNow() {
    clearTimeout(this._remoteTimer);
    if (!this.remote) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      } catch (e) {
        /* storage may be unavailable (private mode) — the game still runs */
      }
      return;
    }
    return this.pushRemote();
  }

  pushRemote() {
    if (this.remoteConflict) return Promise.resolve();
    if (this._remoteSaving) {
      this._remoteAgain = true;
      return this._remotePromise || Promise.resolve();
    }
    this._remoteSaving = true;
    this._remoteAgain = false;
    const body = JSON.stringify({ state: this.data, revision: this.revision });
    const keepalive = body.length < 60 * 1024;
    this._remotePromise = fetch(apiUrl('/api/state'), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive,
    })
      .then(async (res) => {
        if (res.status === 401) {
          redirectLogin();
          return;
        }
        if (res.status === 409) {
          const data = await res.json().catch(() => null);
          this.remoteConflict = true;
          this.conflictRevision = Number.isFinite(Number(data?.revision)) ? Number(data.revision) : null;
          this._remoteAgain = false;
          this.emit('saveConflict', data || {});
          return;
        }
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && Number.isFinite(Number(data.revision))) this.revision = Number(data.revision);
          return;
        }
        if (res.status !== 413) console.warn('Remote save failed', res.status);
      })
      .catch((e) => console.warn('Remote save failed', e))
      .finally(() => {
        this._remoteSaving = false;
        this._remotePromise = null;
        if (this._remoteAgain && !this.remoteConflict) this.pushRemote();
      });
    return this._remotePromise;
  }

  async flushRemote() {
    if (!this.remote) return;
    clearTimeout(this._remoteTimer);
    while (this._remoteSaving) await (this._remotePromise || Promise.resolve());
    await this.pushRemote();
    while (this._remoteAgain) {
      this._remoteAgain = false;
      await this.pushRemote();
    }
  }

  /** Adopt the latest server save. Used before purchases that must not be lost to a stale tab. */
  async refreshFromServer() {
    if (!this.remote) return true;
    clearTimeout(this._remoteTimer);
    while (this._remoteSaving) await (this._remotePromise || Promise.resolve());
    try {
      const res = await fetch(apiUrl('/api/state'), { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) {
        redirectLogin();
        return false;
      }
      if (!res.ok) return false;
      const body = await res.json().catch(() => null);
      if (!body || !body.ok) return false;
      if (body.state) this.data = { ...freshState(), ...body.state };
      if (Number.isFinite(Number(body.revision))) this.revision = Number(body.revision);
      this.remoteConflict = false;
      this.conflictRevision = null;
      this.normalize();
      this.emit('change');
      return true;
    } catch {
      return false;
    }
  }

  reset() {
    if (this.remoteConflict && this.conflictRevision !== null) {
      this.revision = this.conflictRevision;
      this.remoteConflict = false;
    }
    if (!this.remote) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    }
    this.data = freshState();
    this.save();
    this.emit('reset');
  }

  // --- New game ------------------------------------------------------------------------
  startNewGame(name, starterModel) {
    if (this.data.started) return { ok: false, error: 'started' };
    const previous = this.data;
    this.data = {
      ...freshState(),
      settings: { ...previous.settings },
      player: { ...freshState().player, avatar: { ...previous.player?.avatar } },
    };
    const d = this.data;
    d.started = true;
    d.player.name = String(name || 'Player').slice(0, 14) || 'Player';
    d.garage.items = starterItems(d.garage.size);
    const car = this.addCar({ ...defaultConfig(starterModel), number: 1 });
    d.activeCar = car.id;
    this.resetGoals();
    this.save();
    this.emit('change');
    this.emit('reset');
    return { ok: true };
  }

  // --- Currency ------------------------------------------------------------------------
  get coins() { return this.data.coins; }
  get cash() { return this.data.cash; }
  get level() { return this.data.level; }

  canAfford(coins = 0, cash = 0) {
    return this.data.coins >= coins && this.data.cash >= cash;
  }

  spend(coins = 0, cash = 0) {
    if (!this.canAfford(coins, cash)) return false;
    this.data.coins -= coins;
    this.data.cash -= cash;
    this.emit('money');
    this.saveNow();
    return true;
  }

  addCoins(n) {
    this.data.coins += Math.round(n);
    if (n > 0) this.data.stats.earned += Math.round(n);
    this.emit('money');
    this.saveNow();
  }

  addCash(n) {
    this.data.cash += n;
    this.emit('money');
    this.saveNow();
  }

  get mechanics() { return Math.max(2, Number(this.data.staff?.mechanics) || 2); }

  nextMechanicHire() {
    return MECHANIC_HIRES.find((entry) => entry.mechanics === this.mechanics + 1) || null;
  }

  hireMechanic() {
    if (this.mechanics >= MAX_MECHANICS) return { ok: false, error: 'max' };
    const hire = this.nextMechanicHire();
    if (!hire) return { ok: false, error: 'max' };
    if (!this.spend(hire.price)) return { ok: false, error: 'coins' };
    this.data.staff.mechanics = hire.mechanics;
    this.emit('money');
    this.saveNow();
    return { ok: true, mechanics: hire.mechanics, price: hire.price };
  }

  hasStation(kind) {
    return (this.data.garage.items || []).some((item) => ITEMS[item.type]?.station === kind);
  }

  addXp(n) {
    const d = this.data;
    d.xp += Math.round(n);
    let leveled = false;
    while (d.xp >= xpForLevel(d.level + 1)) {
      d.level++;
      leveled = true;
      d.cash += 1 + Math.floor(d.level / 5);
      d.fuel = Math.max(d.fuel, this.fuelMax);
      this.emit('levelup', d.level);
    }
    this.emit('xp', leveled);
    this.save();
  }

  levelProgress() {
    const d = this.data;
    const a = xpForLevel(d.level);
    const b = xpForLevel(d.level + 1);
    return clamp((d.xp - a) / (b - a), 0, 1);
  }

  // --- Fuel (energy) -------------------------------------------------------------------
  get fuelMax() {
    return 10 + Math.floor((this.data.level - 1) / 5);
  }

  tickFuel() {
    const d = this.data;
    const now = Date.now();
    if (d.fuel >= this.fuelMax) {
      d.fuelTs = now;
      return;
    }
    const elapsed = (now - d.fuelTs) / 1000;
    if (elapsed >= FUEL_REGEN_SECONDS) {
      const gained = Math.floor(elapsed / FUEL_REGEN_SECONDS);
      d.fuel = Math.min(this.fuelMax, d.fuel + gained);
      d.fuelTs += gained * FUEL_REGEN_SECONDS * 1000;
      this.emit('fuel');
      this.save();
    }
  }

  fuelSecondsLeft() {
    const d = this.data;
    if (d.fuel >= this.fuelMax) return 0;
    return FUEL_REGEN_SECONDS - (Date.now() - d.fuelTs) / 1000;
  }

  useFuel(n) {
    const d = this.data;
    if (d.fuel < n) return false;
    if (d.fuel >= this.fuelMax) d.fuelTs = Date.now();
    d.fuel -= n;
    this.emit('fuel');
    this.save();
    return true;
  }

  refuel() {
    this.data.fuel = this.fuelMax;
    this.data.fuelTs = Date.now();
    this.emit('fuel');
    this.save();
  }

  // --- Cars ------------------------------------------------------------------------
  get cars() { return this.data.cars; }

  getCar(id) {
    return this.data.cars.find((c) => c.id === id);
  }

  get activeCar() {
    return this.getCar(this.data.activeCar) || this.data.cars[0];
  }

  addCar(cfg) {
    const car = { id: uid('car'), cfg, placed: null };
    this.data.cars.push(car);
    this.emit('cars');
    this.save();
    return car;
  }

  removeCar(id) {
    if (this.isCarBusy(id)) return false;
    this.data.cars = this.data.cars.filter((c) => c.id !== id);
    if (!this.data.cars.some((c) => c.id === this.data.activeCar)) {
      this.data.activeCar = this.data.cars[0]?.id || null;
    }
    this.emit('cars');
    this.save();
    return true;
  }

  updateCar(id, cfg) {
    const car = this.getCar(id);
    if (!car) return;
    car.cfg = cfg;
    this.emit('cars');
    this.save();
  }

  setActiveCar(id) {
    this.data.activeCar = id;
    this.emit('cars');
    this.save();
  }

  // --- Jobs ------------------------------------------------------------------------
  get jobs() {
    this.ensureJobs();
    return this.data.jobs;
  }

  ensureJobs() {
    if (!Array.isArray(this.data.jobs)) this.data.jobs = [];
    this.data.jobs = this.data.jobs.filter((job) => {
      if (!job || !job.id || !job.endsAt) return false;
      if (job.kind === 'own' && !this.getCar(job.carId)) return false;
      return true;
    });
    return this.data.jobs;
  }

  activeJobs(kind = null) {
    const jobs = this.ensureJobs().filter((job) => !job.claimed);
    return kind ? jobs.filter((job) => job.kind === kind) : jobs;
  }

  completedJobs() {
    return this.activeJobs().filter((job) => jobReady(job));
  }

  jobsUsed(kind = null) {
    return this.activeJobs(kind).length;
  }

  jobSlots(kind) {
    if (kind === 'customer') return CUSTOMER_JOB_SLOTS;
    if (kind === 'own') return OWN_JOB_SLOTS;
    return CUSTOMER_JOB_SLOTS + OWN_JOB_SLOTS;
  }

  tutorialSession() { return this.data.settings.tutorial || null; }

  tutorialJobPending() { return this.data.settings.tutorial?.stepId === 'startRepair'; }

  tutorialCustomPending() { return this.data.settings.tutorial?.stepId === 'applyChange'; }

  tutorialRacePending() { return this.data.settings.tutorial?.stepId === 'race'; }

  emitTutorialEvent(event) {
    this.emit('tutorialEvent', event);
    this.emit('tutorial', event.type);
  }

  isCarBusy(carId) {
    return this.activeJobs('own').some((job) => job.carId === carId);
  }

  carJob(carId) {
    return this.activeJobs('own').find((job) => job.carId === carId) || null;
  }

  stationReserved(stationUid) {
    if (!stationUid) return false;
    return this.activeJobs().some((job) => job.stationUid === stationUid);
  }

  startCustomerJob(serviceId = null, opts = {}) {
    if (this.jobsUsed('customer') >= CUSTOMER_JOB_SLOTS) return { ok: false, error: 'slots' };
    const service = serviceId
      ? CUSTOMER_SERVICES.find((entry) => entry.id === serviceId)
      : CUSTOMER_SERVICES[Math.floor(Math.random() * CUSTOMER_SERVICES.length)];
    if (!service) return { ok: false, error: 'service' };
    const station = serviceStation(service.id);
    if (station && !this.hasStation(station)) return { ok: false, error: 'station' };
    if (this.stationReserved(opts.stationUid)) return { ok: false, error: 'stationBusy' };
    if (this.data.fuel < service.fuel) return { ok: false, error: 'fuel' };
    this.useFuel(service.fuel);
    const job = customerJob(uid('job'), service, Date.now(), {
      stationUid: opts.stationUid || null,
      mechanicIndex: Number.isInteger(opts.mechanicIndex) ? opts.mechanicIndex : null,
      cfg: opts.cfg || null,
    });
    this.data.jobs.push(job);
    this.emit('jobs');
    this.saveNow();
    return { ok: true, job };
  }

  startOwnJob(carId, upgradeKey, stationUid) {
    if (!car) return { ok: false, error: 'car' };

    if (this.isCarBusy(carId)) return { ok: false, error: 'busy' };
    if (this.jobsUsed('own') >= OWN_JOB_SLOTS) return { ok: false, error: 'slots' };
    if (!stationUid) return { ok: false, error: 'station' };
    if (this.stationReserved(stationUid)) {
      return { ok: false, error: 'stationBusy' };
    }
    const option = ownJobOptions(car).find((entry) => entry.key === upgradeKey);
    if (!option) return { ok: false, error: 'upgrade' };
    const tutorial = this.tutorialJobPending();
    const cost = tutorial ? 0 : option.cost;
    if (!tutorial && !this.spend(cost)) return { ok: false, error: 'coins' };
    const job = ownJob(uid('job'), car, option);
    if (tutorial) {
      job.duration = 3000;
      job.endsAt = Date.now() + 3000;
      job.tutorial = true;
    }
    job.stationUid = stationUid;
    job.homePlaced = car.placed ? { ...car.placed } : null;
    car.placed = null;
    this.data.jobs.push(job);
    this.emit('jobs');
    this.emitTutorialEvent({ type: 'job:started', jobId: job.id, tutorial });
    this.saveNow();
    return { ok: true, job };
  }

  rushJob(jobId) {
    const job = this.activeJobs().find((entry) => entry.id === jobId);
    if (!job) return { ok: false, error: 'job' };
    if (jobReady(job)) return { ok: false, error: 'ready' };
    const cost = jobRushCost(job);
    if (!this.spend(cost)) return { ok: false, error: 'coins' };
    job.endsAt = Date.now();
    job.rushed = true;
    this.emit('jobs');
    this.save();
    return { ok: true, cost, job };
  }

  claimJob(jobId) {
    const job = this.activeJobs().find((entry) => entry.id === jobId);
    if (!job) return { ok: false, error: 'job' };
    if (!jobReady(job)) return { ok: false, error: 'wait' };
    if (job.kind === 'own') {
      const car = this.getCar(job.carId);
      if (!car) return { ok: false, error: 'car' };
      const upgrades = { ...(car.cfg.upgrades || {}) };
      upgrades[job.upgradeKey] = Math.max(Number(upgrades[job.upgradeKey] || 0), job.level + 1);
      car.cfg = { ...car.cfg, upgrades };
      car.placed = job.homePlaced || null;
      this.emit('cars');
    }
    this.data.jobs = this.data.jobs.filter((entry) => entry.id !== jobId);
    if (job.kind === 'customer') {
      this.addCoins(job.coins);
      this.addXp(job.xp);
      this.data.stats.served++;
      this.progressGoal('serve');
    } else {
      this.addXp(job.xp);
    }
    this.emit('jobs');
    this.emitTutorialEvent({ type: 'job:claimed', jobId: job.id, kind: job.kind });
    this.save();
    return { ok: true, job };
  }

  // --- Garage --------------------------------------------------------------------
  get garage() { return this.data.garage; }

  luxury() {
    const g = this.data.garage;
    let lux = 0;
    for (const it of g.items) lux += ITEMS[it.type]?.lux || 0;
    lux += FLOORS[g.floor]?.lux || 0;
    lux += WALLS[g.wall]?.lux || 0;
    lux += (EXPANSIONS.findIndex((e) => e.size === g.size)) * 5;
    lux += this.data.cars.length * 2;
    return lux;
  }

  luxuryTier() {
    const lux = this.luxury();
    const tiers = [0, 30, 60, 100, 150, 220, 300];
    let tier = 0;
    while (tier + 1 < tiers.length && lux >= tiers[tier + 1]) tier++;
    return { tier: tier + 1, lux, next: tiers[tier + 1] ?? null, tipBonus: tier * 0.08, rateBonus: tier * 0.1 };
  }

  // --- Goals ------------------------------------------------------------------------
  resetGoals() {
    const day = new Date().toISOString().slice(0, 10);
    this.data.goals = { day, list: GOAL_DEFS.map((g) => ({ id: g.id, progress: 0, claimed: false })) };
  }

  ensureGoals() {
    const day = new Date().toISOString().slice(0, 10);
    if (!this.data.goals || this.data.goals.day !== day) this.resetGoals();
  }

  progressGoal(id, n = 1) {
    this.ensureGoals();
    const g = this.data.goals.list.find((x) => x.id === id);
    if (!g || g.claimed) return;
    const def = GOAL_DEFS.find((x) => x.id === id);
    const before = g.progress;
    g.progress = Math.min(def.n, g.progress + n);
    if (before < def.n && g.progress >= def.n) this.emit('goal', def);
    this.emit('goals');
    this.save();
  }
}
