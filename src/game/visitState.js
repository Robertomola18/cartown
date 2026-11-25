// Read-only GameState-like object used to render a friend's or bot's garage
// without touching the visitor's save.

export function makeVisitState(host = {}) {
  const garage = host.garage && typeof host.garage === 'object' ? host.garage : {};
  const cars = (Array.isArray(garage.cars) ? garage.cars : []).map((car, i) => ({
    id: String(car.id || `visit-car-${i}`),
    cfg: car.cfg || { model: 'hatch' },
    placed: car.placed || { x: 6 + i * 3, z: 7, rot: 0 },
  }));
  const data = {
    player: { name: host.name || 'Friend', avatar: host.avatar || {} },
    level: host.level || 1,
    garage: {
      size: Math.max(1, Number(garage.size) || 14),
      floor: garage.floor || 'tile',
      wall: garage.wall || 'white',
      ownedFloors: ['tile'],
      ownedWalls: ['white'],
      items: Array.isArray(garage.items) ? garage.items : [],
    },
    cars,
    friends: [],
    settings: { lang: 'es' },
  };
  const noop = () => {};
  return {
    data,
    get level() { return data.level; },
    get garage() { return data.garage; },
    get cars() { return data.cars; },
    getCar(id) { return data.cars.find((car) => car.id === id) || null; },
    carJob() { return null; },
    activeJobs() { return []; },
    isCarBusy() { return false; },
    save: noop,
    saveNow: noop,
    emit: noop,
  };
}
