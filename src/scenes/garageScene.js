// The isometric garage ("Minha Garagem"): lot, walls, decorations, the
// player's cars, NPC customers, mechanics, street traffic and friends parked
// outside. Also hosts the garage editor (placing / moving items).

import * as THREE from 'three';
import { createCar } from '../cars/carFactory.js';
import { buildGarageEnvironment, roadLayout } from '../world/garageEnv.js';
import { buildItem, footprint, mat, box, glowDisc } from '../world/props.js';
import { floorTexture, wallTexture, WALL_STYLE, signTexture } from '../world/textures.js';
import { buildAvatar, animateAvatar, portrait } from '../world/characters.js';
import { GarageTraffic } from '../world/traffic.js';
import { CustomerManager } from '../game/customers.js';
import { serviceStation, jobReady, jobRemaining } from '../game/jobs.js';
import { ITEMS, NPC_FRIENDS } from '../game/catalog.js';
import { t } from '../core/i18n.js';
import { el, clamp, damp, fmtJobTime, uid } from '../core/util.js';
import { PathMover, headingOf } from '../world/mover.js';

const ISO_ELEV = THREE.MathUtils.degToRad(30);
const CAR_FOOT = { w: 3, d: 2 };

function flatItemY(def, item = null) {
  if (!def?.flat) return 0;
  const layer = item?.layer ?? def.layer;
  return layer ? 0.006 + layer * 0.004 : 0.015;
}

export class GarageScene {
  constructor(engine, state, labels, opts = {}) {
    this.engine = engine;
    this.readOnly = Boolean(opts.readOnly);
    this.state = state;
    this.labels = labels;
    this.ui = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#7fd0f5');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.zoom = 11;
    this.target = new THREE.Vector3(7, 0, 7);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.itemsGroup = new THREE.Group();
    this.carsGroup = new THREE.Group();
    this.root.add(this.itemsGroup, this.carsGroup);
    this.itemMeshes = new Map();
    this.carMeshes = new Map();
    this.stations = [];
    this.mechanics = [];
    this.idleSeats = [];
    this.neighborGarages = [];
    this.friendCars = [];
    this.friendLabels = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = { down: false, x: 0, y: 0, moved: 0, button: 0 };
    this.editor = { active: false, placing: null, selected: null };
    this.hoverRing = glowDisc('#ffe14a', 1.6);
    this.hoverRing.visible = false;
    this.hoverRing.position.y = 0.03;
    this.root.add(this.hoverRing);
    this.lastHover = 0;
    this.time = 0;
    this.setupLights();
    this.customers = this.readOnly ? { update() {}, clear() {}, list: [], paused: false } : new CustomerManager(this);
    this.build();
  }

  get size() {
    return this.state.garage.size;
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x7a9a5a, 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun, sun.target);
  }

  fitShadow() {
    const N = this.size;
    const c = new THREE.Vector3(N / 2 + 2, 0, N / 2 + 2);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).add(new THREE.Vector3(-14, 26, -6));
    const s = N * 0.85 + 8;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------------------------
  // Building
  // ------------------------------------------------------------------------------------

  build() {
    this.customers.clear();
    this.traffic?.clear();
    if (this.env) this.root.remove(this.env);
    const friends = this.friendsList();
    const { root, layout, neighbors = [] } = buildGarageEnvironment(this.size, friends);
    this.env = root;
    this.layout = layout;
    this.neighborGarages = neighbors;
    this.root.add(root);
    this.buildLot();
    if (!this.readOnly && this.repairStations()) this.state.save();
    this.layoutItems();
    this.layoutCars();
    if (!this.readOnly) {
      this.buildPeople();
      this.buildFriends();
      this.restoreCustomerJobs();
    }
    this.traffic = this.readOnly ? { update() {}, clear() {} } : new GarageTraffic(this.root, layout);
    this.fitShadow();
    this.target.set(this.size / 2 + 0.6, 0, this.size / 2 + 0.6);
    if (!this.userZoom) this.fitZoom();
  }

  /** Frames the whole lot edge to edge, like the original game's default view. */
  fitZoom() {
    const a = this.aspect || 1.6;
    const span = this.size * Math.SQRT2 + 1.5;
    this.zoom = clamp(Math.max(span / (2 * a), this.size * 0.5), 4, 22);
    this.updateCamera();
  }

  buildLot() {
    if (this.lot) this.root.remove(this.lot);
    const N = this.size;
    const g = new THREE.Group();
    this.lot = g;
    const g0 = this.state.garage;
    // floor slab
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(g0.floor, N), roughness: g0.floor === 'blue' || g0.floor === 'checker' ? 0.35 : 0.7 });
    const edge = mat('#8d9096', { rough: 0.7 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(N, 0.2, N), [edge, edge, floorMat, edge, edge, edge]);
    slab.position.set(N / 2, -0.1, N / 2);
    slab.receiveShadow = true;
    g.add(slab);
    this.floorMesh = slab;
    // walls on the two back edges
    const ws = WALL_STYLE[g0.wall] || WALL_STYLE.white;
    const wallH = 2.7;
    const makeWall = (len) => {
      const tex = wallTexture(g0.wall).clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(len / 2.7, 1);
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
      const plain = mat(ws.trim, { rough: 0.8 });
      const top = mat(ws.band, { rough: 0.6 });
      return [face, plain, top, plain, face, plain];
    };
    const wz = new THREE.Mesh(new THREE.BoxGeometry(N + 0.3, wallH, 0.3), makeWall(N));
    wz.position.set(N / 2 - 0.15, wallH / 2, -0.15);
    wz.castShadow = wz.receiveShadow = true;
    const wx = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, N), makeWall(N));
    // box face order: +x, -x, +y, -y, +z, -z -> inner face of the x-wall is +x (index 0)
    wx.position.set(-0.15, wallH / 2, N / 2);
    wx.castShadow = wx.receiveShadow = true;
    g.add(wz, wx);
    // cap stripe
    const capM = mat(ws.band, { rough: 0.5 });
    box(g, N + 0.4, 0.14, 0.4, capM, N / 2 - 0.2, wallH, -0.15, 0.04);
    box(g, 0.4, 0.14, N + 0.1, capM, -0.15, wallH, N / 2 + 0.05, 0.04);
    // garage name sign on the back wall
    const name = `${String(this.state.data.player.name || 'Player').toUpperCase()}'S GARAGE`;
    const signTex = signTexture(`gname:${name}`, name, { bg: '#d9262b', fg: '#fff', w: 1024, h: 160, border: '#ffd21a' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.95), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.12 }));
    sign.position.set(Math.min(N * 0.55, N - 3.5), wallH + 0.62, -0.12);
    g.add(sign);
    box(g, 6.2, 1.1, 0.12, mat('#1b1c20'), sign.position.x, wallH + 0.07, -0.22, 0.03);
    // tall sign tower at the back corner (the "Car Town" totem from the original)
    const tower = new THREE.Group();
    box(tower, 0.5, 4.6, 0.5, mat('#3a3d44', { rough: 0.5, metal: 0.5 }), 0, 0, 0, 0.05);
    const towerSign = signTexture('tower', 'CAR TOWN', { bg: '#1f4fb6', fg: '#ffd21a', w: 512, h: 256, sub: 'GARAGE · SERVICE · RACING' });
    const ts = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.25), [mat('#1f4fb6'), mat('#1f4fb6'), mat('#1f4fb6'), mat('#1f4fb6'),
      new THREE.MeshStandardMaterial({ map: towerSign, emissive: 0xffffff, emissiveMap: towerSign, emissiveIntensity: 0.2 }),
      new THREE.MeshStandardMaterial({ map: towerSign })]);
    ts.position.y = 4.9;
    ts.castShadow = true;
    tower.add(ts);
    tower.position.set(-0.9, 0, -0.9);
    tower.rotation.y = -Math.PI / 4;
    g.add(tower);
    // curb along the open front edges
    const curbM = mat('#c9c4b8', { rough: 0.8 });
    box(g, N, 0.06, 0.12, curbM, N / 2, 0, N - 0.02, 0.02);
    box(g, 0.12, 0.06, N, curbM, N - 0.02, 0, N / 2, 0.02);
    this.root.add(g);
  }

  layoutItems(syncOwn = true) {
    for (const st of this.stations) this.clearJobLabel(st);
    for (const m of this.itemMeshes.values()) this.itemsGroup.remove(m);
    this.itemMeshes.clear();
    this.stations = [];
    for (const it of this.state.garage.items) this.addItemMesh(it);
    if (syncOwn) this.syncJobStations();
  }

  addItemMesh(it) {
    const def = ITEMS[it.type];
    if (!def) return;
    const g = buildItem(it.type);
    this.positionItem(g, it);
    g.userData.pick = { type: 'item', uid: it.uid };
    this.itemsGroup.add(g);
    this.itemMeshes.set(it.uid, g);
    if (def.station) {
      const rot = it.rot || 0;
      const th = (rot * Math.PI) / 2;
      const dir = { x: Math.round(Math.cos(th)), z: Math.round(-Math.sin(th)) };
      const center = { x: g.position.x, z: g.position.z };
      this.stations.push({
        uid: it.uid,
        kind: def.station,
        item: it,
        mesh: g,
        center,
        dir,
        approach: { x: center.x + dir.x * 2.9, z: center.z + dir.z * 2.9 },
        occupant: null,
        lift: 0,
      });
    }
  }

  surfaceSlotPosition(it, slot) {
    const def = ITEMS[it.type];
    const base = it.type === 'displayTable' ? [[0.5, 0.5], [1.5, 0.5], [1, 1.5]] : [[0.5, 0.5], [1.5, 0.5]];
    const [sx, sz] = base[slot] || base[0];
    const rot = it.rot || 0;
    let x = sx;
    let z = sz;
    if (rot === 1) { x = def.d - sz; z = sx; }
    else if (rot === 2) { x = def.w - sx; z = def.d - sz; }
    else if (rot === 3) { x = sz; z = def.w - sx; }
    return { x: it.x + x, y: (def.height || 0.82) + 0.06, z: it.z + z };
  }

  findSurface(cx, cz, { ignoreUid = null } = {}) {
    for (const it of this.state.garage.items) {
      const def = ITEMS[it.type];
      if (!def?.surface) continue;
      const f = footprint(it.type, it.rot || 0);
      if (cx < it.x || cz < it.z || cx > it.x + f.w || cz > it.z + f.d) continue;
      for (let slot = 0; slot < def.slots; slot++) {
        if (!this.state.garage.items.some((other) => other.uid !== ignoreUid && other.surfaceUid === it.uid && (other.slot || 0) === slot)) {
          return { table: it, slot };
        }
      }
    }
    return null;
  }

  findItemSpot(type, ignoreUid = null) {
    const f = footprint(type, 0);
    for (let x = 0; x + f.w <= this.size; x++) {
      for (let z = 0; z + f.d <= this.size; z++) {
        if (this.canPlace(type, x, z, 0, { ignoreUid })) return { x, z, rot: 0 };
      }
    }
    return { x: 1, z: 1, rot: 0 };
  }

  positionItem(g, it) {
    const def = ITEMS[it.type];
    if (def.wall) {
      if (it.wall === 'x') {
        g.position.set(0.02, 0, it.z + def.w / 2);
        g.rotation.y = Math.PI / 2;
      } else {
        g.position.set(it.x + def.w / 2, 0, 0.02);
        g.rotation.y = 0;
      }
      return;
    }
    if (it.surfaceUid != null) {
      const table = this.state.garage.items.find((i) => i.uid === it.surfaceUid);
      if (table) {
        const p = this.surfaceSlotPosition(table, it.slot || 0);
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = ((table.rot || 0) + (it.rot || 0)) * Math.PI / 2;
        return;
      }
    }
    const f = footprint(it.type, it.rot || 0);
    g.position.set(it.x + f.w / 2, flatItemY(def, it), it.z + f.d / 2);
    g.rotation.y = ((it.rot || 0) * Math.PI) / 2;
  }

  /** Occupancy test used by placement and path finding. */
  occupant(x, z, { ignoreUid = null, ignoreCar = null, forCar = false } = {}) {
    for (const it of this.state.garage.items) {
      const def = ITEMS[it.type];
      if (it.uid === ignoreUid || def?.wall || def?.flat || it.surfaceUid != null || (forCar && it.type === 'turntable')) continue;
      const f = footprint(it.type, it.rot || 0);
      if (x >= it.x && x < it.x + f.w && z >= it.z && z < it.z + f.d) return { kind: 'item', it };
    }
    for (const car of this.state.cars) {
      if (car.id === ignoreCar || !car.placed) continue;
      const p = car.placed;
      const f = p.rot % 2 ? { w: CAR_FOOT.d, d: CAR_FOOT.w } : CAR_FOOT;
      if (x >= p.x && x < p.x + f.w && z >= p.z && z < p.z + f.d) return { kind: 'car', car };
    }
    return null;
  }

  mountableTurntable(x, z, rot, { ignoreCar = null } = {}) {
    const f = rot % 2 ? { w: CAR_FOOT.d, d: CAR_FOOT.w } : CAR_FOOT;
    const cx = x + f.w / 2;
    const cz = z + f.d / 2;
    for (const it of this.state.garage.items) {
      if (it.type !== 'turntable') continue;
      const t = footprint(it.type, it.rot || 0);
      if (cx < it.x || cz < it.z || cx > it.x + t.w || cz > it.z + t.d) continue;
      if (this.state.cars.some((car) => car.id !== ignoreCar && car.placed?.mountUid === it.uid)) continue;
      return it;
    }
    return null;
  }

  isBlocked(x, z, exceptStation = null) {
    const o = this.occupant(x, z);
    if (!o) return false;
    if (exceptStation && o.kind === 'item' && o.it.uid === exceptStation.uid) return false;
    if (o.kind === 'item' && ITEMS[o.it.type].station) {
      // empty stations can be driven across only at their approach side; treat as blocked
      return true;
    }
    return true;
  }

  stationAccess(type, x, z, rot, { ignoreUid = null, ignoreCar = null } = {}) {
    const def = ITEMS[type];
    if (!def?.station) return { ok: true };
    const f = footprint(type, rot);
    const center = { x: x + f.w / 2, z: z + f.d / 2 };
    const th = (rot * Math.PI) / 2;
    const dir = { x: Math.round(Math.cos(th)), z: Math.round(-Math.sin(th)) };
    const approach = { x: center.x + dir.x * 2.9, z: center.z + dir.z * 2.9 };
    const N = this.size;
    if (approach.x < 0.4 || approach.z < 0.4 || approach.x > N - 0.4 || approach.z > N - 0.4) return { ok: false, approach, dir };
    const ax = Math.floor(approach.x);
    const az = Math.floor(approach.z);
    if (this.occupant(ax, az, { ignoreUid, ignoreCar })) return { ok: false, approach, dir };
    return { ok: true, approach, dir };
  }

  canPlace(type, x, z, rot, { ignoreUid = null, ignoreCar = null } = {}) {
    const N = this.size;
    const def = ITEMS[type];
    const f = type === 'car' ? (rot % 2 ? { w: CAR_FOOT.d, d: CAR_FOOT.w } : CAR_FOOT) : footprint(type, rot);
    if (x < 0 || z < 0 || x + f.w > N || z + f.d > N) return false;
    const dz = Math.floor(this.layout.driveZ);
    if (x + f.w >= N - 1 && z <= dz + 1 && z + f.d > dz - 1) return false;
    if (def?.flat) return true;
    if (def?.surfaceItem && this.findSurface(x + f.w / 2, z + f.d / 2, { ignoreUid })) return true;
    for (let i = x; i < x + f.w; i++) {
      for (let j = z; j < z + f.d; j++) {
        if (this.occupant(i, j, { ignoreUid, ignoreCar, forCar: type === 'car' })) return false;
      }
    }
    if (!this.stationAccess(type, x, z, rot, { ignoreUid, ignoreCar }).ok) return false;
    return true;
  }

  repairStations() {
    let changed = false;
    const items = this.state.garage.items;
    for (const it of items) {
      if (!ITEMS[it.type]?.station) continue;
      const rot = it.rot || 0;
      if (this.canPlace(it.type, it.x, it.z, rot, { ignoreUid: it.uid })) continue;
      const oldF = footprint(it.type, rot);
      const center = { x: it.x + oldF.w / 2, z: it.z + oldF.d / 2 };
      const candidates = [];
      for (let r = 0; r < 4; r++) candidates.push({ x: it.x, z: it.z, rot: r });
      for (let r = 0; r < 4; r++) {
        const f = footprint(it.type, r);
        candidates.push({ x: Math.round(center.x - f.w / 2), z: Math.round(center.z - f.d / 2), rot: r });
      }
      let best = null;
      for (const c of candidates) {
        if (this.canPlace(it.type, c.x, c.z, c.rot, { ignoreUid: it.uid })) { best = c; break; }
      }
      if (!best) {
        const N = this.size;
        let score = Infinity;
        for (let r = 0; r < 4; r++) {
          const f = footprint(it.type, r);
          for (let z = 0; z + f.d <= N; z++) {
            for (let x = 0; x + f.w <= N; x++) {
              if (!this.canPlace(it.type, x, z, r, { ignoreUid: it.uid })) continue;
              const d = Math.hypot(x + f.w / 2 - center.x, z + f.d / 2 - center.z);
              if (d < score) { score = d; best = { x, z, rot: r }; }
            }
          }
        }
      }
      if (best) {
        it.x = best.x;
        it.z = best.z;
        it.rot = best.rot;
        changed = true;
      }
    }
    return changed;
  }

  findCarSpot() {
    const N = this.size;
    for (let x = 1; x + 3 <= N - 1; x += 4) {
      for (let z = 1; z + 2 <= N - 1; z += 2) {
        if (!this.mountableTurntable(x, z, 0) && this.canPlace('car', x, z, 0)) return { x, z, rot: 0 };
      }
    }
    for (let x = 0; x + 3 <= N; x++) for (let z = 0; z + 2 <= N; z++) if (!this.mountableTurntable(x, z, 0) && this.canPlace('car', x, z, 0)) return { x, z, rot: 0 };
    return null;
  }

  layoutCars() {
    for (const obj of this.carMeshes.values()) {
      obj.parent?.remove(obj);
      obj.userData.car.dispose();
    }
    this.carMeshes.clear();
    // validate placements
    for (const car of this.state.cars) {
      const job = this.state.carJob(car.id);
      if (job) {
        // A car in the workshop lives on its lift until the job is collected.
        if (!car.placed) continue;
      }
      if (car.placed) {
        const p = car.placed;
        const mount = this.mountableTurntable(p.x, p.z, p.rot, { ignoreCar: car.id });
        if (p.mountUid) {
          if (!mount || mount.uid !== p.mountUid) car.placed = null;
        } else if (mount || !this.canPlace('car', p.x, p.z, p.rot, { ignoreCar: car.id })) {
          car.placed = null;
        }
      }
    }
    for (const car of this.state.cars) {
      if (!car.placed && !this.state.carJob(car.id)) car.placed = this.findCarSpot();
      this.addCarMesh(car);
    }
    this.syncJobStations();
    this.state.save();
  }

  addCarMesh(car) {
    const job = this.state.carJob(car.id);
    if (!car.placed && !job) return;
    const obj = createCar(car.cfg, { lod: 'low' });
    let mounted = false;
    if (!job) {
      const spinner = car.placed?.mountUid ? this.itemMeshes.get(car.placed.mountUid)?.userData?.spinner : null;
      if (spinner) {
        spinner.add(obj);
        obj.position.set(0, 0.02, 0);
        obj.rotation.y = ((car.placed.rot || 0) * Math.PI) / 2;
        mounted = true;
      } else this.positionCar(obj, car.placed);
    }
    obj.userData.pick = { type: 'car', id: car.id };
    if (!mounted) this.carsGroup.add(obj);
    this.carMeshes.set(car.id, obj);
  }

  // --- Workshop lifts ---------------------------------------------------------------
  freeLift() {
    return this.stations.find((st) => st.kind === 'lift' && !st.occupant && !st.playerJob) || null;
  }

  freeStation(kind) {
    return this.stations.find((st) => (!kind || st.kind === kind) && !st.occupant && !st.playerJob) || null;
  }

  freeMechanicIndex() {
    return this.mechanics.findIndex((m) => !m.busy);
  }

  startCustomerJob(service) {
    const kind = serviceStation(service.id);
    if (kind && !this.state.hasStation(kind)) return { ok: false, error: 'station' };
    const station = this.freeStation(kind);
    if (!station) return { ok: false, error: 'stationBusy' };
    const mechanicIndex = this.freeMechanicIndex();
    if (mechanicIndex < 0) return { ok: false, error: 'mechanic' };
    const cfg = this.customers.randomCfg();
    const result = this.state.startCustomerJob(service.id, { stationUid: station.uid, mechanicIndex, cfg });
    if (result.ok) {
      this.customers.spawnJob(result.job, station, cfg, mechanicIndex, { direct: true });
      this.state.save();
    }
    return result;
  }

  restoreCustomerJobs() {
    const shown = new Set(this.customers.list.filter((c) => c.job).map((c) => c.job.id));
    for (const job of this.state.activeJobs('customer')) {
      if (shown.has(job.id)) continue;
      const kind = serviceStation(job.serviceId);
      if (!kind) continue;
      let station = this.stations.find((st) => st.uid === job.stationUid && st.kind === kind && !st.occupant && !st.playerJob);
      if (!station) station = this.freeStation(kind);
      if (!station) continue;
      const previousUid = job.stationUid;
      const ready = jobReady(job);
      const idx = Number.isInteger(job.mechanicIndex) ? job.mechanicIndex : -1;
      const spawned = this.customers.spawnJob(job, station, job.cfg, idx, { ready, direct: !ready });
      if (spawned && previousUid !== job.stationUid) this.state.save();
    }
  }

  syncJobs() {
    const ownIds = new Set(this.state.activeJobs('own').map((job) => job.id));
    for (const st of this.stations) {
      if (st.playerJob && !ownIds.has(st.playerJob.id)) this.detachOwnJob(st.playerJob);
    }
    const customerIds = new Set(this.state.activeJobs('customer').map((job) => job.id));
    for (const c of [...this.customers.list]) {
      if (c.job && !customerIds.has(c.job.id)) this.customers.claimByJob(c.job.id);
    }
    this.syncJobStations();
  }

  claimCustomerJob(jobId) {
    return this.customers.claimByJob(jobId);
  }

  focusJob(job) {
    if (job.kind === 'customer') {
      const c = this.customers.list.find((entry) => entry.job?.id === job.id);
      if (c && c.phase === 'waiting') this.customers.startJobService(c);
      return;
    }
    const st = this.stations.find((entry) => entry.playerJob?.id === job.id);
    if (st && !jobReady(job)) this.assignOwnJobMechanic(st, job);
  }

  assignOwnJobMechanic(st, job) {
    const idx = Number.isInteger(job?.mechanicIndex) ? job.mechanicIndex : -1;
    const preferred = idx >= 0 ? this.mechanics[idx] : null;
    if (preferred && !preferred.busy) {
      this.bindMechanicToStation(preferred, st);
      if (job) job.mechanicIndex = idx;
      return preferred;
    }
    if (this.mechanics.some((m) => m.busy && m.station === st)) return null;
    const mechanic = this.assignMechanic(st);
    if (mechanic && job) job.mechanicIndex = this.mechanics.indexOf(mechanic);
    return mechanic;
  }

  isStationBusy(uid) {
    const st = this.stations.find((entry) => entry.uid === uid);
    return Boolean(st && (st.occupant || st.playerJob));
  }

  clearJobLabel(st) {
    st.jobLabel?.remove();
    st.jobLabel = null;
    st.jobLabelText = null;
  }

  showJobLabel(st, job, obj) {
    this.clearJobLabel(st);
    const time = el('span', { class: 'own-job-time' }, jobReady(job) ? t('jobsReady') : fmtJobTime(jobRemaining(job)));
    const label = el('div', { class: 'own-job-label' }, el('b', {}, t(`up.${job.upgradeKey}`)), time);
    st.jobLabelText = time;
    st.jobLabel = this.labels.add(label, obj, { offsetY: (obj.userData.car?.height || 1.6) + 1.1 });
  }

  syncJobStations() {
    const previous = new Map();
    for (const st of this.stations) {
      if (!st.playerJob) this.clearJobLabel(st);
      else previous.set(st.playerJob.id, st);
      st.playerJob = null;
      st.playerCarObj = null;
    }
    let changed = false;
    for (const job of this.state.activeJobs('own')) {
      let st = this.stations.find((entry) => entry.uid === job.stationUid && entry.kind === 'lift' && !entry.occupant && !entry.playerJob && (!this.state.stationReserved(entry.uid) || entry.uid === job.stationUid));
      if (!st) st = this.stations.find((entry) => entry.kind === 'lift' && !entry.occupant && !entry.playerJob && !this.state.stationReserved(entry.uid));
      if (!st) continue;
      const old = previous.get(job.id);
      if (old && old !== st) {
        const m = this.mechanics.find((entry) => entry.busy && entry.station === old);
        if (m) this.releaseMechanic(m);
      }
      if (job.stationUid !== st.uid) changed = true;
      job.stationUid = st.uid;
      st.playerJob = job;
      if (!jobReady(job)) this.assignOwnJobMechanic(st, job);
      const obj = this.carMeshes.get(job.carId);
      if (obj) {
        st.playerCarObj = obj;
        this.positionJobCar(obj, st);
        obj.visible = true;
        this.showJobLabel(st, job, obj);
      }
    }
    if (changed) this.state.save();
  }

  positionJobCar(obj, st) {
    obj.position.set(st.center.x, st.lift > 0.01 ? st.lift + 0.02 : 0, st.center.z);
    obj.rotation.y = headingOf(-st.dir.x, -st.dir.z);
  }

  attachOwnJob(job) {
    this.syncJobStations();
    const st = this.stations.find((entry) => entry.uid === job.stationUid) || this.freeLift();
    if (!st || st.occupant || (st.playerJob && st.playerJob.id !== job.id)) return false;
    job.stationUid = st.uid;
    st.playerJob = job;
    if (!jobReady(job)) this.assignOwnJobMechanic(st, job);
    let obj = this.carMeshes.get(job.carId);
    if (!obj) {
      const car = this.state.getCar(job.carId);
      if (!car) return false;
      this.addCarMesh(car);
      obj = this.carMeshes.get(job.carId);
    }
    if (obj) {
      st.playerCarObj = obj;
      obj.visible = true;
      const R = this.layout;
      const path = [
        { x: this.size + 2, z: R.driveZ - 4 },
        { x: this.size + 0.5, z: R.driveZ },
        ...this.customers.lotPath(st),
        { x: st.approach.x, z: st.approach.z },
        { x: st.center.x, z: st.center.z },
      ];
      obj.position.set(path[0].x, 0, path[0].z);
      obj.userData.mover = new PathMover(obj, path, { speed: 4 });
      st.jobArriving = true;
      this.showJobLabel(st, job, obj);
    }
    this.state.save();
    return true;
  }

  detachOwnJob(job) {
    const st = this.stations.find((entry) => entry.playerJob && entry.playerJob.id === job.id);
    if (st) {
      const m = this.mechanics.find((x) => x.busy && x.station === st);
      if (m) this.releaseMechanic(m);
      st.playerJob = null;
      this.clearJobLabel(st);
      if (st.playerCarObj) delete st.playerCarObj.userData.mover;
      st.playerCarObj = null;
      st.jobArriving = false;
    }
    this.layoutCars();
  }

  positionCar(obj, p) {
    const f = p.rot % 2 ? { w: CAR_FOOT.d, d: CAR_FOOT.w } : CAR_FOOT;
    obj.position.set(p.x + f.w / 2, 0, p.z + f.d / 2);
    obj.rotation.y = (p.rot * Math.PI) / 2;
  }

  refreshCar(carId) {
    const obj = this.carMeshes.get(carId);
    if (obj) {
      obj.parent?.remove(obj);
      obj.userData.car.dispose();
      this.carMeshes.delete(carId);
    }
    const car = this.state.getCar(carId);
    if (car) {
      if (!car.placed) car.placed = this.findCarSpot();
      this.addCarMesh(car);
    }
  }

  refreshMountedCars(uid) {
    if (!uid) return;
    for (const car of this.state.cars) if (car.placed?.mountUid === uid) this.refreshCar(car.id);
  }

  unmountCar(carId) {
    const car = this.state.getCar(carId);
    if (!car?.placed?.mountUid) return false;
    car.placed = null;
    this.refreshCar(carId);
    this.state.saveNow();
    return true;
  }

  // ------------------------------------------------------------------------------------
  // People
  // ------------------------------------------------------------------------------------

  buildPeople() {
    for (const m of this.mechanics) this.root.remove(m.obj);
    if (this.player) this.root.remove(this.player);
    this.mechanics = [];
    this.idleSeats = [];
    const N = this.size;
    const count = Math.max(2, Math.min(6, Number(this.state.mechanics) || 2));
    const homes = [
      { x: 8.2, z: 3.2 }, { x: 8.3, z: 6.6 },
      { x: 6.2, z: 2.4 }, { x: 10.4, z: 4.8 },
      { x: 6.4, z: 5.4 }, { x: 10.2, z: 2.2 },
    ].slice(0, count);
    homes.forEach((h, i) => {
      const obj = buildAvatar({ skin: i ? '#c68a5e' : '#f1c7a3', shirt: '#2f5fb8', pants: '#2f5fb8', style: 'cap', capColor: '#d9262b' });
      obj.position.set(h.x, 0, h.z);
      obj.rotation.y = headingOf(1, 1);
      this.root.add(obj);
      this.mechanics.push({ obj, home: h, busy: false, target: null, working: false, seated: false, seat: null });
    });
    this.player = buildAvatar(this.state.data.player.avatar);
    const playerHome = { x: 8.8, z: Math.max(6, N - 4.2) };
    this.player.position.set(playerHome.x, 0, playerHome.z);
    this.player.rotation.y = headingOf(1, 0.6);
    this.root.add(this.player);
    this.playerLabel?.remove();
    this.playerLabel = this.labels.add(el('div', { class: 'name-tag me' }, String(this.state.data.player.name || 'Player')), this.player, { offsetY: 1.5 });
    this.mechanics.push({ obj: this.player, home: playerHome, busy: false, target: null, working: false, seated: false, seat: null, isPlayer: true });
    this.customers?.reassignMechanics?.();
    this.rebuildIdleSeats();
    this.syncJobStations();
  }

  rebuildIdleSeats() {
    this.idleSeats = [];
    for (const it of this.state.garage.items) {
      if (it.type !== 'sofa') continue;
      const mesh = this.itemMeshes.get(it.uid);
      if (!mesh) continue;
      const th = ((it.rot || 0) * Math.PI) / 2;
      const ax = Math.cos(th);
      const az = -Math.sin(th);
      const fx = Math.sin(th);
      const fz = Math.cos(th);
      for (const off of [-0.42, 0.42]) {
        const x = mesh.position.x + ax * off;
        const z = mesh.position.z + az * off;
        this.idleSeats.push({ x, z, y: mesh.position.y + 0.35, face: { x: x + fx, z: z + fz }, occupant: null });
      }
    }
    for (const m of this.mechanics) {
      if (m.seat) m.seat.occupant = null;
      m.seat = null;
      m.seated = false;
      if (!m.busy) m.target = this.idleTargetFor(m);
    }
  }

  idleTargetFor(m) {
    const seat = this.idleSeats.find((s) => !s.occupant);
    if (seat) {
      seat.occupant = m;
      m.seat = seat;
      m.face = seat.face;
      return { x: seat.x, z: seat.z };
    }
    m.seat = null;
    m.face = null;
    return { ...m.home };
  }

  freeMechanicCount() {
    return this.mechanics.filter((m) => !m.busy).length;
  }

  bindMechanicToStation(m, station) {
    if (m.seat) {
      m.seat.occupant = null;
      m.seat = null;
    }
    m.busy = true;
    m.working = false;
    m.seated = false;
    m.station = station;
    const side = { x: -station.dir.z, z: station.dir.x };
    m.target = { x: station.center.x + side.x * 1.35, z: station.center.z + side.z * 1.35 };
    m.face = station.center;
    return m;
  }

  assignMechanic(station) {
    const m = this.mechanics.find((x) => !x.busy);
    if (!m) return null;
    return this.bindMechanicToStation(m, station);
  }

  releaseMechanic(m) {
    if (m.seat) {
      m.seat.occupant = null;
      m.seat = null;
    }
    m.busy = false;
    m.working = false;
    m.seated = false;
    m.station = null;
    m.target = this.idleTargetFor(m);
  }

  updatePeople(dt) {
    for (const m of this.mechanics) {
      if (m.busy && !m.working && !m.target && m.station) {
        const side = { x: -m.station.dir.z, z: m.station.dir.x };
        m.target = { x: m.station.center.x + side.x * 1.35, z: m.station.center.z + side.z * 1.35 };
        m.face = m.station.center;
      }
      let speed = 0;
      if (m.target) {
        const p = m.obj.position;
        const dx = m.target.x - p.x;
        const dz = m.target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.08) {
          speed = 2.2;
          p.x += (dx / d) * Math.min(d, speed * dt);
          p.z += (dz / d) * Math.min(d, speed * dt);
          m.obj.rotation.y = headingOf(dx, dz);
        } else {
          if (m.busy) m.working = true;
          if (m.face) m.obj.rotation.y = headingOf(m.face.x - p.x, m.face.z - p.z);
          m.target = null;
          if (!m.busy && m.seat) m.seated = true;
        }
      }
      animateAvatar(m.obj, dt, speed, m.working && m.busy, m.seated && !m.busy, m.seat?.y ?? 0.35);
    }
  }

  // ------------------------------------------------------------------------------------
  // Friends parked outside
  // ------------------------------------------------------------------------------------

  friendsList() {
    const score = (f) => (f.imported ? 2 : 0) + (f.serverUserId ? 1 : 0);
    const local = (this.state.data.friends || []).slice().sort((a, b) => score(b) - score(a));
    return [...local, ...NPC_FRIENDS];
  }

  buildFriends() {
    for (const f of this.friendCars) {
      this.root.remove(f.obj);
      f.obj.userData.car.dispose();
    }
    for (const l of this.friendLabels) l.remove();
    this.friendCars = [];
    this.friendLabels = [];
    const R = this.layout;
    const N = this.size;
    const friends = this.readOnly ? [] : this.friendsList().slice(0, 7);
    const spots = [];
    for (let x = 2.2; x < N - 1; x += 3.6) spots.push({ x, z: R.park, rot: headingOf(1, 0) });
    for (let z = 2.2; z < N - 1; z += 3.6) {
      if (Math.abs(z - R.driveZ) < 3.2) continue;
      spots.push({ x: R.park, z, rot: headingOf(0, -1) });
    }
    friends.forEach((f, i) => {
      const s = spots[i];
      if (!s) return;
      const obj = createCar({ ...f.car }, { lod: 'low' });
      obj.position.set(s.x, 0, s.z);
      obj.rotation.y = s.rot;
      obj.userData.pick = { type: 'friend', id: f.id };
      this.root.add(obj);
      this.friendCars.push({ obj, friend: f });
      const tag = el('button', { class: 'friend-tag', onclick: (e) => { e.stopPropagation(); this.ui?.onFriendClick?.(f, e); } },
        el('img', { src: portrait(f.avatar, 48), alt: '' }),
        el('span', {}, f.name));
      this.friendLabels.push(this.labels.add(tag, obj, { offsetY: obj.userData.car.height + 0.6 }));
    });
  }

  // ------------------------------------------------------------------------------------
  // Station animation (lift raising, brushes spinning, ...)
  // ------------------------------------------------------------------------------------

  animateStation(st, dt, active, customer) {
    const target = active && st.kind === 'lift' && !st.jobArriving ? 0.7 : 0;
    st.lift = damp(st.lift, target, 3, dt);
    const plat = st.mesh.userData.platform;
    if (plat) plat.position.y = st.lift + 0.05;
    if (customer && customer.obj && st.kind === 'lift') customer.obj.position.y = st.lift > 0.01 ? st.lift + 0.02 : 0;
    if (st.playerCarObj && st.kind === 'lift') st.playerCarObj.position.y = st.lift > 0.01 ? st.lift + 0.02 : 0;
    if (st.mesh.userData.brushes && active) for (const b of st.mesh.userData.brushes) b.rotation.y += dt * 12;
    if (active && Math.random() < dt * 8) this.spawnParticle(st, customer);
  }

  spawnParticle(st, customer) {
    const colors = { wash: '#bfe9ff', lift: '#ffd76a', paint: customer?.cfg?.paint || '#ff4fa0' };
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: colors[st.kind] || '#fff', transparent: true }));
    m.position.set(st.center.x + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.2, st.center.z + (Math.random() - 0.5) * 1.4);
    m.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.6, st.kind === 'wash' ? -1.5 : 1.2, (Math.random() - 0.5) * 0.6);
    m.userData.life = 0.8;
    this.root.add(m);
    (this.particles ||= []).push(m);
  }

  updateParticles(dt) {
    if (!this.particles) return;
    for (const p of this.particles) {
      p.userData.life -= dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.material.opacity = Math.max(0, p.userData.life / 0.8);
      if (p.userData.life <= 0) {
        this.root.remove(p);
        p.geometry.dispose();
        p.material.dispose();
      }
    }
    this.particles = this.particles.filter((p) => p.userData.life > 0);
  }

  animateDecor(dt, time) {
    for (const g of this.itemMeshes.values()) {
      const u = g.userData;
      if (u.flag) {
        const pos = u.flag.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) + 0.45;
          pos.setZ(i, Math.sin(time * 4 + x * 5) * 0.06 * x);
        }
        pos.needsUpdate = true;
      }
      if (u.spinner) u.spinner.rotation.y += dt * 0.6;
      if (u.hands) {
        const d = new Date();
        u.hands[0].rotation.z = -((d.getHours() % 12) / 12) * Math.PI * 2;
        u.hands[1].rotation.z = -(d.getMinutes() / 60) * Math.PI * 2;
      }
      if (u.screen) u.screen.emissiveIntensity = 0.8 + Math.sin(time * 9) * 0.25;
      if (u.neon) u.neon.emissiveIntensity = 1 + Math.sin(time * 3) * 0.15;
    }
    for (const obj of this.carMeshes.values()) obj.userData.car.setSiren(time);
  }

  // ------------------------------------------------------------------------------------
  // Editor
  // ------------------------------------------------------------------------------------

  setEditor(on) {
    this.editor.active = on;
    this.clearGhost();
    this.selectItem(null);
    if (on) this.customers.clearStreet();
    else this.syncJobStations();
    this.customers.paused = on;
  }

  refreshLayout() {
    this.layoutItems(false);
    this.customers.rebindStations?.(this.stations);
    this.syncJobStations();
    if (!this.readOnly) {
      this.restoreCustomerJobs();
      this.rebuildIdleSeats();
    }
  }

  startPlacing(spec) {
    // spec: { kind: 'item', type, uid? } or { kind: 'car', id }
    if (spec.kind === 'car' && this.state.isCarBusy(spec.id)) return false;
    if (spec.kind === 'item' && spec.uid && this.isStationBusy(spec.uid)) return false;
    this.clearGhost();
    const rot = spec.rot ?? 0;
    let mesh;
    if (spec.kind === 'car') {
      const car = this.state.getCar(spec.id);
      mesh = createCar(car.cfg, { shadows: false, lod: 'low' });
      const obj = this.carMeshes.get(spec.id);
      if (obj) obj.visible = false;
    } else {
      mesh = buildItem(spec.type);
      if (spec.uid) {
        const m = this.itemMeshes.get(spec.uid);
        if (m) m.visible = false;
      }
    }
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x3cff6b, transparent: true, opacity: 0.45, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.03;
    const ghost = new THREE.Group();
    ghost.add(mesh, pad);
    this.root.add(ghost);
    this.editor.placing = { ...spec, rot, ghost, mesh, pad, x: 0, z: 0, ok: false, wall: null };
    this.updateGhost(this.size / 2, this.size / 2);
    return true;
  }

  clearGhost() {
    const p = this.editor.placing;
    if (!p) return;
    this.root.remove(p.ghost);
    if (p.kind === 'car') {
      const obj = this.carMeshes.get(p.id);
      if (obj) obj.visible = true;
      p.mesh.userData.car?.dispose();
    } else if (p.uid) {
      const m = this.itemMeshes.get(p.uid);
      if (m) m.visible = true;
    }
    this.editor.placing = null;
  }

  rotatePlacing() {
    const p = this.editor.placing;
    if (!p) return;
    p.rot = (p.rot + 1) % 4;
    this.updateGhost(p.lastWx ?? this.size / 2, p.lastWz ?? this.size / 2);
  }

  updateGhost(wx, wz) {
    const p = this.editor.placing;
    if (!p) return;
    p.lastWx = wx;
    p.lastWz = wz;
    const N = this.size;
    const def = ITEMS[p.type];
    if (p.kind === 'item' && def?.wall) {
      // snap to whichever back wall is closer
      const onX = wx < wz;
      const along = Math.round((onX ? wz : wx) - def.w / 2);
      const pos = clamp(along, 0, N - def.w);
      p.wall = onX ? 'x' : 'z';
      p.x = onX ? 0 : pos;
      p.z = onX ? pos : 0;
      const it = { type: p.type, x: p.x, z: p.z, wall: p.wall };
      this.positionItem(p.mesh, it);
      p.mesh.position.set(p.mesh.position.x, 0, p.mesh.position.z);
      p.ghost.position.set(0, 0, 0);
      p.pad.visible = false;
      p.ok = true;
      return;
    }
    if (p.kind === 'item' && def?.surfaceItem) {
      const surface = this.findSurface(wx, wz, { ignoreUid: p.uid });
      if (surface) {
        const pos = this.surfaceSlotPosition(surface.table, surface.slot);
        p.surfaceUid = surface.table.uid;
        p.slot = surface.slot;
        p.x = surface.table.x;
        p.z = surface.table.z;
        p.ghost.position.set(pos.x, pos.y, pos.z);
        p.mesh.position.set(0, 0, 0);
        p.mesh.rotation.y = ((surface.table.rot || 0) + p.rot) * Math.PI / 2;
        p.pad.visible = false;
        p.ok = true;
        return;
      }
    }
    p.surfaceUid = null;
    p.slot = undefined;
    const f = p.kind === 'car' ? (p.rot % 2 ? { w: 2, d: 3 } : CAR_FOOT) : footprint(p.type, p.rot);
    const x = Math.round(wx - f.w / 2);
    const z = Math.round(wz - f.d / 2);
    p.x = x;
    p.z = z;
    p.ok = this.canPlace(p.kind === 'car' ? 'car' : p.type, x, z, p.rot, { ignoreUid: p.uid, ignoreCar: p.kind === 'car' ? p.id : null });
    p.ghost.position.set(x + f.w / 2, flatItemY(def, p), z + f.d / 2);
    p.mesh.position.set(0, 0, 0);
    p.mesh.rotation.y = (p.rot * Math.PI) / 2;
    p.pad.scale.set(f.w, f.d, 1);
    p.pad.visible = true;
    p.pad.material.color.set(p.ok ? 0x3cff6b : 0xff3b3b);
  }

  /** Commits the current placement. Returns true when placed. */
  commitPlacing() {
    const p = this.editor.placing;
    if (!p || !p.ok) return false;
    if (p.kind === 'car') {
      const car = this.state.getCar(p.id);
      const mount = this.mountableTurntable(p.x, p.z, p.rot, { ignoreCar: car.id });
      car.placed = { x: p.x, z: p.z, rot: p.rot, ...(mount ? { mountUid: mount.uid } : {}) };
      this.clearGhost();
      this.refreshCar(car.id);
      this.state.saveNow();
      return true;
    }
    const items = this.state.garage.items;
    const placement = { x: p.x, z: p.z, rot: p.rot, wall: p.wall || undefined, surfaceUid: p.surfaceUid || undefined, slot: p.slot };
    if (p.kind === 'item' && ITEMS[p.type]?.layer) placement.layer = ITEMS[p.type].layer;
    if (p.uid) {
      Object.assign(items.find((i) => i.uid === p.uid), placement);
    } else {
      items.push({ uid: uid('it'), type: p.type, ...placement });
    }
    this.clearGhost();
    this.refreshLayout();
    this.refreshMountedCars(p.uid);
    this.state.saveNow();
    return true;
  }

  selectItem(sel) {
    if (this.selBox) {
      this.root.remove(this.selBox);
      this.selBox = null;
    }
    this.editor.selected = sel;
    if (!sel) return;
    const obj = sel.kind === 'car' ? this.carMeshes.get(sel.id) : this.itemMeshes.get(sel.uid);
    if (!obj) return;
    const b = new THREE.Box3().setFromObject(obj);
    const helper = new THREE.Box3Helper(b, 0xffe14a);
    this.selBox = helper;
    this.root.add(helper);
  }

  dropSurfaceItems(surfaceUid) {
    for (const it of this.state.garage.items) {
      if (it.surfaceUid !== surfaceUid) continue;
      it.surfaceUid = undefined;
      it.slot = undefined;
      let spot = null;
      for (let x = 0; x + footprint(it.type, 0).w <= this.size && !spot; x++) {
        for (let z = 0; z + footprint(it.type, 0).d <= this.size && !spot; z++) {
          const center = { x: x + footprint(it.type, 0).w / 2, z: z + footprint(it.type, 0).d / 2 };
          if (this.canPlace(it.type, x, z, 0, { ignoreUid: it.uid }) && !this.findSurface(center.x, center.z, { ignoreUid: it.uid })) {
            spot = { x, z, rot: 0 };
          }
        }
      }
      Object.assign(it, spot || { x: 1, z: 1, rot: 0 });
    }
  }

  removeItem(uidStr) {
    if (this.isStationBusy(uidStr)) return false;
    this.dropSurfaceItems(uidStr);
    this.state.garage.items = this.state.garage.items.filter((i) => i.uid !== uidStr);
    for (const car of this.state.cars) if (car.placed?.mountUid === uidStr) car.placed = this.findCarSpot();
    this.refreshLayout();
    this.state.saveNow();
    return true;
  }

  // ------------------------------------------------------------------------------------
  // Camera & input
  // ------------------------------------------------------------------------------------

  onResize(w, h) {
    this.aspect = w / h;
    if (!this.userZoom && this.size) this.fitZoom();
    else this.updateCamera();
  }

  updateCamera() {
    const z = this.zoom;
    const a = this.aspect || 1.6;
    const cam = this.camera;
    cam.left = -z * a;
    cam.right = z * a;
    cam.top = z;
    cam.bottom = -z;
    cam.updateProjectionMatrix();
    const dir = new THREE.Vector3(Math.cos(ISO_ELEV) * Math.SQRT1_2, Math.sin(ISO_ELEV), Math.cos(ISO_ELEV) * Math.SQRT1_2);
    cam.position.copy(this.target).addScaledVector(dir, 80);
    cam.lookAt(this.target);
  }

  zoomBy(f) {
    this.userZoom = true;
    this.zoom = clamp(this.zoom * f, 4, 22);
    this.updateCamera();
  }

  pickAt(e) {
    this.raycaster.setFromCamera(this.engine.ndc(e), this.camera);
    const targets = [];
    if (this.editor.active) {
      targets.push(...this.itemMeshes.values(), ...this.carMeshes.values());
    } else {
      targets.push(...this.carMeshes.values(), ...this.customers.list.map((c) => c.obj), ...this.friendCars.map((f) => f.obj), ...this.neighborGarages);
    }
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return { obj: o, pick: o.userData.pick };
    }
    return null;
  }

  groundAt(e) {
    this.raycaster.setFromCamera(this.engine.ndc(e), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  onPointerDown(e) {
    this.pointers ||= new Map();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom };
    }
    this.pointer = { down: true, x: e.clientX, y: e.clientY, moved: 0, button: e.button, tx: this.target.x, tz: this.target.z };
  }

  onPointerMove(e) {
    if (this.pointers?.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers?.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      this.userZoom = true;
      this.zoom = clamp(this.pinch.zoom * (this.pinch.dist / dist), 4, 22);
      this.updateCamera();
      this.pointer.moved = 100;
      return;
    }
    const p = this.pointer;
    if (p.down) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.moved = Math.max(p.moved, Math.hypot(dx, dy));
      if (p.moved > 6 && !(this.editor.placing && p.button === 0 && p.moved < 12)) {
        const upp = (2 * this.zoom) / this.engine.height;
        const right = new THREE.Vector3(1, 0, -1).normalize();
        const fwd = new THREE.Vector3(-1, 0, -1).normalize();
        this.target.set(p.tx, 0, p.tz).addScaledVector(right, -dx * upp).addScaledVector(fwd, (dy * upp) / Math.sin(ISO_ELEV));
        const N = this.size;
        this.target.x = clamp(this.target.x, -6, N + 14);
        this.target.z = clamp(this.target.z, -6, N + 14);
        this.updateCamera();
      }
    }
    if (this.editor.placing) {
      const g = this.groundAt(e);
      if (g) this.updateGhost(g.x, g.z);
      return;
    }
    const now = performance.now();
    if (now - this.lastHover > 60) {
      this.lastHover = now;
      const hit = this.pickAt(e);
      this.setHover(hit);
    }
  }

  setHover(hit) {
    const canvas = this.engine.renderer.domElement;
    if (hit) {
      canvas.style.cursor = 'pointer';
      const car = hit.obj.userData.car;
      this.hoverRing.visible = !this.editor.active || hit.pick.type === 'car';
      this.hoverRing.position.set(hit.obj.position.x, 0.03, hit.obj.position.z);
      this.hoverRing.scale.setScalar(car ? car.length / 2.4 : 1);
      this.hoverObj = hit.obj;
    } else {
      canvas.style.cursor = this.editor.placing ? 'crosshair' : 'grab';
      this.hoverRing.visible = false;
      this.hoverObj = null;
    }
  }

  onPointerUp(e) {
    this.pointers?.delete(e.pointerId);
    if (this.pointers && this.pointers.size < 2) this.pinch = null;
    const p = this.pointer;
    if (!p.down) return;
    p.down = false;
    if (p.moved > 6) return;
    if (e.target !== this.engine.renderer.domElement) return;
    if (this.readOnly) return;
    if (this.editor.placing) {
      if (p.button === 2) {
        this.rotatePlacing();
        return;
      }
      const g = this.groundAt(e);
      if (g) this.updateGhost(g.x, g.z);
      this.ui?.onPlaceAttempt?.(this.editor.placing);
      return;
    }
    const hit = this.pickAt(e);
    if (this.editor.active) {
      if (hit && (hit.pick.type === 'item' || hit.pick.type === 'car')) {
        const sel = hit.pick.type === 'car' ? { kind: 'car', id: hit.pick.id } : { kind: 'item', uid: hit.pick.uid };
        this.selectItem(sel);
        this.ui?.onEditorSelect?.(sel, e);
      } else {
        this.selectItem(null);
        this.ui?.onEditorSelect?.(null, e);
      }
      return;
    }
    if (!hit) {
      this.ui?.closePopups?.();
      return;
    }
    if (hit.pick.type === 'car') this.ui?.onCarClick?.(hit.pick.id, e);
    else if (hit.pick.type === 'customer') this.customers.interact(hit.obj.userData.customer);
    else if (hit.pick.type === 'friend') {
      const f = this.friendCars.find((x) => x.obj === hit.obj);
      if (f) this.ui?.onFriendClick?.(f.friend, e);
    }     else if (hit.pick.type === 'neighbor') this.ui?.onNeighborClick?.(hit.pick.friend, e);
  }

  onWheel(e) {
    this.zoomBy(e.deltaY > 0 ? 1.1 : 0.9);
  }

  onKeyDown(e) {
    if (this.editor.placing && (e.code === 'KeyR')) this.rotatePlacing();
    if (this.editor.placing && e.code === 'Escape') {
      this.clearGhost();
      this.ui?.onPlaceCancel?.();
    }
  }

  enter() {
    this.labels.setVisible(true);
    this.updateCamera();
  }

  exit() {
    this.labels.setVisible(false);
    this.engine.renderer.domElement.style.cursor = '';
  }

  update(dt, time) {
    this.time = time;
    this.customers.update(dt);
    this.traffic.update(dt);
    if (!this.readOnly) this.updatePeople(dt);
    this.updateParticles(dt);
    this.animateDecor(dt, time);
    for (const st of this.stations) {
      const mover = st.playerCarObj?.userData.mover;
      if (st.jobArriving && mover && st.playerCarObj) {
        if (mover.update(dt)) {
          delete st.playerCarObj.userData.mover;
          st.jobArriving = false;
          this.positionJobCar(st.playerCarObj, st);
        }
      }
      if (st.playerJob && this.state.activeJobs('own').some((job) => job.id === st.playerJob.id)) {
        const m = this.mechanics.find((x) => x.busy && x.station === st);
        if (m && jobReady(st.playerJob)) this.releaseMechanic(m);
        this.animateStation(st, dt, true, null);
        if (st.jobLabelText) st.jobLabelText.textContent = jobReady(st.playerJob) ? t('jobsReady') : fmtJobTime(jobRemaining(st.playerJob));
      } else if (!st.occupant || st.occupant.phase !== 'working') {
        this.animateStation(st, dt, false, st.occupant);
      }
    }
    if (this.hoverObj && this.hoverRing.visible) this.hoverRing.position.set(this.hoverObj.position.x, 0.03, this.hoverObj.position.z);
    this.hoverRing.material.opacity = 0.6 + Math.sin(time * 6) * 0.25;
    this.labels.update(this.camera, this.engine.width, this.engine.height);
  }

  /** Render a clean "photo" of the garage and return a data URL. */
  photo() {
    this.engine.renderer.render(this.scene, this.camera);
    return this.engine.renderer.domElement.toDataURL('image/png');
  }
}

export { roadLayout };
