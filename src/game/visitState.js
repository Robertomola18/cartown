// Read-only GameState-like object used to render a friend's or bot's garage
// without touching the visitor's save.

export function makeVisitState(host = {}) {
  const garage = host.garage && typeof host.garage === 'object' ? host.garage : {};
  const floor = typeof garage.floor === 'string' ? garage.floor : 'tile';
  const wall = typeof garage.wall === 'string' ? garage.wall : 'white';
  const items = (Array.isArray(garage.items) ? garage.items : []).slice(0, 600).filter((it) => it && typeof it === 'object').map((it) => ({
    uid: String(it.uid || ''),
    type: String(it.type || ''),
    x: Number(it.x) || 0,
    z: Number(it.z) || 0,
    rot: Number(it.rot) || 0,
    ...(it.wall === 'x' || it.wall === 'z' ? { wall: it.wall } : {}),
    ...(it.surfaceUid != null ? { surfaceUid: String(it.surfaceUid) } : {}),
    ...(Number.isInteger(it.slot) ? { slot: it.slot } : {}),
    ...(Number.isInteger(it.layer) ? { layer: it.layer } : {}),
  })).filter((it) => it.type);
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
      floor,
      wall,
      ownedFloors: [...new Set([...(Array.isArray(garage.ownedFloors) ? garage.ownedFloors : [floor]), 'tile'])],
      ownedWalls: [...new Set([...(Array.isArray(garage.ownedWalls) ? garage.ownedWalls : [wall]), 'white'])],
      items,
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
