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
const lowMemory = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let busy = false;

function svgUrl(markup) {
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

function safeColor(value, fallback) {
  const text = String(value || '');
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

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
  if (lowMemory) {
    const paint = safeColor(cfg?.paint, '#d9262b');
    const roof = safeColor(cfg?.roof, '#20324a');
    imgEl.src = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 120"><defs><linearGradient id="bg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#bfe8ff"/><stop offset="1" stop-color="#edf8ff"/></linearGradient></defs><rect width="192" height="120" rx="12" fill="url(#bg)"/><ellipse cx="96" cy="94" rx="62" ry="8" fill="#000" opacity=".18"/><path d="M38 74 L48 56 Q54 45 68 44 L124 44 Q138 45 145 56 L154 74 Z" fill="${paint}"/><path d="M62 56 Q67 48 78 48 L91 48 L91 59 L55 59 Z M96 48 L120 48 Q130 49 136 59 L96 59 Z" fill="${roof}" opacity=".9"/><rect x="34" y="70" width="124" height="17" rx="8" fill="${paint}"/><circle cx="63" cy="87" r="9" fill="#1c2026"/><circle cx="129" cy="87" r="9" fill="#1c2026"/><rect x="146" y="68" width="10" height="5" rx="2" fill="#ffe9a8"/></svg>`);
    return;
  }
  const key = `car:${JSON.stringify(cfg)}`;
  request(key, () => {
    const car = createCar(cfg, { blobShadow: true, lod: 'low' });
    const L = car.userData.car.length;
    const url = render(car, { dist: 3.2 + L * 1.55, height: 1.9 + L * 0.35 });
    car.userData.car.dispose();
    return url;
  }, (url) => { if (url) imgEl.src = url; });
}

export function itemThumb(type, imgEl) {
  if (lowMemory) {
    imgEl.src = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 120"><rect width="192" height="120" rx="12" fill="#eef4fa"/><rect x="52" y="26" width="88" height="68" rx="14" fill="#dbeafe" stroke="#94a3b8" stroke-width="4"/><path d="M70 48 H122 M70 62 H108 M70 76 H116" stroke="#64748b" stroke-width="6" stroke-linecap="round"/></svg>');
    return;
  }
  request(`item:${type}`, () => {
    const g = buildItem(type);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y * 1.3, size.z);
    return render(g, { dist: 1.5 + r * 2.1, height: 0.8 + r * 0.9, ty: size.y * 0.45, yaw: 0.6 });
  }, (url) => { if (url) imgEl.src = url; });
}

export function garageThumb(garage = {}, imgEl) {
  if (lowMemory) {
    const cars = (Array.isArray(garage?.cars) ? garage.cars : []).slice(0, 3)
      .map((entry, i) => `<rect x="${34 + i * 48}" y="66" width="38" height="15" rx="6" fill="${safeColor(entry?.cfg?.paint, '#d9262b')}"/>`)
      .join('');
    imgEl.src = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 120"><rect width="192" height="120" rx="12" fill="#dbeafe"/><rect x="12" y="20" width="168" height="82" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="4"/><rect x="12" y="84" width="168" height="18" fill="#cbd5e1"/>${cars}</svg>`);
    return;
  }
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
    return render(wrap, { dist: N * 0.62, height: N * 0.42, ty: 1.1, yaw: 0.65 });
  }, (url) => { if (url) imgEl.src = url; });
}
