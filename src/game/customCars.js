// Admin-defined cars. They reuse an existing body (baseModel) and override the
// visible name, price, level, paint and stats. Every custom car is registered
// into MODELS so saves, dealership, garage and races can render it.

import { MODELS } from '../cars/models.js';

const registry = [];
const byId = new Map();

function cloneSpec(car) {
  const base = MODELS[car.baseModel];
  if (!base) return null;
  const stats = { ...base.stats };
  for (const key of ['hp', 'kg', 'grip', 'gears', 'redline']) {
    if (car[key] !== null && car[key] !== undefined) stats[key] = Number(car[key]);
  }
  const colors = { ...(base.colors || {}) };
  if (car.paint) colors.paint = car.paint;
  if (car.finish) colors.finish = car.finish;
  return {
    ...base,
    id: car.id,
    name: car.name,
    brand: car.brand,
    class: car.class,
    price: car.price,
    level: car.level,
    cashPrice: car.cash || 0,
    featured: false,
    custom: true,
    stats,
    colors,
  };
}

export function registerCustomCars(cars = []) {
  for (const car of cars) {
    if (!car?.id || !car.baseModel) continue;
    const spec = cloneSpec(car);
    if (!spec) continue;
    MODELS[car.id] = spec;
    byId.set(car.id, car);
    if (!registry.includes(car.id)) registry.push(car.id);
  }
}

export function customCarsForSale() {
  return registry.map((id) => byId.get(id)).filter((car) => car && car.enabled);
}

export function isCustomCar(id) {
  return byId.has(id);
}
