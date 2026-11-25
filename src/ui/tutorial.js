import { el, fmt } from '../core/util.js';
import { t } from '../core/i18n.js';
import { audio } from '../core/audio.js';
import { CUSTOMER_SERVICES, customerPayout } from '../game/jobs.js';
import { ackTutorial } from '../core/api.js';
import {
  applyTutorialEvent,
  newTutorialSession,
  tutorialIndex,
  tutorialIsTerminal,
  tutorialStep,
  tutorialTarget,
  TUTORIAL_STEPS,
} from '../game/tutorialMachine.js';

let active = null;
let layerId = 0;

export function tutorialIsOpen() {
  return Boolean(active);
}

function serviceTime(minutes) {
  return minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
}

export function openTutorial(app, { force = false, replay = false } = {}) {
  closeTutorial();
  const state = app.state;
  let session = force || replay ? newTutorialSession() : state.tutorialSession();
  if (!session || tutorialIsTerminal(session)) {
    if (!force && !replay) return null;
    session = newTutorialSession();
  }
  state.data.settings.tutorial = session;

  const id = ++layerId;
  const layer = el('div', {
    class: 'tutorial-layer',
    role: 'dialog',
    'aria-modal': 'false',
    'aria-labelledby': `tutorial-title-${id}`,
    'aria-describedby': `tutorial-text-${id}`,
  });
  const spot = el('div', { class: 'tutorial-spot', 'aria-hidden': 'true' });
  const stepNo = el('small', { class: 'tutorial-step' });
  const title = el('h2', { id: `tutorial-title-${id}`, tabindex: '-1' });
  const text = el('p', { id: `tutorial-text-${id}` });
  const list = el('ul', { class: 'tutorial-list' });
  const fallback = el('p', { class: 'tutorial-fallback' });
  const cta = el('button', { class: 'btn btn-green' });
  const skip = el('button', {
    class: 'tutorial-skip',
    title: t('tutorialSkip'),
    'aria-label': t('tutorialSkip'),
  }, '×');
  const card = el('div', { class: 'tutorial-card', 'aria-live': 'polite' },
    skip, stepNo, title, text, list, fallback, el('div', { class: 'row-buttons' }, cta));
  layer.append(spot, card);
  app.uiRoot.appendChild(layer);

  let disposed = false;

  const position = () => {
    if (disposed) return;
    const selector = tutorialTarget(session);
    const isResult = selector === '[data-tutorial="raceResults"]';
    layer.classList.toggle('is-result-step', isResult);
    const target = selector ? document.querySelector(selector) : null;
    const rect = target?.getBoundingClientRect();
    if (rect && rect.width && rect.height) {
      const pad = 8;
      spot.style.display = 'block';
      spot.style.left = `${Math.max(2, rect.left - pad)}px`;
      spot.style.top = `${Math.max(2, rect.top - pad)}px`;
      spot.style.width = `${Math.min(window.innerWidth - 4, rect.width + pad * 2)}px`;
      spot.style.height = `${Math.min(window.innerHeight - 4, rect.height + pad * 2)}px`;
      if (isResult) {
        const cardW = Math.min(320, window.innerWidth - 24);
        card.style.width = `${cardW}px`;
        card.style.left = `${Math.max(12, window.innerWidth - cardW - 12)}px`;
        card.style.top = '12px';
      } else {
        const cardW = Math.min(390, window.innerWidth - 24);
        const cardH = card.offsetHeight || 220;
        let left = rect.left + rect.width / 2 < window.innerWidth / 2 ? window.innerWidth - cardW - 18 : 18;
        if (window.innerWidth < 760) left = Math.max(12, (window.innerWidth - cardW) / 2);
        let top = rect.bottom + 14;
        if (top + cardH > window.innerHeight - 12) top = Math.max(12, rect.top - cardH - 14);
        card.style.width = `${cardW}px`;
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
      }
    } else {
      spot.style.display = 'none';
      const cardW = Math.min(430, window.innerWidth - 24);
      card.style.width = `${cardW}px`;
      card.style.left = `${Math.max(12, (window.innerWidth - cardW) / 2)}px`;
      card.style.top = `${Math.max(12, (window.innerHeight - (card.offsetHeight || 240)) / 2)}px`;
    }
    layer.classList.toggle('is-modal-open', Boolean(document.querySelector('.modal-overlay')));
  };

  const render = () => {
    if (disposed) return;
    const def = tutorialStep(session);
    stepNo.textContent = `${tutorialIndex(session) + 1} / ${TUTORIAL_STEPS.length}`;
    title.textContent = t(`tutorial_${def.key}_title`);
    text.textContent = t(`tutorial_${def.key}_text`);
    list.innerHTML = '';
    if (def.list) {
      for (const service of CUSTOMER_SERVICES) {
        list.append(el('li', {}, `${t(`svc.${service.id}`)} — ${serviceTime(service.time)} · ${service.fuel} ${t('fuel')} · ${fmt(customerPayout(service))} ${t('coins')}`));
      }
    }
    fallback.textContent = t('tutorialFallback');
    cta.style.display = def.cta ? '' : 'none';
    cta.textContent = def.cta ? t(def.cta) : '';
    skip.style.display = '';
    position();
  };

  const focusTitle = () => {
    requestAnimationFrame(() => title.focus({ preventScroll: true }));
  };

  const finishSession = async (status) => {
    if (disposed) return;
    if (force) await ackTutorial();
    state.data.settings.tutorialDone = true;
    delete state.data.settings.tutorial;
    state.saveNow();
    closeTutorial();
  };

  const onEvent = (event) => {
    if (disposed) return;
    const previous = session;
    session = applyTutorialEvent(session, event);
    if (session === previous) return;
    state.data.settings.tutorial = session;
    state.saveNow();
    if (tutorialIsTerminal(session)) {
      void finishSession(session.status);
      return;
    }
    render();
    if (session.stepId !== previous.stepId) focusTitle();
  };

  const onKey = (event) => {
    if (disposed) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onEvent({ type: 'skip' });
    }
  };

  const unsub = state.on('tutorialEvent', onEvent);
  cta.addEventListener('click', () => {
    audio.click();
    onEvent({ type: 'ui:cta', stepId: tutorialStep(session).id });
  });
  skip.addEventListener('click', () => {
    audio.click();
    onEvent({ type: 'skip' });
  });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(position) : null;
  observer?.observe(document.body);
  const initialTimer = setTimeout(position, 250);

  active = {
    close: () => {
      disposed = true;
      unsub();
      clearTimeout(initialTimer);
      observer?.disconnect();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      layer.remove();
      active = null;
    },
  };

  render();
  requestAnimationFrame(position);
  focusTitle();
  return { next: () => onEvent({ type: 'ui:cta', stepId: tutorialStep(session).id }), close: () => finishSession('skipped') };
}

export function closeTutorial() {
  active?.close();
  active = null;
}
