// Offscreen renderer that produces small studio thumbnails of cars and
// garage items for the shop UIs. Results are cached as data URLs.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar } from '../cars/carFactory.js';
import { buildItem, footprint } from '../world/props.js';
import { floorTexture, wallTexture } from '../world/textures.js';

let renderer = null;
let scene = null;
let camera = null;
const cache = new Map();
const queue = [];
const MAX_THUMBS = 96;
let busy = false;

function cached(key) {
  if (!cache.has(key)) return null;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function remember(key, value) {
  cache.set(key, value);
  if (cache.size > MAX_THUMBS) cache.delete(cache.keys().next().value);
}

function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(192, 120);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.3));
  const d = new THREE.DirectionalLight(0xffffff, 2);
  d.position.set(3, 6, 4);
  scene.add(d);
  camera = new THREE.PerspectiveCamera(28, 192 / 120, 0.1, 50);
}

function render(obj, { dist = 6.4, height = 2.2, ty = 0.55, yaw = 0.75 } = {}) {
  init();
  scene.add(obj);
  obj.rotation.y = yaw;
  camera.position.set(Math.sin(0.4) * dist, height, Math.cos(0.4) * dist);
  camera.lookAt(0, ty, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.82);
  scene.remove(obj);
  return url;
}

function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    const job = queue.shift();
    if (!job) {
      busy = false;
      return;
    }
    if (cached(job.key) === null) {
      try {
        remember(job.key, job.make());
      } catch (e) {
        console.warn('thumb failed', e);
        remember(job.key, '');
      }
    }
    const url = cached(job.key);
    for (const cb of job.cbs) cb(url);
    setTimeout(step, 0);
  };
  step();
}

function request(key, make, cb) {
  const hit = cached(key);
  if (hit !== null) {
    cb(hit);
    return;
  }
  const existing = queue.find((j) => j.key === key);
  if (existing) existing.cbs.push(cb);
  else queue.push({ key, make, cbs: [cb] });
  pump();
}

export function carThumb(cfg, imgEl) {
  const key = `car:${JSON.stringify(cfg)}`;
  request(key, () => {
    const car = createCar(cfg, { blobShadow: true, lod: 'low' });
    const L = car.userData.car.length;
    const url = render(car, { dist: 3.2 + L * 1.55, height: 1.9 + L * 0.35 });
    car.userData.car.dispose();
    return url;
  }, (url) => { if (url) imgEl.src = url; });
}

function disposeObject(root) {
  root.traverse((node) => {
    const car = node.userData?.car;
    if (car) {
      car.dispose();
      return;
    }
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.userData?.car) return;
    }
    node.geometry?.dispose();
    const material = node.material;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose());
    else material?.dispose();
  });
}

export function itemThumb(type, imgEl) {
  request(`item:${type}`, () => {
    const g = buildItem(type);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y * 1.3, size.z);
    const url = render(g, { dist: 1.5 + r * 2.1, height: 0.8 + r * 0.9, ty: size.y * 0.45, yaw: 0.6 });
    disposeObject(g);
    return url;
  }, (url) => { if (url) imgEl.src = url; });
}

export function garageThumb(garage = {}, imgEl) {
  const data = {
    size: Math.max(8, Math.min(22, Math.round(Number(garage.size) || 14))),
    floor: garage.floor || 'tile',
    wall: garage.wall || 'white',
    items: (Array.isArray(garage.items) ? garage.items : []).slice(0, 24),
    cars: (Array.isArray(garage.cars) ? garage.cars : []).slice(0, 3),
  };
  const key = `garage:${JSON.stringify(data)}`;
  request(key, () => {
    const N = data.size;
    const g = new THREE.Group();
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(data.floor, N), roughness: 0.7 });
    const edge = new THREE.MeshStandardMaterial({ color: '#8d9096', roughness: 0.8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(N, 0.2, N), [edge, edge, floorMat, edge, edge, edge]);
    slab.position.set(N / 2, -0.1, N / 2);
    g.add(slab);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(data.wall), roughness: 0.8 });
    const wz = new THREE.Mesh(new THREE.BoxGeometry(N, 2.4, 0.2), wallMat);
    wz.position.set(N / 2, 1.2, -0.1);
    const wx = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, N), wallMat);
    wx.position.set(-0.1, 1.2, N / 2);
    g.add(wz, wx);
    for (const it of data.items) {
      if (!it || it.wall || !it.type) continue;
      const f = footprint(it.type, Number(it.rot) || 0);
      const mesh = buildItem(it.type);
      if (!mesh) continue;
      mesh.position.set((Number(it.x) || 0) + f.w / 2, 0, (Number(it.z) || 0) + f.d / 2);
      mesh.rotation.y = ((Number(it.rot) || 0) * Math.PI) / 2;
      g.add(mesh);
    }
    for (const car of data.cars) {
      if (!car?.cfg) continue;
      const mesh = createCar(car.cfg, { lod: 'low' });
      const p = car.placed || {};
      mesh.position.set((Number(p.x) || 0) + 1.5, 0, (Number(p.z) || 0) + 1);
      mesh.rotation.y = ((Number(p.rot) || 0) * Math.PI) / 2;
      g.add(mesh);
    }
    const wrap = new THREE.Group();
    g.position.set(-N / 2, 0, -N / 2);
    wrap.add(g);
    const url = render(wrap, { dist: N * 0.62, height: N * 0.42, ty: 1.1, yaw: 0.65 });
    disposeObject(wrap);
    return url;
  }, (url) => { if (url) imgEl.src = url; });
}
