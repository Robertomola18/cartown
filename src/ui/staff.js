// Staff management: hire more mechanics so several cars can be serviced at once.

import { el, fmt } from '../core/util.js';
import { modal, toast } from './dom.js';
import { t } from '../core/i18n.js';
import { MAX_MECHANICS, MECHANIC_HIRES } from '../game/catalog.js';

export function openStaff(app, onChange = null) {
  const st = app.state;
  const body = el('div', { class: 'staff' });
  const m = modal({ title: t('staffTitle'), content: body });
  const render = () => {
    body.innerHTML = '';
    body.append(el('p', { class: 'job-help' }, t('staffHelp')));
    body.append(el('div', { class: 'job-pill' }, `${t('staffCurrent')} ${st.mechanics}/${MAX_MECHANICS} · ${t('staffFree')} ${app.garage?.freeMechanicCount?.() ?? st.mechanics}`));
    const list = el('div', { class: 'staff-list' });
    for (const hire of MECHANIC_HIRES) {
      const owned = st.mechanics >= hire.mechanics;
      const next = hire.mechanics === st.mechanics + 1;
      list.append(el('div', { class: `staff-row ${owned ? 'owned' : ''}` },
        el('b', {}, `${hire.mechanics} ${t('mechanics')}`),
        el('small', {}, next ? `${t('staffHire')} ${fmt(hire.price)}` : owned ? t('staffOwned') : '—'),
        next ? el('button', { class: 'btn btn-green', onclick: () => {
          const res = st.hireMechanic();
          if (!res.ok) { toast(res.error === 'coins' ? t('errNoCoins') : t('errAction'), 'warn'); return; }
          app.garage?.buildPeople();
          toast(t('staffHired'), 'good');
          render();
          onChange?.();
        } }, t('staffHire')) : null));
    }
    body.append(list);
    if (st.mechanics >= MAX_MECHANICS) body.append(el('p', { class: 'hint' }, t('staffMax')));
  };
  render();
  return m;
}
