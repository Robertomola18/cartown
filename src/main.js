import './ui/styles.css';
import { Engine } from './core/engine.js';
import { App } from './app.js';
import { warmTemplates } from './cars/carFactory.js';
import { allModelIds } from './cars/models.js';
import { registerCustomCars } from './game/customCars.js';
import { apiUrl, csrfToken, redirectLogin } from './core/api.js';

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function fetchCustomCars() {
  try {
    const catalogRes = await fetch(apiUrl('/api/catalog'), { credentials: 'same-origin', cache: 'no-store' });
    if (catalogRes.ok) {
      const catalog = await catalogRes.json();
      return Array.isArray(catalog?.cars) ? catalog.cars : [];
    }
  } catch { /* built-in catalog still works */ }
  return [];
}

function adminBotState(bot) {
  const garage = bot.garage && typeof bot.garage === 'object' ? bot.garage : {};
  const fallbackCar = bot.car || { model: 'super', paint: '#d9262b' };
  const cars = (Array.isArray(garage.cars) ? garage.cars : []).map((car, i) => ({
    id: String(car.id || `bot-car-${i + 1}`),
    cfg: car.cfg || fallbackCar,
    placed: car.placed || { x: 8, z: 8, rot: 0 },
  }));
  if (!cars.length) cars.push({ id: 'bot-car-1', cfg: fallbackCar, placed: { x: 8, z: 8, rot: 0 } });
  const floor = garage.floor || 'tile';
  const wall = garage.wall || 'white';
  return {
    version: 1,
    started: true,
    player: { name: bot.name || 'Bot', avatar: bot.avatar || { skin: '#f1c7a3', hair: '#3b2414', shirt: '#d9262b', style: 'short' } },
    coins: 999999999,
    cash: 999999999,
    xp: 0,
    level: 500,
    fuel: 10,
    fuelTs: Date.now(),
    cars,
    activeCar: cars[0]?.id || null,
    garage: {
      size: Math.max(1, Number(garage.size) || 16),
      floor,
      wall,
      ownedFloors: [...new Set([...(Array.isArray(garage.ownedFloors) ? garage.ownedFloors : []), floor])],
      ownedWalls: [...new Set([...(Array.isArray(garage.ownedWalls) ? garage.ownedWalls : []), wall])],
      items: Array.isArray(garage.items) ? garage.items : [],
    },
    friends: [],
    stats: { served: 0, races: 0, wins: 0, earned: 0, driven: 0 },
    goals: null,
    jobs: [],
    staff: { mechanics: 2 },
    settings: { sfx: true, music: true, lang: 'es', quality: 'high' },
  };
}

async function loadBoot() {
  const sessionRes = await fetch(apiUrl('/api/session'), {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (sessionRes.status === 401) {
    redirectLogin();
    return null;
  }
  if (!sessionRes.ok) throw new Error('No se pudo validar la sesión');
  const session = await sessionRes.json();
  const customCars = await fetchCustomCars();
  const adminBotId = Number(new URLSearchParams(window.location.search).get('adminBot'));
  if (adminBotId) {
    const res = await fetch(apiUrl(`/api/admin/bot-garage?id=${adminBotId}`), {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('No se pudo cargar el garaje del bot');
    const data = await res.json();
    const bot = data?.bot;
    if (!bot) throw new Error('Bot no encontrado');
    return {
      session,
      save: { state: adminBotState(bot), revision: 0 },
      customCars,
      adminBot: { id: bot.id, name: bot.name, backUrl: apiUrl('/admin') },
    };
  }
  const stateRes = await fetch(apiUrl('/api/state'), {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (stateRes.status === 401) {
    redirectLogin();
    return null;
  }
  if (!stateRes.ok) throw new Error('No se pudo cargar la partida');
  const save = await stateRes.json();
  return { session, save, customCars };
}

async function boot() {
  const loading = document.getElementById('loading');
  const bar = loading.querySelector('.load-bar i');
  const text = loading.querySelector('.load-text');
  const bootData = await loadBoot();
  if (!bootData) return;
  const engine = new Engine(document.getElementById('app'));
  registerCustomCars(bootData.customCars);
  const modelIds = allModelIds();
  // Build every car body once up front so the garage never hitches.
  for (let i = 0; i < modelIds.length; i++) {
    warmTemplates([modelIds[i]], 'low');
    bar.style.width = `${Math.round(((i + 1) / (modelIds.length + 2)) * 100)}%`;
    text.textContent = `Building cars… ${i + 1}/${modelIds.length}`;
    await frame();
  }
  text.textContent = 'Opening the garage…';
  await frame();
  const app = new App(engine, document.getElementById('ui'), {
    remote: true,
    state: bootData.save.state,
    revision: bootData.save.revision ?? 0,
    user: bootData.session.user,
    forceTutorial: bootData.session.forceTutorial,
  });
  const adminBot = bootData.adminBot;
  if (adminBot) {
    app.adminBot = adminBot;
    app.state.remote = false;
    app.state.save = () => {
      clearTimeout(app.state._saveTimer);
      app.state._saveTimer = setTimeout(() => app.state.saveNow(), 300);
    };
    app.state.saveNow = async () => {
      const res = await fetch(apiUrl('/api/admin/bot-garage'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({ id: adminBot.id, garage: app.state.data.garage }),
      });
      if (!res.ok) console.warn('No se pudo guardar el garaje del bot', res.status);
    };
  }
  app.init();
  window.carTown = app;
  if (adminBot) {
    document.title = `Garaje de ${adminBot.name} · Car Town`;
    app.openEditor();
  }
  window.addEventListener('pagehide', () => app.state.saveNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') app.state.flushRemote();
  });
  bar.style.width = '100%';
  await frame();
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);
}

boot().catch((e) => {
  console.error(e);
  const t = document.querySelector('#loading .load-text');
  if (t) t.textContent = `Something went wrong: ${e.message}`;
});
