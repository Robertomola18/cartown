// Ties the engine, game state, scenes and UI together and switches between
// modes (garage, editor, dealer, customize, race, town).

import { GameState } from './game/state.js';
import { GarageScene } from './scenes/garageScene.js';
import { ShowroomScene } from './scenes/showroomScene.js';
import { RaceScene } from './scenes/raceScene.js';
import { TownScene } from './scenes/townScene.js';
import { WorldLabels } from './ui/labels.js';
import { Hud } from './ui/hud.js';
import { DealerUI } from './ui/dealer.js';
import { CustomizeUI } from './ui/customize.js';
import { EditorUI } from './ui/editorUI.js';
import { RaceUI } from './ui/raceUI.js';
import { TownUI } from './ui/townUI.js';
import { openGoals, openLuxury, openSettings, openOnboarding } from './ui/panels.js';
import { openSocial, openChat } from './ui/social.js';
import { openTutorial, tutorialIsOpen } from './ui/tutorial.js';
import { openJobs } from './ui/jobs.js';
import { makeVisitState } from './game/visitState.js';
import { socialApi } from './game/social.js';
import { setUiRoot, toast, banner, popupMenu, popupCard, closePopup, confirmDialog } from './ui/dom.js';
import { garageThumb } from './ui/thumbs.js';
import { GOAL_DEFS } from './game/catalog.js';
import { MODELS } from './cars/models.js';
import { carSellValue } from './game/catalog.js';
import { setLang, t } from './core/i18n.js';
import { audio } from './core/audio.js';
import { el, fmt, fmtJobTime } from './core/util.js';
import { jobRemaining } from './game/jobs.js';
import { setCarLightLevel } from './cars/carFactory.js';

export class App {
  constructor(engine, uiRoot, boot = {}) {
    this.engine = engine;
    this.uiRoot = uiRoot;
    this.user = boot.user || null;
    this.forceTutorial = Boolean(boot.forceTutorial);
    setUiRoot(uiRoot);
    this.state = new GameState(boot.state, {
      remote: Boolean(boot.remote),
      userId: boot.user?.id,
      revision: boot.revision ?? 0,
    });
    const s = this.state.data.settings;
    setLang(s.lang);
    audio.sfxOn = s.sfx;
    audio.musicOn = s.music;
    this.applyQuality(s.quality);
    setCarLightLevel(0.35);
    this.labels = new WorldLabels(uiRoot);
    this.mode = 'garage';
  }

  init() {
    const app = this;
    this.garage = new GarageScene(this.engine, this.state, this.labels);
    this.garage.ui = this;
    this.showroom = new ShowroomScene(this.engine);
    this.raceScene = new RaceScene(this.engine);
    this.town = null; // built lazily on first visit
    this.hud = new Hud(this);
    this.dealer = new DealerUI(this);
    this.customize = new CustomizeUI(this);
    this.editor = new EditorUI(this);
    this.race = new RaceUI(this);
    this.townUI = new TownUI(this);
    this.engine.onFrame((dt) => {
      if (app.mode === 'race') app.race.update(dt);
      if (app.mode === 'town') app.townUI.update(dt);
    });
    this.state.on('levelup', (lvl) => {
      audio.levelUp();
      banner(t('levelUp'), `${t('level')} ${lvl}`, 'gold', 2600);
    });
    this.state.on('goal', (def) => toast(`★ ${t(`goal.${def.id}`, { n: fmt(def.n) })} — ${t('claim')}!`, 'good', 3200));
    this.state.on('saveConflict', () => toast(t('saveConflict'), 'warn', 7000));
    this.state.on('sessionExpired', () => toast(t('sessionExpired'), 'warn', 7000));
    // unlock audio on first interaction
    const unlock = () => {
      audio.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.goGarage();
    this.restorePendingScene();
    if (!this.state.data.started) {
      openOnboarding(this, () => {
        this.garage.build();
        this.hud.refreshAll();
        this.maybeStartTutorial();
      });
    } else {
      const ready = this.state.completedJobs().length;
      if (ready) setTimeout(() => toast(t('jobsReadyToast', { n: ready }), 'good', 3800), 900);
      this.maybeStartTutorial();
    }
    if (this.state.remote && this.user) {
      this._linkTried = new Set();
      setTimeout(() => this.refreshSocial(), 900);
      this._socialTimer = setInterval(() => this.refreshSocial({ quiet: true }), 60 * 1000);
      this._socialFocus = () => this.refreshSocial({ quiet: true });
      window.addEventListener('focus', this._socialFocus);
    }
  }

  socialFriend(f) {
    return {
      id: `srv_${f.id}`,
      serverUserId: Number(f.id),
      username: f.username || '',
      name: f.name || f.username || 'Player',
      avatar: f.avatar || {},
      level: Math.max(1, Number(f.level) || 1),
      wins: Math.max(0, Number(f.wins) || 0),
      car: f.car || { model: 'hatch' },
      imported: false,
      online: true,
    };
  }

  mergeSocialFriends(friends = []) {
    const current = Array.isArray(this.state.data.friends) ? this.state.data.friends : [];
    const serverIds = new Set((friends || []).map((f) => Number(f?.id)).filter((id) => id > 0));
    const list = this.state.data.friends = current.filter((f) => !f.serverUserId || f.imported || serverIds.has(Number(f.serverUserId)));
    let changed = list.length !== current.length;
    for (const server of friends) {
      if (!server || !server.id) continue;
      const serverUserId = Number(server.id);
      let local = list.find((f) => Number(f.serverUserId) === serverUserId);
      if (!local) local = list.find((f) => !f.serverUserId && f.name && f.name.toLowerCase() === String(server.name || '').toLowerCase());
      if (local) {
        const next = { ...local, serverUserId, username: server.username || local.username || '', level: server.level || local.level, wins: server.wins || local.wins || 0, car: server.car || local.car || { model: 'hatch' }, imported: local.imported, online: true, avatar: server.avatar || local.avatar || {} };
        if (JSON.stringify(next) !== JSON.stringify(local)) { Object.assign(local, next); changed = true; }
      } else {
        list.push(this.socialFriend(server));
        changed = true;
      }
    }
    if (changed) {
      this.state.emit('friends');
      this.state.save();
      this.garage?.buildFriends();
    }
    return changed;
  }

  async linkImportedFriends() {
    const list = this.state.data.friends || [];
    let changed = false;
    for (const f of list) {
      if (!f.imported || f.serverUserId || !f.name) continue;
      const key = f.id || f.name;
      if (this._linkTried?.has(key)) continue;
      this._linkTried?.add(key);
      try {
        const res = await socialApi.linkFriend({ username: f.username, name: f.name, level: f.level, model: f.car?.model });
        if (res?.friend) {
          f.serverUserId = Number(res.friend.id);
          f.username = res.friend.username || f.username || '';
          f.level = res.friend.level || f.level;
          f.wins = res.friend.wins || f.wins || 0;
          f.car = res.friend.car || f.car || { model: 'hatch' };
          f.avatar = res.friend.avatar || f.avatar || {};
          f.online = true;
          f.imported = true;
          changed = true;
        }
      } catch { /* no matching account yet */ }
    }
    if (changed) {
      this.state.emit('friends');
      this.state.save();
      this.garage?.buildFriends();
      this.hud?.refreshAll();
    }
    return changed;
  }

  async claimRaceResults() {
    try {
      const res = await socialApi.claimRaces();
      for (const result of (res.results || [])) {
        if (result.coins) this.state.addCoins(result.coins);
        if (result.xp) this.state.addXp(result.xp);
        const title = t(result.won ? 'youWin' : 'youLose');
        banner(title, t('raceVsFriend', { name: result.opponentName }), result.won ? 'green' : 'gold', 3200);
        if (result.coins || result.xp) toast(t('raceAsyncReward', { n: fmt(result.coins), xp: result.xp }), 'good', 3600);
      }
      if (res.results?.length) this.state.save();
    } catch { /* offline or no results */ }
  }

  async refreshSocial({ quiet = false } = {}) {
    if (!this.state.remote || !this.user || this._socialBusy) return;
    this._socialBusy = true;
    try {
      const data = await socialApi.overview();
      this.socialData = data;
      this.mergeSocialFriends(data.friends || []);
      await this.linkImportedFriends();
      await this.claimRaceResults();
      this.state.data.friends = [...(this.state.data.friends || [])];
    } catch (error) {
      if (!quiet) console.warn('social sync', error);
    } finally {
      this._socialBusy = false;
    }
  }

  maybeStartTutorial() {
    const force = this.forceTutorial;
    if (!force && this.state.data.settings.tutorialDone) return;
    let attempts = 0;
    const tryOpen = () => {
      if (tutorialIsOpen()) return;
      if (this.mode !== 'garage' || document.querySelector('.modal-overlay')) {
        if (++attempts < 40) setTimeout(tryOpen, 500);
        return;
      }
      openTutorial(this, { force });
    };
    setTimeout(tryOpen, force ? 500 : 1000);
  }

  // ---------------------------------------------------------------------------------
  // Modes
  // ---------------------------------------------------------------------------------

  setMode(mode) {
    this.mode = mode;
    document.body.dataset.mode = mode;
    this.hud.setMode(mode);
    closePopup();
  }

  restorePendingScene() {
    let scene = null;
    try {
      const url = new URL(location.href);
      const value = url.searchParams.get('goto');
      if (value === 'race' || value === 'town') scene = value;
      if (value !== null) {
        url.searchParams.delete('goto');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      }
    } catch {}
    try { sessionStorage.removeItem('cartown:pendingScene'); } catch {}
    if (scene === 'race') this.openRaceMenu();
    else if (scene === 'town') this.goTown();
  }

  _navGuard(key) {
    this._navBusy = this._navBusy || {};
    if (Date.now() - (this._navBusy[key] || 0) < 500) return false;
    this._navBusy[key] = Date.now();
    return true;
  }

  goGarage() {
    this.returnTo = null;
    this.setMode('garage');
    this.showroom.exit();
    this.engine.setScene(this.garage);
    this.labels.setVisible(true);
  }

  openDealer() {
    this.returnTo = this.mode === 'town' ? 'town' : null;
    audio.click();
    this.engine.setScene(this.showroom);
    this.labels.setVisible(false);
    this.dealer.open();
  }

  openCustomize(carId) {
    this.returnTo = this.mode === 'town' ? 'town' : null;
    audio.click();
    this.engine.setScene(this.showroom);
    this.labels.setVisible(false);
    this.customize.open(carId);
  }

  openEditor() {
    audio.click();
    this.editor.open();
  }

  openRaceMenu(preset) {
    if (!this._navGuard('race')) return;
    this.returnTo = this.mode === 'town' ? 'town' : null;
    if (!preset?.friend) {
      const car = preset?.carId ? this.state.getCar(preset.carId) : this.state.activeCar;
      if (car && this.state.isCarBusy(car.id)) {
        toast(t('editorCarInWorkshop'), 'warn');
        return;
      }
    }
    audio.click();
    if (this.mode !== 'garage' && this.mode !== 'town') this.goGarage();
    try {
      this.race.openMenu(preset);
    } catch (error) {
      console.warn('openRaceMenu', error);
      toast(`${t('socialError')}: ${error?.message || error}`, 'warn', 6000);
      this.returnTo = null;
      this.goGarage();
    }
  }

  goBack() {
    if (this.returnTo === 'town') {
      this.returnTo = null;
      this.goTown();
      return;
    }
    this.returnTo = null;
    this.goGarage();
  }

  goTown({ reset = false } = {}) {
    if (!this._navGuard('town')) return;
    if (this.state.isCarBusy(this.state.activeCar?.id)) {
      toast(t('editorCarInWorkshop'), 'warn');
      return;
    }
    audio.click();
    try {
      if (!this.town) this.town = new TownScene(this.engine, this.state);
      this.labels.setVisible(false);
      this.townUI.open({ reset });
      this.state.emitTutorialEvent({ type: 'town:opened' });
    } catch (error) {
      console.warn('goTown', error);
      toast(t('socialError'), 'warn', 4000);
      this.labels.setVisible(true);
      this.goGarage();
    }
  }

  visitGarage(host, { isBot = false } = {}) {
    if (!host || typeof host !== 'object') {
      this.toast(t('socialError'), 'warn');
      return;
    }
    audio.click();
    this.closeVisit();
    const visitHost = {
      ...host,
      garage: host.garage && typeof host.garage === 'object'
        ? host.garage
        : { size: 14, floor: 'tile', wall: 'white', items: [], cars: [] },
    };
    const likeHostId = Number(visitHost.serverUserId) || Number(visitHost.id) || 0;
    const like = el('button', {
      class: 'btn btn-blue',
      title: isBot ? t('visitReadOnly') : t('like'),
      onclick: async () => {
        if (isBot || !likeHostId) return;
        try {
          const res = await socialApi.likeGarage(likeHostId);
          visitHost.liked = res.liked;
          visitHost.likes = res.likes;
          like.textContent = `${visitHost.liked ? '♥' : '♡'} ${visitHost.likes || 0}`;
          like.classList.toggle('btn-gray', !visitHost.liked);
        } catch (e) { this.toast(t('socialError'), 'warn'); }
      },
    }, `${visitHost.liked ? '♥' : '♡'} ${visitHost.likes || 0}`);
    like.disabled = isBot || !likeHostId;
    const overlay = el('div', { class: 'visit-overlay' },
      el('div', { class: 'visit-bar' },
        el('b', {}, visitHost.name || 'Garage'),
        el('small', {}, `${t('level')} ${visitHost.level || 1} · ${t('visitReadOnly')}`),
        like,
        el('button', { class: 'btn btn-green', onclick: () => this.closeVisit() }, t('backToGarage'))));
    this.uiRoot.appendChild(overlay);
    this.visitOverlay = overlay;
    this._visitKey = (ev) => { if (ev.code === 'Escape') this.closeVisit(); };
    window.addEventListener('keydown', this._visitKey);
    this.labels.setVisible(false);
    this.visitLabels = new WorldLabels(this.uiRoot);
    try {
      const state = makeVisitState(visitHost);
      const scene = new GarageScene(this.engine, state, this.visitLabels, { readOnly: true });
      this.visitScene = scene;
      this.visitHost = visitHost;
      this.setMode('visit');
      this.engine.setScene(scene);
      this.visitLabels.setVisible(true);
    } catch (error) {
      console.warn('visit', error);
      this.toast(t('socialError'), 'warn');
      this.closeVisit();
    }
  }

  closeVisit() {
    if (this._visitKey) window.removeEventListener('keydown', this._visitKey);
    this._visitKey = null;
    this.visitOverlay?.remove();
    this.visitOverlay = null;
    const leavingVisit = Boolean(this.visitScene) || this.mode === 'visit';
    this.visitScene?.exit?.();
    this.visitScene = null;
    this.visitHost = null;
    this.visitLabels?.clear();
    this.visitLabels?.root.remove();
    this.visitLabels = null;
    this.labels.setVisible(true);
    if (leavingVisit) this.goGarage();
  }

  openFriends() { audio.click(); openSocial(this); }
  openJobs() { audio.click(); openJobs(this); }
  startCustomerJob(service) {
    return this.garage?.startCustomerJob(service) || { ok: false, error: 'station' };
  }
  openGoals() { audio.click(); openGoals(this); }
  openLuxury() { audio.click(); openLuxury(this); }
  openSettings() { audio.click(); openSettings(this); }

  goalDef(id) {
    return GOAL_DEFS.find((g) => g.id === id);
  }

  // ---------------------------------------------------------------------------------
  // Scene callbacks
  // ---------------------------------------------------------------------------------

  carName(car) {
    return MODELS[car.cfg.model].name;
  }

  onCarClick(carId, e) {
    const car = this.state.getCar(carId);
    if (!car) return;
    audio.click();
    const active = this.state.activeCar?.id === carId;
    const job = this.state.carJob(carId);
    const inWorkshop = Boolean(job);
    const mounted = Boolean(car.placed?.mountUid);
    const blocked = inWorkshop || mounted;
    const subtitle = job ? t('carJobInfo', { work: t(`up.${job.upgradeKey}`), time: fmtJobTime(jobRemaining(job)) }) : '';
    popupMenu(e.clientX, e.clientY, `${this.carName(car)}${active ? ' ★' : ''}`, subtitle, [
      { label: t('customize'), icon: 'paint', disabled: blocked, action: () => this.openCustomize(carId) },
      { label: t('race'), icon: 'flag', disabled: blocked, action: () => { this.state.setActiveCar(carId); this.openRaceMenu({ carId }); } },
      { label: t('drive'), icon: 'steering', disabled: blocked, action: () => { this.state.setActiveCar(carId); this.goTown({ reset: true }); } },
      active ? null : { label: t('setActive'), icon: 'star', action: () => { this.state.setActiveCar(carId); toast(`${t('activeCar')}: ${this.carName(car)}`); } },
      mounted ? { label: t('unmount'), icon: 'move', action: () => { this.garage.unmountCar(carId); this.onCarClick(carId, e); } } : null,
      { label: inWorkshop ? t('editorInWorkshop') : t('sell'), icon: 'trash', className: 'danger', disabled: blocked, right: blocked ? '' : `+${fmt(carSellValue(car))}`, action: () => this.sellCar(carId) },
    ].filter(Boolean));
  }

  async sellCar(carId) {
    const car = this.state.getCar(carId);
    if (this.state.isCarBusy(carId)) {
      audio.error();
      toast(t('sellBusy'), 'warn');
      return;
    }
    if (this.state.cars.length <= 1) {
      audio.error();
      toast(t('lastCar'), 'warn');
      return;
    }
    const value = carSellValue(car);
    if (!(await confirmDialog(t('sellConfirm', { name: this.carName(car), n: fmt(value) }), { ok: t('sell') }))) return;
    this.state.removeCar(carId);
    this.state.addCoins(value);
    this.garage.refreshCar(carId);
    audio.coin();
    toast(t('sold', { n: fmt(value) }));
  }

  localFriendHost(friend) {
    if (friend.garage?.cars?.length || friend.garage?.items?.length) return friend;
    return {
      ...friend,
      garage: {
        size: 14,
        floor: 'tile',
        wall: 'white',
        items: [],
        cars: friend.car ? [{ id: `imported-${friend.id || friend.name}`, cfg: friend.car, placed: { x: 6, z: 7, rot: 0 } }] : [],
      },
    };
  }

  async onNeighborClick(friend, e) {
    audio.click();
    const serverId = Number(friend.serverUserId) || (Number.isInteger(Number(friend.id)) && Number(friend.id) > 0 ? Number(friend.id) : null);
    const botId = friend.botId || (typeof friend.id === 'string' && friend.id.startsWith('bot-') ? friend.id.slice(4) : null);
    const card = popupCard(e.clientX, e.clientY, `${friend.name || 'Garage'} · ${t('level')} ${friend.level || 1}`, {
      stats: '…',
      onVisit: () => this.onFriendClick(friend, e),
    });
    let host = null;
    try {
      if (serverId) host = (await socialApi.preview(serverId)).host;
      else if (botId) host = (await socialApi.previewBot(botId)).host;
      else host = this.localFriendHost(friend);
    } catch (error) {
      console.warn('preview', error);
      host = this.localFriendHost(friend);
    }
    if (!host) {
      card.setStats(t('socialError'));
      return;
    }
    const g = host.garage || {};
    const n = Number(g.size) || 14;
    card.setStats(`${n}×${n} · ${g.floor || 'tile'} / ${g.wall || 'white'} · ${(g.cars || []).length} coches · ${(g.items || []).length} objetos`);
    garageThumb(g, card.img);
  }

  onFriendClick(friend, e) {
    audio.click();
    const serverId = Number(friend.serverUserId) || (Number.isInteger(Number(friend.id)) && Number(friend.id) > 0 ? Number(friend.id) : null);
    const botId = friend.botId || (typeof friend.id === 'string' && friend.id.startsWith('bot-') ? friend.id.slice(4) : null);
    const canVisit = Boolean(serverId || botId || this.localFriendHost(friend).garage.cars.length);
    popupMenu(e.clientX, e.clientY, `${friend.name} · ${t('level')} ${friend.level}`, [
      { label: `${t('challenge')} (${MODELS[friend.car?.model || 'hatch'].name})`, icon: 'flag', action: () => this.openRaceMenu({ friend, tab: 'friends' }) },
      canVisit ? { label: t('visit'), icon: 'home', action: async () => {
        if (serverId) {
          try {
            this.visitGarage((await socialApi.visit(serverId)).host);
            return;
          } catch (error) {
            console.warn('visit', error);
          }
        }
        if (botId) {
          try {
            this.visitGarage((await socialApi.visitBot(botId)).host, { isBot: true });
            return;
          } catch (error) {
            console.warn('visitBot', error);
          }
        }
        const local = this.localFriendHost(friend);
        if (local.garage.cars.length) this.visitGarage(local);
        else this.toast(t('socialError'), 'warn');
      } } : null,
      serverId ? { label: t('sendMessage'), icon: 'bubbles', action: () => openChat(this, friend) } : null,
      { label: t('friends'), icon: 'users', action: () => this.openFriends() },
    ].filter(Boolean));
  }

  onEditorSelect(sel, e) { this.editor.onSelect(sel, e); }
  onPlaceAttempt(p) { this.editor.onPlaceAttempt(p); }
  onPlaceCancel() { this.editor.onPlaceCancel(); }
  closePopups() { closePopup(); }
  toast(text, kind) { toast(text, kind); }
  banner(text, sub, kind) { banner(text, sub, kind); }
  flashFuel() { this.hud.flashFuel(); }
  pulseCoins() { this.hud.pulseCoins(); }

  // ---------------------------------------------------------------------------------
  // Top bar actions
  // ---------------------------------------------------------------------------------

  zoom(f) {
    if (this.engine.active === this.garage) this.garage.zoomBy(f);
  }

  takePhoto() {
    audio.click();
    const scene = this.engine.active;
    this.uiRoot.classList.add('photo-flash');
    setTimeout(() => this.uiRoot.classList.remove('photo-flash'), 400);
    this.engine.renderer.render(scene.scene, scene.camera);
    const url = this.engine.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `car-town-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(t('photoSaved'));
  }

  toggleFullscreen() {
    audio.click();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  toggleSound() {
    this.setSound(!this.state.data.settings.sfx);
  }

  setSound(on) {
    this.state.data.settings.sfx = on;
    audio.setSfx(on);
    this.state.save();
    this.hud.refreshSound();
    if (on) audio.click();
  }

  setMusic(on) {
    this.state.data.settings.music = on;
    audio.setMusic(on);
    this.state.save();
  }

  setLanguage(lang) {
    this.state.data.settings.lang = lang;
    this.state.saveNow();
    setLang(lang);
    location.reload();
  }

  applyQuality(q) {
    const r = this.engine.renderer;
    r.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, this.engine.maxPixelRatio));
    r.shadowMap.enabled = q !== 'low';
    this.engine.resize();
  }

  setQuality(q) {
    this.state.data.settings.quality = q;
    this.state.save();
    this.applyQuality(q);
    // materials need recompiling when toggling shadows
    for (const sc of [this.garage, this.showroom, this.raceScene, this.town]) sc?.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
}
