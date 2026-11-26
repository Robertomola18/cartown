// Jobs board: customer errands that run offline and workshop jobs for the
// player's own cars (installs the next upgrade at a discount).

import { el, fmt, fmtJobTime } from '../core/util.js';
import { confirmDialog, modal, toast } from './dom.js';
import { t } from '../core/i18n.js';
import {
  CUSTOMER_SERVICES,
  CUSTOMER_JOB_SLOTS,
  customerPayout,
  customerJobDuration,
  OWN_JOB_SLOTS,
  jobRemaining,
  jobProgress,
  jobReady,
  jobRushCost,
  ownJobOptions,
  serviceStation,
} from '../game/jobs.js';
import { openStaff } from './staff.js';

function errorText(error) {
  switch (error) {
    case 'fuel': return t('errNoFuel');
    case 'slots': return t('errNoSlots');
    case 'coins': return t('errNoCoins');
    case 'busy': return t('errCarBusy');
    case 'wait': return t('errNotDone');
    case 'ready': return t('errJobReady');
    case 'station': return t('errStation');
    case 'stationBusy': return t('stationBusy');
    case 'mechanic': return t('noMechanic');
    default: return t('errAction');
  }
}

export function openJobs(app) {
  const st = app.state;
  const body = el('div', { class: 'jobs' });
  const summary = el('div', { class: 'jobs-summary' });
  const activeWrap = el('div', { class: 'jobs-active' });
  const actions = el('div', { class: 'jobs-sections' });
  body.append(summary, activeWrap, actions);

  let timer = null;
  let actionsKey = '';
  const readySeen = new Set();
  const m = modal({
    title: t('jobsTitle'),
    className: 'jobs-modal',
    wide: true,
    content: body,
    onClose: () => {
      if (timer) clearInterval(timer);
      st.emitTutorialEvent({ type: 'jobs:closed' });
    },
  });
  st.emitTutorialEvent({ type: 'jobs:opened' });

  const renderSummary = () => {
    summary.innerHTML = '';
    const customer = st.jobsUsed('customer');
    const own = st.jobsUsed('own');
    const liftCount = app.garage?.stations?.filter((station) => station.kind === 'lift').length || OWN_JOB_SLOTS;
    const ownCap = Math.min(OWN_JOB_SLOTS, st.mechanics, liftCount);
    summary.append(
      el('span', { class: 'job-pill' }, `${t('jobsErrands')} ${customer}/${CUSTOMER_JOB_SLOTS}`),
      el('span', { class: 'job-pill' }, `${t('jobsWorkshop')} ${own}/${ownCap}`),
      el('span', { class: 'job-pill muted' }, `${t('jobsLiftsFree')} ${app.garage?.stations.filter((s) => s.kind === 'lift' && !s.occupant && !s.playerJob).length ?? 0}`),
      el('span', { class: 'job-pill muted' }, `${st.data.fuel}/${st.fuelMax} ${t('fuel')}`),
    );
  };

  const renderActive = () => {
    const jobs = st.activeJobs();
    activeWrap.innerHTML = '';
    if (!jobs.length) {
      activeWrap.append(el('div', { class: 'job-empty' }, t('jobsEmpty')));
      return;
    }
    const list = el('div', { class: 'job-list' });
    for (const job of jobs) {
      const ready = jobReady(job);
      const left = jobRemaining(job);
      const rushCost = ready ? 0 : jobRushCost(job);
      if (ready && !readySeen.has(job.id)) {
        readySeen.add(job.id);
        st.emitTutorialEvent({ type: 'job:ready', jobId: job.id });
      }
      const sub = job.kind === 'customer'
        ? t('jobsCustomerSub', { fuel: job.fuel, coins: fmt(job.coins) })
        : t('jobsOwnSub', { car: app.carName(st.getCar(job.carId) || { cfg: { model: 'hatch' } }), level: job.level + 1, xp: job.xp });
      list.append(el('div', { class: `job-card ${ready ? 'ready' : ''}`, onclick: (e) => {
        if (!e.target.closest?.('button')) app.garage?.focusJob?.(job);
      } },
        el('div', { class: 'job-head' },
          el('span', { class: 'job-emoji' }, job.icon || '🔧'),
          el('div', { class: 'job-title' }, el('b', {}, job.serviceId ? t(`svc.${job.serviceId}`) : t(`up.${job.upgradeKey}`)), el('small', {}, sub)),
          el('span', { class: 'job-time' }, ready ? t('jobsReady') : fmtJobTime(left))),
        el('div', { class: 'job-track', 'data-tutorial': 'jobProgress', 'data-job-id': job.id }, el('i', { style: { width: `${(jobProgress(job) * 100).toFixed(1)}%` } })),
        !ready ? el('button', { class: 'btn btn-blue job-rush', onclick: async () => {
          const yes = await confirmDialog(t('jobsRushConfirm', { n: fmt(rushCost) }), { ok: t('jobsRushShort') });
          if (!yes) return;
          const result = st.rushJob(job.id);
          if (!result.ok) {
            toast(errorText(result.error), 'warn');
            return;
          }
          toast(t('jobsRushed', { n: fmt(result.cost) }), 'good');
          refreshAll();
        } }, t('jobsRush', { n: fmt(rushCost) })) : null,
        ready ? el('button', { class: 'btn btn-green job-claim', 'data-tutorial': 'claim', 'data-job-id': job.id, onclick: () => {
          const result = st.claimJob(job.id);
          if (!result.ok) {
            toast(errorText(result.error), 'warn');
            return;
          }
          if (job.kind === 'own') app.garage?.detachOwnJob(job);
          else app.garage?.claimCustomerJob?.(job.id);
          toast(job.kind === 'own' ? t('jobsInstalled') : t('jobsPaid', { n: fmt(job.coins) }), 'good');
          refreshAll();
        } }, t('jobsCollect')) : null,
      ));
    }
    activeWrap.append(list);
  };

  const renderActions = () => {
    actions.innerHTML = '';
    const freeMechs = app.garage?.freeMechanicCount?.() ?? st.mechanics;
    const nextHire = st.nextMechanicHire();
    const customer = el('section', { class: 'job-col' },
      el('h3', {}, t('jobsCustomerTitle')),
      el('p', { class: 'job-help' }, t('jobsCustomerHelp')),
      el('button', { class: 'btn btn-blue staff-cta', onclick: () => openStaff(app, refreshAll) },
        `${t('staffTitle')} ${st.mechanics} · ${t('staffFree')} ${freeMechs}${nextHire ? ` · ${t('staffHire')} ${fmt(nextHire.price)}` : ''}`));
    const customerFull = st.jobsUsed('customer') >= CUSTOMER_JOB_SLOTS;
    for (const service of CUSTOMER_SERVICES) {
      const noFuel = st.data.fuel < service.fuel;
      const kind = serviceStation(service.id);
      const noStation = kind && !st.hasStation(kind);
      const noFreeStation = kind && !app.garage?.freeStation?.(kind);
      const noMechanic = freeMechs <= 0;
      customer.append(el('button', {
        class: 'job-service',
        disabled: customerFull || noFuel || noStation || noFreeStation || noMechanic,
        onclick: async () => {
          const result = app.startCustomerJob ? app.startCustomerJob(service) : st.startCustomerJob(service.id);
          if (!result.ok) {
            toast(errorText(result.error), 'warn');
            return;
          }
          await st.saveNow();
          toast(t('jobsAccepted', { name: t(`svc.${service.id}`) }), 'good');
          refreshAll();
        },
      },
      el('span', { class: 'job-emoji' }, service.icon),
      el('span', { class: 'job-service-text' }, el('b', {}, t(`svc.${service.id}`)),
        el('small', {}, `${fmtJobTime(customerJobDuration(service))} · ${fmt(customerPayout(service))} ${t('coins')} · ${service.fuel} ${t('fuel')}`))));
    }

    const own = el('section', { class: 'job-col' },
      el('h3', {}, t('jobsOwnTitle')),
      el('p', { class: 'job-help' }, t('jobsOwnHelp')));
    for (const car of st.cars) {
      const busy = st.carJob(car.id);
      const lift = app.garage?.freeLift();
      const mechanic = app.garage?.freeMechanicIndex?.() ?? -1;
      const tutorialJob = st.tutorialJobPending();
      const options = ownJobOptions(car);
      const card = el('div', { class: `job-car ${busy ? 'busy' : ''}` },
        el('div', { class: 'job-car-head' }, el('b', {}, app.carName(car)), busy ? el('span', { class: 'job-time' }, t('jobsInWorkshop', { time: fmtJobTime(jobRemaining(busy)) })) : null));
      if (options.length) {
        const select = el('select', { class: 'job-select' }, ...options.map((option) => el('option', { value: option.key },
          `${t(`up.${option.key}`)} · ${t('level')} ${option.level + 1} · ${fmt(option.cost)} · ${Math.round(option.duration / 60000)} min`)));
        card.append(
          select,
          el('button', {
            class: `btn job-start ${tutorialJob ? 'btn-green tutorial-job' : 'btn-blue'}`,
            'data-tutorial': tutorialJob ? 'repairStart' : null,
            disabled: Boolean(busy) || !lift || mechanic < 0,
            onclick: async () => {
              const result = st.startOwnJob(car.id, select.value, lift?.uid, mechanic);
              if (!result.ok) {
                toast(errorText(result.error), 'warn');
                return;
              }
              app.garage?.attachOwnJob(result.job);
              await st.saveNow();
              toast(t(tutorialJob ? 'tutorialJobStarted' : 'jobsInstalled'), 'good');
              refreshAll();
            },
          }, busy ? t('jobsBusy') : tutorialJob ? t('tutorialJobStart') : t('jobsStart')),
        );
      } else {
        card.append(el('small', { class: 'job-help' }, t('jobsAllUpgrades')));
      }
      own.append(card);
    }
    actions.append(customer, own);
  };

  const actionsSignature = () => [
    app.garage?.freeLift()?.uid || '',
    app.garage?.freeMechanicCount?.() ?? st.mechanics,
    (app.garage?.mechanics || []).map((m) => (m.busy ? m.station?.uid || 'busy' : 'free')).join(','),
    st.activeJobs().map((job) => `${job.id}:${job.kind}:${job.stationUid || ''}:${job.mechanicIndex ?? ''}:${jobReady(job) ? 1 : 0}:${job.claimed ? 1 : 0}`).join('|'),
    st.jobsUsed('customer') >= CUSTOMER_JOB_SLOTS ? 1 : 0,
    st.jobsUsed('own'),
    st.data.fuel,
    st.tutorialJobPending() ? 1 : 0,
    ['lift', 'wash', 'paint'].map((kind) => `${st.hasStation(kind) ? 1 : 0}:${app.garage?.freeStation?.(kind)?.uid || ''}`).join(','),
    st.cars.map((car) => `${car.id}:${st.carJob(car.id)?.id || ''}:${Object.values(car.cfg?.upgrades || {}).join('.')}`).join('|'),
  ].join('|');

  const refreshAll = () => {
    renderSummary();
    renderActive();
    renderActions();
    actionsKey = actionsSignature();
  };

  refreshAll();
  timer = setInterval(() => {
    const summaryKey = [
      st.jobsUsed('customer'),
      st.jobsUsed('own'),
      st.mechanics,
      app.garage?.stations?.filter((station) => station.kind === 'lift' && !station.occupant && !station.playerJob).length ?? 0,
      st.data.fuel,
    ].join('|');
    if (activeWrap.dataset.summary !== summaryKey) {
      renderSummary();
      activeWrap.dataset.summary = summaryKey;
    }
    const jobs = st.activeJobs();
    const activeKey = jobs.map((job) => `${job.id}:${jobReady(job) ? 1 : 0}`).join('|');
    if (activeWrap.dataset.jobs !== activeKey) {
      renderActive();
      activeWrap.dataset.jobs = activeKey;
    } else {
      const byId = new Map(jobs.map((job) => [job.id, job]));
      for (const card of activeWrap.querySelectorAll('.job-card')) {
        const job = byId.get(card.dataset.jobId);
        if (!job) continue;
        const ready = jobReady(job);
        const time = card.querySelector('.job-time');
        if (time) time.textContent = ready ? t('jobsReady') : fmtJobTime(jobRemaining(job));
        const bar = card.querySelector('.job-track i');
        if (bar) bar.style.width = `${(jobProgress(job) * 100).toFixed(1)}%`;
        const rush = card.querySelector('.job-rush');
        if (rush) rush.textContent = t('jobsRush', { n: fmt(jobRushCost(job)) });
      }
    }
    const next = actionsSignature();
    if (next !== actionsKey) {
      actionsKey = next;
      renderActions();
    }
  }, 1000);
  return m;
}
