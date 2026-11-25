import {
  clearUserForceTutorial,
  createBot,
  createCustomCar,
  createUser,
  deleteBot,
  deleteCustomCar,
  deleteSave,
  deleteUser,
  deleteUserSessions,
  getBot,
  getSave,
  getUserById,
  getUserByUsername,
  insertAudit,
  listCustomCars,
  updateBot,
  updateCustomCar,
  putSave,
  regenerateBotGarages,
  setUserAdmin,
  setUserBanned,
  setUserForceTutorial,
  setUserRankingOptOut,
  updateUserPasswordHash,
} from './db.js';
import { hashPassword, normalizeUsername, validatePassword, validateUsername } from './auth.js';
import { fitBotGarageToLevel, generateBotGarage } from './botGarage.js';

function xpForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(60 * Math.pow(l, 1.45) + 40);
  return total;
}

function wholeNumber(value, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

export function resolveUser(identifier) {
  if (identifier && typeof identifier === 'object' && identifier.id) return getUserById(identifier.id);
  const raw = String(identifier ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return getUserById(Number(raw));
  return getUserByUsername(raw);
}

function botGarage(data = {}) {
  const model = String(data.carModel || 'super');
  const paint = data.paint || '#d9262b';
  return {
    size: 16,
    floor: 'tile',
    wall: 'white',
    ownedFloors: ['tile'],
    ownedWalls: ['white'],
    items: [],
    cars: [{ id: 'bot-car-1', cfg: { model, paint }, placed: { x: 8, z: 8, rot: 0 } }],
  };
}

function cloneJson(value, fallback) {
  try {
    return value == null ? fallback : JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function botGarageCars(bot, fallbackCar = {}) {
  const garage = bot?.garage && typeof bot.garage === 'object' ? bot.garage : {};
  const cars = Array.isArray(garage.cars) ? garage.cars.filter((car) => car && typeof car === 'object') : [];
  if (cars.length) return cloneJson(cars, []);
  return botGarage({ carModel: fallbackCar.model, paint: fallbackCar.paint }).cars;
}

function mergeBotCar(garage, car) {
  const cars = botGarageCars({ garage }, car);
  cars[0] = { ...cars[0], cfg: { ...(cars[0].cfg || {}), model: car.model, paint: car.paint } };
  return { ...garage, cars };
}

export function sanitizeBotGarage(input, fallbackCar = {}) {
  const garage = input && typeof input === 'object' ? input : {};
  const size = Math.max(1, Math.min(100, Math.round(Number(garage.size) || 16)));
  const fallback = botGarage({ carModel: fallbackCar.model, paint: fallbackCar.paint });
  const items = (Array.isArray(garage.items) ? garage.items : []).slice(0, 600)
    .filter((item) => item && typeof item === 'object' && item.type)
    .map((item, i) => ({
      uid: String(item.uid || `bot-item-${i + 1}`).slice(0, 80),
      type: String(item.type).slice(0, 40),
      x: Math.max(0, Math.min(size, Math.round(Number(item.x) || 0))),
      z: Math.max(0, Math.min(size, Math.round(Number(item.z) || 0))),
      rot: ((Math.round(Number(item.rot) || 0) % 4) + 4) % 4,
      ...(item.wall === 'x' || item.wall === 'z' ? { wall: item.wall } : {}),
    }));
  let cars = (Array.isArray(garage.cars) ? garage.cars : []).slice(0, 60)
    .filter((car) => car && typeof car === 'object')
    .map((car, i) => ({
      id: String(car.id || `bot-car-${i + 1}`).slice(0, 80),
      cfg: cloneJson(car.cfg, fallback.cars[0].cfg),
      placed: {
        x: Math.max(0, Math.min(size, Math.round(Number(car.placed?.x) || 0))),
        z: Math.max(0, Math.min(size, Math.round(Number(car.placed?.z) || 0))),
        rot: ((Math.round(Number(car.placed?.rot) || 0) % 4) + 4) % 4,
        ...(car.placed?.mountUid ? { mountUid: String(car.placed.mountUid).slice(0, 80) } : {}),
      },
    }));
  if (!cars.length) cars = fallback.cars;
  return {
    size,
    floor: String(garage.floor || fallback.floor).slice(0, 40),
    wall: String(garage.wall || fallback.wall).slice(0, 40),
    ownedFloors: Array.isArray(garage.ownedFloors)
      ? [...new Set(garage.ownedFloors.map((id) => String(id).slice(0, 40)))]
      : fallback.ownedFloors,
    ownedWalls: Array.isArray(garage.ownedWalls)
      ? [...new Set(garage.ownedWalls.map((id) => String(id).slice(0, 40)))]
      : fallback.ownedWalls,
    items,
    cars,
  };
}

function userGarageLayout(state, targetBot, includeCars) {
  const garage = state?.garage && typeof state.garage === 'object' ? state.garage : null;
  if (!garage) return null;
  const cars = includeCars && Array.isArray(state.cars)
    ? state.cars.filter((car) => car && typeof car === 'object')
    : botGarageCars(targetBot, targetBot.car);
  const layout = sanitizeBotGarage({ ...garage, cars }, targetBot.car);
  if (!includeCars) layout.cars = botGarageCars(targetBot, targetBot.car);
  return layout;
}

function copyBotGarageLayout(source, target) {
  const sourceGarage = source?.garage && typeof source.garage === 'object' ? source.garage : {};
  const targetGarage = target?.garage && typeof target.garage === 'object' ? target.garage : {};
  const fallbackCar = target?.car || source?.car || {};
  const layout = sanitizeBotGarage({
    ...sourceGarage,
    cars: botGarageCars(target, fallbackCar),
  }, fallbackCar);
  return {
    ...layout,
    size: Math.max(Number(layout.size) || 16, Number(targetGarage.size) || 0),
    ownedFloors: [...new Set([...(layout.ownedFloors || []), ...(Array.isArray(targetGarage.ownedFloors) ? targetGarage.ownedFloors : [])])],
    ownedWalls: [...new Set([...(layout.ownedWalls || []), ...(Array.isArray(targetGarage.ownedWalls) ? targetGarage.ownedWalls : [])])],
    cars: botGarageCars(target, fallbackCar),
  };
}

export async function applyAdminAction({
  actor = null,
  action,
  target,
  level,
  coins,
  cash,
  password,
  reason = '',
  ip = '',
  allowWeak = false,
  username = '',
  displayName = '',
  isAdmin = false,
  name = '',
  handle = '',
  carModel = '',
  paint = '',
  visitable = true,
  challengeable = true,
  enabled = true,
  baseModel = '',
  brand = '',
  carClass = '',
  price = '',
  hp = '',
  kg = '',
  grip = '',
  gears = '',
  redline = '',
  sort = '',
  sourceBot = '',
  sourceUser = '',
  includeCars = true,
  garage = null,
  force = false,
} = {}) {
  const contentAudit = (actionName, detail = '') =>
    insertAudit({
      adminId: actor?.id ?? null,
      adminName: actor?.username ?? 'cli',
      targetId: null,
      targetName: name || username || handle || String(target || ''),
      action: actionName,
      detail,
      ip,
    });

  if (action === 'create-user') {
    const clean = normalizeUsername(username);
    const nameError = validateUsername(clean);
    if (nameError) return { ok: false, error: 'username', message: nameError };
    const passwordError = allowWeak ? (!password ? 'Contraseña vacía.' : '') : validatePassword(password);
    if (passwordError) return { ok: false, error: 'password', message: passwordError };
    if (getUserByUsername(clean)) return { ok: false, error: 'exists', message: 'Ese usuario ya existe.' };
    const created = createUser(clean, String(displayName || clean).slice(0, 40), await hashPassword(password));
    if (isAdmin) setUserAdmin(created.id, true);
    contentAudit('create-user', `Cuenta ${clean} creada${isAdmin ? ' como admin' : ''}`);
    return { ok: true, message: `Cuenta ${clean} creada.` };
  }

  if (action === 'create-bot' || action === 'update-bot') {
    const botName = String(name || handle || '').trim();
    if (!botName) return { ok: false, error: 'name', message: 'El bot necesita un nombre.' };
    const current = action === 'update-bot' ? getBot(Number(target)) : null;
    if (action === 'update-bot' && !current) return { ok: false, error: 'not_found', message: 'Bot no encontrado.' };
    const car = {
      model: String(carModel || current?.car?.model || 'super'),
      paint: String(paint || current?.car?.paint || '#d9262b'),
    };
    const payload = {
      name: botName,
      handle: handle || botName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      level: wholeNumber(level, 1) || 1,
      car,
      visitable: visitable !== false,
      challengeable: challengeable !== false,
      active: enabled !== false,
    };
    if (action === 'create-bot') {
      const bot = createBot({ ...payload, garage: sanitizeBotGarage(generateBotGarage(payload), car) });
      contentAudit('create-bot', `${bot.name} (#${bot.id})`);
      return { ok: true, message: `Bot ${bot.name} creado.` };
    }
    const bot = updateBot(Number(target), {
      ...payload,
      garage: mergeBotCar(sanitizeBotGarage(fitBotGarageToLevel(current.garage, payload.level ?? current.level), current.car), car),
    });
    contentAudit('update-bot', `${bot.name} (#${bot.id})`);
    return { ok: true, message: `Bot ${bot.name} actualizado.` };
  }

  if (action === 'copy-bot-garage') {
    const source = getBot(Number(sourceBot));
    if (!source) return { ok: false, error: 'not_found', message: 'Bot origen no encontrado.' };
    const targetBot = getBot(Number(target));
    if (!targetBot) return { ok: false, error: 'not_found', message: 'Bot destino no encontrado.' };
    if (source.id === targetBot.id) return { ok: false, error: 'same_bot', message: 'Elige dos bots distintos.' };
    const updated = updateBot(targetBot.id, { garage: copyBotGarageLayout(source, targetBot) });
    contentAudit('copy-bot-garage', `${source.name} (#${source.id}) → ${updated.name} (#${updated.id})`);
    return { ok: true, message: `Decoración copiada de ${source.name} a ${updated.name}.` };
  }

  if (action === 'copy-user-garage') {
    const sourceAccount = resolveUser(sourceUser);
    if (!sourceAccount) return { ok: false, error: 'not_found', message: 'Cuenta origen no encontrada.' };
    const targetBot = getBot(Number(target));
    if (!targetBot) return { ok: false, error: 'not_found', message: 'Bot destino no encontrado.' };
    const save = getSave(sourceAccount.id);
    if (!save?.state) return { ok: false, error: 'no_save', message: 'Esa cuenta no tiene una partida guardada.' };
    const layout = userGarageLayout(save.state, targetBot, includeCars !== false);
    if (!layout) return { ok: false, error: 'no_garage', message: 'La partida no tiene taller.' };
    const updated = updateBot(targetBot.id, { garage: layout });
    contentAudit('copy-user-garage', `${sourceAccount.username} (#${sourceAccount.id}) → ${updated.name} (#${updated.id})${includeCars !== false ? ' + coches' : ''}`);
    return { ok: true, message: `Taller de ${sourceAccount.username} copiado a ${updated.name}${includeCars !== false ? ' con sus coches' : ' sin coches'}.` };
  }

  if (action === 'save-bot-garage') {
    const bot = getBot(Number(target));
    if (!bot) return { ok: false, error: 'not_found', message: 'Bot no encontrado.' };
    const updated = updateBot(bot.id, { garage: sanitizeBotGarage(garage, bot.car) });
    contentAudit('save-bot-garage', `${updated.name} (#${updated.id})`);
    return { ok: true, message: `Garaje de ${updated.name} guardado.` };
  }

  if (action === 'regenerate-bot-garages') {
    const count = regenerateBotGarages({ force: force === true || force === 'true' || force === 1 });
    contentAudit('regenerate-bot-garages', `${count} bots`);
    return { ok: true, message: `${count} talleres de bots regenerados.` };
  }

  if (action === 'delete-bot') {
    deleteBot(Number(target));
    contentAudit('delete-bot', `#${target}`);
    return { ok: true, message: 'Bot eliminado.' };
  }

  if (action === 'create-car' || action === 'update-car') {
    const carName = String(name || '').trim();
    if (!carName) return { ok: false, error: 'name', message: 'El coche necesita un nombre.' };
    const payload = {
      id: String(target || '').trim() || String(carName).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40),
      baseModel: baseModel || 'super',
      name: carName,
      brand: brand || 'RSILVA',
      class: carClass || 'Custom',
      price: wholeNumber(price, 0),
      level: wholeNumber(level, 1) || 1,
      cash: wholeNumber(cash, 0),
      paint: paint || null,
      finish: '',
      hp: wholeNumber(hp, null),
      kg: wholeNumber(kg, null),
      grip: grip === '' ? null : Number(grip),
      gears: wholeNumber(gears, null),
      redline: wholeNumber(redline, null),
      enabled: enabled !== false,
      sort: wholeNumber(sort, 0),
    };
    try {
      const car = action === 'create-car'
        ? createCustomCar(payload)
        : updateCustomCar(target, payload);
      if (!car) return { ok: false, error: 'not_found', message: 'Coche no encontrado.' };
      contentAudit(action, `${car.name} (${car.id})`);
      return { ok: true, message: `Coche ${car.name} ${action === 'create-car' ? 'creado' : 'actualizado'}.` };
    } catch (error) {
      return { ok: false, error: 'car', message: error.message || 'No se pudo guardar el coche.' };
    }
  }

  if (action === 'delete-car') {
    deleteCustomCar(String(target || ''));
    contentAudit('delete-car', String(target || ''));
    return { ok: true, message: 'Coche eliminado.' };
  }

  void listCustomCars;
  const user = resolveUser(target);
  if (!user) return { ok: false, error: 'user_not_found', message: 'Usuario no encontrado.' };

  const audit = (detail = '') =>
    insertAudit({
      adminId: actor?.id ?? null,
      adminName: actor?.username ?? 'cli',
      targetId: user.id,
      targetName: user.username,
      action,
      detail,
      ip,
    });

  const self = actor && Number(actor.id) === Number(user.id);

  switch (action) {
    case 'force-tutorial':
      setUserForceTutorial(user.id, true);
      audit('Tutorial forzado en el próximo login');
      return { ok: true, message: `Tutorial forzado para ${user.username}.` };

    case 'clear-tutorial':
      clearUserForceTutorial(user.id);
      audit('Tutorial forzado desactivado');
      return { ok: true, message: `Tutorial forzado desactivado para ${user.username}.` };

    case 'ban':
      if (self) return { ok: false, error: 'self', message: 'No puedes banear tu propia cuenta.' };
      setUserBanned(user.id, true, reason);
      audit(`Baneado: ${reason || 'sin motivo'}`);
      return { ok: true, message: `${user.username} baneado y sesiones cerradas.` };

    case 'unban':
      setUserBanned(user.id, false);
      audit('Desbaneado');
      return { ok: true, message: `${user.username} desbaneado.` };

    case 'admin':
      setUserAdmin(user.id, true);
      audit('Rol de administrador concedido');
      return { ok: true, message: `${user.username} ahora es administrador.` };

    case 'unadmin':
      if (self) return { ok: false, error: 'self', message: 'No puedes quitarte el rol de administrador.' };
      setUserAdmin(user.id, false);
      audit('Rol de administrador retirado');
      return { ok: true, message: `${user.username} ya no es administrador.` };

    case 'reset-sessions':
      deleteUserSessions(user.id);
      audit('Sesiones revocadas');
      return { ok: true, message: `Sesiones de ${user.username} cerradas.` };

    case 'reset-game':
      deleteSave(user.id);
      audit('Partida borrada');
      return { ok: true, message: `Partida de ${user.username} borrada.` };

    case 'reset-password': {
      const error = allowWeak ? '' : validatePassword(password);
      if (error) return { ok: false, error: 'password', message: error };
      updateUserPasswordHash(user.id, await hashPassword(password));
      deleteUserSessions(user.id);
      audit('Contraseña restablecida y sesiones revocadas');
      return { ok: true, message: `Contraseña de ${user.username} actualizada y sesiones cerradas.` };
    }

    case 'set-level': {
      const save = getSave(user.id);
      if (!save?.state) return { ok: false, error: 'no_save', message: 'Ese usuario aún no tiene partida.' };
      const current = Math.max(1, Number(save.state.level) || 1);
      const nextLevel = Math.max(1, Math.min(500, wholeNumber(level, current)));
      save.state.level = nextLevel;
      save.state.xp = xpForLevel(nextLevel + 1) - 1;
      putSave(user.id, save.state);
      audit(`Nivel ajustado a ${nextLevel}`);
      return { ok: true, message: `Nivel de ${user.username} ajustado a ${nextLevel}.` };
    }

    case 'set-money': {
      const save = getSave(user.id);
      if (!save?.state) return { ok: false, error: 'no_save', message: 'Ese usuario aún no tiene partida.' };
      save.state.coins = wholeNumber(coins, Math.max(0, Number(save.state.coins) || 0));
      save.state.cash = wholeNumber(cash, Math.max(0, Number(save.state.cash) || 0));
      putSave(user.id, save.state);
      audit(`Dinero ajustado: ${save.state.coins} monedas, ${save.state.cash} cash`);
      return { ok: true, message: `Dinero de ${user.username} actualizado.` };
    }

    case 'ranking-opt-out':
      setUserRankingOptOut(user.id, true);
      audit('Excluido del ranking global');
      return { ok: true, message: `${user.username} excluido del ranking.` };

    case 'ranking-opt-in':
      setUserRankingOptOut(user.id, false);
      audit('Incluido en el ranking global');
      return { ok: true, message: `${user.username} incluido en el ranking.` };

    case 'delete':
      if (self) return { ok: false, error: 'self', message: 'No puedes borrar tu propia cuenta.' };
      deleteUser(user.id);
      audit('Cuenta eliminada');
      return { ok: true, message: `Cuenta ${user.username} eliminada.` };

    default:
      return { ok: false, error: 'unknown_action', message: 'Acción desconocida.' };
  }
}
