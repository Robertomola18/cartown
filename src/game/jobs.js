// Timed jobs that keep running while the game is closed.
// Customers bring work to the garage; owned cars can be sent to the workshop
// for a discounted upgrade installation.

import { SERVICES, UPGRADES, UPGRADE_MAX, upgradeCost } from './catalog.js';

export const CUSTOMER_JOB_SLOTS = 8;
export const OWN_JOB_SLOTS = 1;
export const MAX_JOBS = CUSTOMER_JOB_SLOTS + OWN_JOB_SLOTS;

export const CUSTOMER_SERVICES = Object.values(SERVICES).flat();

const MAX_SERVICE_COINS = Math.max(1, ...CUSTOMER_SERVICES.map((service) => Number(service.coins) || 0));
export const JOB_MAX_PAYOUT = 2600;
export const JOB_MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const JOB_STEP_MS = 15 * 60 * 1000;
const STREET_JOB_MIN_MS = 60 * 1000;
const STREET_JOB_MAX_MS = 3 * 60 * 1000;

export function serviceStation(serviceId) {
  for (const [kind, list] of Object.entries(SERVICES)) {
    if (list.some((service) => service.id === serviceId)) return kind;
  }
  return null;
}

export function customerPayout(service) {
  const scaled = (Number(service.coins) || 0) * JOB_MAX_PAYOUT / MAX_SERVICE_COINS;
  return Math.round(scaled / 10) * 10;
}

function payoutDuration(payout) {
  const raw = (payout / JOB_MAX_PAYOUT) * JOB_MAX_DURATION_MS;
  return Math.max(JOB_STEP_MS, Math.min(JOB_MAX_DURATION_MS, Math.round(raw / JOB_STEP_MS) * JOB_STEP_MS));
}

export function customerJobDuration(service) {
  return payoutDuration(customerPayout(service));
}

export function streetJobDuration(service) {
  const minutes = Math.max(1, Math.min(3, Number(service.time) || 1));
  return Math.max(STREET_JOB_MIN_MS, Math.min(STREET_JOB_MAX_MS, minutes * 60 * 1000));
}

export function customerJob(id, service, now = Date.now(), extra = {}) {
  const street = extra.origin === 'street';
  const coins = street ? Math.round(Number(extra.coins ?? service.coins) || 0) : customerPayout(service);
  const xp = street ? Math.round(Number(extra.xp ?? service.xp) || 0) : Math.round(service.xp * 2);
  const duration = street ? streetJobDuration(service) : payoutDuration(coins);
  return {
    id,
    kind: 'customer',
    ...extra,
    origin: street ? 'street' : 'panel',
    serviceId: service.id,
    name: service.name,
    icon: service.icon,
    duration,
    startAt: now,
    endsAt: now + duration,
    fuel: service.fuel,
    coins,
    xp,
    claimed: false,
  };
}

export function ownJobOptions(car) {
  const upgrades = car?.cfg?.upgrades || {};
  const options = [];
  for (const upgrade of UPGRADES) {
    const level = Number(upgrades[upgrade.key] || 0);
    if (level >= UPGRADE_MAX) continue;
    const durationMinutes = [15, 30, 60][level] || 60;
    options.push({
      key: upgrade.key,
      label: upgrade.label,
      icon: upgrade.icon,
      level,
      cost: Math.max(10, Math.round((upgradeCost(car.cfg.model, level) * 0.6) / 10) * 10),
      duration: durationMinutes * 60 * 1000,
      xp: 20 + level * 15,
    });
  }
  return options;
}

export function ownJob(id, car, option, now = Date.now()) {
  return {
    id,
    kind: 'own',
    carId: car.id,
    upgradeKey: option.key,
    upgradeLabel: option.label,
    icon: option.icon,
    level: option.level,
    duration: option.duration,
    startAt: now,
    endsAt: now + option.duration,
    cost: option.cost,
    coins: 0,
    xp: option.xp,
    claimed: false,
  };
}

export function jobRemaining(job, now = Date.now()) {
  return Math.max(0, Number(job?.endsAt || 0) - now);
}

export function jobReady(job, now = Date.now()) {
  return Boolean(job) && jobRemaining(job, now) <= 0;
}

export function jobProgress(job, now = Date.now()) {
  const duration = Math.max(1, Number(job?.duration) || 1);
  const remaining = jobRemaining(job, now);
  return Math.max(0, Math.min(1, 1 - remaining / duration));
}

export function jobRushCost(job, now = Date.now()) {
  const remaining = jobRemaining(job, now);
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining / (5 * 60 * 1000)));
}
