// Garage editor ("Editar Garagem"): buy & place equipment and decorations,
// move / rotate / sell items, change floors & wall themes, expand the lot.

import { el, fmt } from '../core/util.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { ITEMS, FLOORS, WALLS, EXPANSIONS } from '../game/catalog.js';
import { itemThumb } from './thumbs.js';
import { FLOOR_DRAW, WALL_STYLE } from '../world/textures.js';
import { audio } from '../core/audio.js';
import { popupMenu, closePopup, confirmDialog } from './dom.js';

export class EditorUI {
  constructor(app) {
    this.app = app;
    this.cat = 'services';
  }

  open() {
    const app = this.app;
    app.setMode('editor');
    app.garage.setEditor(true);
    this.tabs = el('div', { class: 'tabs editor-tabs' });
    this.shelf = el('div', { class: 'shelf' });
    this.hint = el('div', { class: 'editor-hint' }, t('placeHere'));
    this.root = el('div', { class: 'editor-layer' },
      el('div', { class: 'editor-top' },
        el('h1', { class: 'mode-title' }, el('span', { html: icon('wrench') }), t('editMode')),
        el('button', { class: 'btn btn-green', onclick: () => this.close() }, el('span', { html: icon('check') }), t('done'))),
      this.hint,
      el('div', { class: 'editor-drawer' }, this.tabs, this.shelf));
    app.uiRoot.appendChild(this.root);
    this.renderTabs();
    this.renderShelf();
    this.setHint('');
  }

  async close() {
    audio.click();
    closePopup();
    this.app.garage.setEditor(false);
    this.root?.remove();
    this.root = null;
    await this.app.state.saveNow();
    if (this.app.adminBot) {
      window.location.href = this.app.adminBot.backUrl;
      return;
    }
    this.app.goGarage();
  }

  setHint(text) {
    this.hint.textContent = text;
    this.hint.classList.toggle('hidden', !text);
  }

  renderTabs() {
    this.tabs.innerHTML = '';
    const cats = [['services', t('services')], ['decor', t('decor')], ['fun', t('fun')], ['walls', t('walls')], ['floors', t('floors')], ['patches', t('patches')], ['tables', t('tables')], ['themes', t('editorWallPaint')], ['expand', t('expand')]];
    for (const [id, label] of cats) {
      this.tabs.appendChild(el('button', { class: `tab ${this.cat === id ? 'on' : ''}`, onclick: () => { audio.click(); this.cat = id; this.renderTabs(); this.renderShelf(); } }, label));
    }
  }

  renderShelf() {
    const st = this.app.state;
    const s = this.shelf;
    s.innerHTML = '';
    if (this.cat === 'floors' || this.cat === 'themes') {
      const isFloor = this.cat === 'floors';
      const defs = isFloor ? FLOORS : WALLS;
      const owned = isFloor ? st.garage.ownedFloors : st.garage.ownedWalls;
      const cur = isFloor ? st.garage.floor : st.garage.wall;
      for (const [id, d] of Object.entries(defs)) {
        const sw = document.createElement('canvas');
        sw.width = sw.height = 64;
        const ctx = sw.getContext('2d');
        if (isFloor) {
          ctx.scale(0.5, 0.5);
          FLOOR_DRAW[id](ctx, 128);
        } else {
          const ws = WALL_STYLE[id];
          ctx.fillStyle = ws.base; ctx.fillRect(0, 0, 64, 64);
          ctx.fillStyle = ws.band; ctx.fillRect(0, 8, 64, 6);
          ctx.fillStyle = ws.trim; ctx.fillRect(0, 54, 64, 10);
        }
        const has = owned.includes(id);
        const locked = (d.level || 1) > st.level;
        s.appendChild(el('button', {
          class: `shop-card ${cur === id ? 'on' : ''} ${locked ? 'locked' : ''}`,
          onclick: () => this.buyTheme(isFloor, id),
        }, sw, el('b', {}, d.name),
        el('small', { html: has ? (cur === id ? '✓' : t('owned')) : locked ? t('locked', { n: d.level }) : `${icon('coin')} ${fmt(d.price)}` }),
        el('i', { class: 'lux' }, `+${d.lux}★`)));
      }
      return;
    }
    if (this.cat === 'expand') {
      const cur = EXPANSIONS.findIndex((e) => e.size === st.garage.size);
      EXPANSIONS.forEach((e, i) => {
        const done = i <= cur;
        const next = i === cur + 1;
        const locked = e.level > st.level;
        s.appendChild(el('button', {
          class: `shop-card expand ${done ? 'on' : ''} ${!next || locked ? 'locked' : ''}`,
          onclick: () => this.expand(e),
        }, el('div', { class: 'expand-size' }, `${e.size}×${e.size}`), el('b', {}, done ? t('owned') : `${t('expand')}`),
        el('small', { html: done ? '✓' : locked ? t('locked', { n: e.level }) : `${icon('coin')} ${fmt(e.price)}` })));
      });
      return;
    }
    for (const [type, d] of Object.entries(ITEMS)) {
      if (d.cat !== this.cat) continue;
      const locked = d.level > st.level;
      const img = el('img', { alt: '' });
      itemThumb(type, img);
      const price = d.cash ? `${icon('cash')} ${d.cash}` : `${icon('coin')} ${fmt(d.price)}`;
      s.appendChild(el('button', { class: `shop-card ${locked ? 'locked' : ''}`, onclick: () => this.pickItem(type) },
        img, el('b', {}, d.name), el('small', { html: locked ? t('locked', { n: d.level }) : price }), el('i', { class: 'lux' }, `+${d.lux}★`)));
    }
  }

  pickItem(type) {
    const st = this.app.state;
    const d = ITEMS[type];
    if (d.level > st.level) {
      audio.error();
      this.app.toast(t('locked', { n: d.level }), 'warn');
      return;
    }
    if (!st.canAfford(d.price || 0, d.cash || 0)) {
      audio.error();
      this.app.toast(d.cash ? t('notEnoughCash') : t('notEnoughCoins'), 'warn');
      return;
    }
    audio.click();
    closePopup();
    this.app.garage.startPlacing({ kind: 'item', type, rot: d.wall ? 0 : 0, isNew: true });
    this.setHint(`${d.name}: ${t('placeHere')} · R = ${t('rotate')} · Esc`);
  }

  /** Called by the scene when the user clicks while placing. */
  onPlaceAttempt(p) {
    const app = this.app;
    const st = app.state;
    if (!p.ok) {
      audio.error();
      app.toast(t('cantPlace'), 'warn');
      return;
    }
    if (p.isNew) {
      const d = ITEMS[p.type];
      if (!st.spend(d.price || 0, d.cash || 0)) {
        audio.error();
        app.toast(t('notEnoughCoins'), 'warn');
        return;
      }
      st.addXp(Math.max(2, Math.round((d.price || d.cash * 500) / 200)));
      st.progressGoal('decor');
      audio.cash();
    } else {
      audio.pop();
    }
    const type = p.type;
    const isNew = p.isNew;
    app.garage.commitPlacing();
    app.hud.refreshLux();
    this.setHint('');
    // keep placing more of the same new item for convenience (shift-click style)
    if (isNew && ITEMS[type].cat !== 'services' && st.canAfford(ITEMS[type].price || 0, ITEMS[type].cash || 0)) {
      app.garage.startPlacing({ kind: 'item', type, rot: 0, isNew: true });
      this.setHint(`${ITEMS[type].name}: ${t('placeHere')} · Esc`);
    }
  }

  onPlaceCancel() {
    this.setHint('');
  }

  onSelect(sel, e) {
    const app = this.app;
    if (!sel) {
      closePopup();
      return;
    }
    if (sel.kind === 'car') {
      const car = app.state.getCar(sel.id);
      const busy = app.state.isCarBusy(car.id);
      const mounted = Boolean(car.placed?.mountUid);
      popupMenu(e.clientX, e.clientY, app.carName(car), busy
        ? [{ label: t('editorInWorkshop'), icon: 'wrench', disabled: true }]
        : [
          { label: t('move'), icon: 'move', action: () => { app.garage.selectItem(null); app.garage.startPlacing({ kind: 'car', id: sel.id, rot: car.placed?.rot || 0 }); this.setHint(`${t('placeHere')} · R = ${t('rotate')}`); } },
          { label: t('rotate'), icon: 'rotate', action: () => this.rotateCar(car) },
          mounted ? { label: t('unmount'), icon: 'trash', action: () => { app.garage.unmountCar(car.id); app.garage.selectItem({ kind: 'car', id: car.id }); } } : null,
        ].filter(Boolean));
      return;
    }
    const it = app.state.garage.items.find((i) => i.uid === sel.uid);
    if (!it) return;
    const d = ITEMS[it.type];
    const busy = app.garage.isStationBusy(it.uid);
    const refund = Math.round((d.price || 0) * 0.5);
    const dropToFloor = () => {
      Object.assign(it, app.garage.findItemSpot(it.type, it.uid), { surfaceUid: undefined, slot: undefined });
      app.garage.refreshLayout();
      app.garage.selectItem({ kind: 'item', uid: it.uid });
      app.state.saveNow();
    };
    popupMenu(e.clientX, e.clientY, d.name, busy
      ? [{ label: t('editorStationBusy'), icon: 'wrench', disabled: true }]
      : [
        { label: t('move'), icon: 'move', action: () => { app.garage.selectItem(null); app.garage.startPlacing({ kind: 'item', type: it.type, uid: it.uid, rot: it.rot || 0, surfaceUid: it.surfaceUid, slot: it.slot }); this.setHint(`${t('placeHere')} · R = ${t('rotate')}`); } },
        d.wall ? null : { label: t('rotate'), icon: 'rotate', action: () => this.rotateItem(it) },
        it.surfaceUid != null ? { label: t('dropToFloor'), icon: 'move', action: dropToFloor } : null,
        { label: `${t('sell')} (+${fmt(refund)})`, icon: 'trash', className: 'danger', action: () => this.sellItem(it, refund) },
      ].filter(Boolean));
  }

  rotateItem(it) {
    const g = this.app.garage;
    if (g.isStationBusy(it.uid)) {
      audio.error();
      this.app.toast(t('editorStationBusy'), 'warn');
      return;
    }
    const rot = ((it.rot || 0) + 1) % 4;
    if (!g.canPlace(it.type, it.x, it.z, rot, { ignoreUid: it.uid })) {
      audio.error();
      this.app.toast(t('cantPlace'), 'warn');
      return;
    }
    it.rot = rot;
    g.refreshLayout();
    g.refreshMountedCars(it.uid);
    g.selectItem({ kind: 'item', uid: it.uid });
    this.app.state.save();
  }

  rotateCar(car) {
    const g = this.app.garage;
    if (this.app.state.isCarBusy(car.id)) {
      audio.error();
      this.app.toast(t('editorCarInWorkshop'), 'warn');
      return;
    }
    const p = car.placed;
    const rot = ((p?.rot || 0) + 1) % 4;
    if (!p || !g.canPlace('car', p.x, p.z, rot, { ignoreCar: car.id })) {
      audio.error();
      this.app.toast(t('cantPlace'), 'warn');
      return;
    }
    p.rot = rot;
    g.refreshCar(car.id);
    g.selectItem({ kind: 'car', id: car.id });
    this.app.state.save();
  }

  async sellItem(it, refund) {
    if (this.app.garage.isStationBusy(it.uid)) {
      audio.error();
      this.app.toast(t('editorCantSellLift'), 'warn');
      return;
    }
    const ok = await confirmDialog(`${t('sell')} ${ITEMS[it.type].name}? (+${fmt(refund)} ${t('coins')})`, { ok: t('sell') });
    if (!ok) return;
    this.app.garage.selectItem(null);
    this.app.garage.removeItem(it.uid);
    this.app.state.addCoins(refund);
    this.app.hud.refreshLux();
    audio.coin();
  }

  buyTheme(isFloor, id) {
    const app = this.app;
    const st = app.state;
    const defs = isFloor ? FLOORS : WALLS;
    const owned = isFloor ? st.garage.ownedFloors : st.garage.ownedWalls;
    const d = defs[id];
    if (!owned.includes(id)) {
      if ((d.level || 1) > st.level) {
        audio.error();
        app.toast(t('locked', { n: d.level }), 'warn');
        return;
      }
      if (!st.spend(d.price)) {
        audio.error();
        app.toast(t('notEnoughCoins'), 'warn');
        return;
      }
      owned.push(id);
      audio.cash();
      st.addXp(Math.round(d.price / 150));
    } else audio.click();
    if (isFloor) st.garage.floor = id;
    else st.garage.wall = id;
    st.save();
    app.garage.buildLot();
    app.hud.refreshLux();
    this.renderShelf();
  }

  async expand(e) {
    const app = this.app;
    const st = app.state;
    if (st.remote) {
      const synced = await st.refreshFromServer();
      if (!synced) {
        audio.error();
        app.toast(t('saveConflict'), 'warn');
        return;
      }
    }
    const current = Math.max(0, EXPANSIONS.findIndex((entry) => entry.size === st.garage.size));
    const currentSize = EXPANSIONS[current]?.size ?? EXPANSIONS[0].size;
    if (e.size <= currentSize) {
      audio.click();
      app.toast(t('expandOwned'), 'warn');
      return;
    }
    if (e.size !== EXPANSIONS[current + 1]?.size) {
      audio.error();
      app.toast(t('expandNotNext'), 'warn');
      return;
    }
    if (e.level > st.level) {
      audio.error();
      app.toast(t('locked', { n: e.level }), 'warn');
      return;
    }
    if (!st.canAfford(e.price)) {
      audio.error();
      app.toast(t('notEnoughCoins'), 'warn');
      return;
    }
    const ok = await confirmDialog(`${t('expand')} ${e.size}×${e.size}? (${fmt(e.price)} ${t('coins')})`, { ok: t('buy') });
    if (!ok) return;
    if (!st.spend(e.price)) {
      audio.error();
      app.toast(t('notEnoughCoins'), 'warn');
      return;
    }
    const previousSize = st.garage.size;
    try {
      st.garage.size = e.size;
      app.garage.userZoom = false;
      app.garage.build();
      app.garage.setEditor(true);
      await st.saveNow();
      if (st.remoteConflict) {
        await st.refreshFromServer();
        app.garage.userZoom = false;
        app.garage.build();
        app.garage.setEditor(true);
        app.hud.refreshAll();
        this.renderShelf();
        audio.error();
        app.toast(t('saveConflict'), 'warn');
        return;
      }
      app.hud.refreshAll();
      audio.levelUp();
      app.banner(t('garageExpanded'), `${e.size}×${e.size}`, 'green');
      this.renderShelf();
    } catch (error) {
      console.error('[expand] failed', error);
      st.garage.size = previousSize;
      st.addCoins(e.price);
      app.toast(t('expandFailed'), 'warn');
      try {
        app.garage.build();
        app.garage.setEditor(true);
      } catch { /* keep the current scene */ }
    }
  }
}
