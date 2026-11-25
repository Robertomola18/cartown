export const TUTORIAL_VERSION = 2;

export const TUTORIAL_STEPS = [
  { id: 'welcome', key: 'welcome', cta: 'tutorialStart', target: null },
  { id: 'openJobs', key: 'openJobs', target: '[data-tutorial="jobsButton"]' },
  { id: 'startRepair', key: 'startRepair', target: '[data-tutorial="repairStart"]', skip: true },
  { id: 'waitRepair', key: 'waitRepair', target: '[data-tutorial="jobProgress"][data-job-id="{jobId}"]' },
  { id: 'collectPay', key: 'collectPay', target: '[data-tutorial="claim"][data-job-id="{jobId}"]' },
  { id: 'closeJobs', key: 'closeJobs', target: '[data-tutorial="modalClose"]' },
  { id: 'selectCar', key: 'selectCar', target: null },
  { id: 'applyChange', key: 'applyChange', target: '[data-tutorial="apply"]', skip: true },
  { id: 'learnJobs', key: 'learnJobs', cta: 'tutorialGotIt', target: null, list: true },
  { id: 'race', key: 'race', target: '[data-tutorial="raceButton"]', skip: true },
  { id: 'raceResult', key: 'raceResult', target: '[data-tutorial="raceResults"]' },
  { id: 'town', key: 'town', target: '[data-tutorial="mapButton"]' },
  { id: 'complete', key: 'complete', cta: 'tutorialFinish', target: null },
];

export const LEGACY_TUTORIAL_STEPS = [
  'welcome', 'startRepair', 'collectPay', 'applyChange',
  'learnJobs', 'race', 'town', 'complete',
];

const BY_ID = new Map(TUTORIAL_STEPS.map((step) => [step.id, step]));

function stamp() {
  return Date.now();
}

export function newTutorialSession(startId = 'welcome') {
  const stepId = BY_ID.has(startId) ? startId : 'welcome';
  return {
    version: TUTORIAL_VERSION,
    stepId,
    status: 'active',
    context: {},
    evidence: {},
    startedAt: stamp(),
    updatedAt: stamp(),
  };
}

export function tutorialSessionFromLegacy(step) {
  const index = Math.max(0, Math.min(LEGACY_TUTORIAL_STEPS.length - 1, Math.round(Number(step) || 0)));
  return newTutorialSession(LEGACY_TUTORIAL_STEPS[index]);
}

export function normalizeTutorial(value) {
  if (!value || typeof value !== 'object' || value.version !== TUTORIAL_VERSION) return null;
  if (!BY_ID.has(value.stepId)) return null;
  return {
    version: TUTORIAL_VERSION,
    stepId: value.stepId,
    status: value.status === 'completed' || value.status === 'skipped' ? value.status : 'active',
    context: value.context && typeof value.context === 'object' ? { ...value.context } : {},
    evidence: value.evidence && typeof value.evidence === 'object' ? { ...value.evidence } : {},
    startedAt: Number(value.startedAt) || stamp(),
    updatedAt: Number(value.updatedAt) || stamp(),
  };
}

export function tutorialStep(session) {
  return BY_ID.get(session?.stepId) || BY_ID.get('welcome');
}

export function tutorialIndex(session) {
  const index = TUTORIAL_STEPS.findIndex((step) => step.id === session?.stepId);
  return index < 0 ? 0 : index;
}

export function tutorialTarget(session) {
  const target = tutorialStep(session).target;
  if (!target) return null;
  return target
    .replace('{jobId}', session?.context?.jobId || '')
    .replace('{carId}', session?.context?.carId || '')
    .replace('{sessionId}', session?.context?.sessionId || '');
}

export function tutorialCanSkip(session) {
  return tutorialStep(session).skip === true;
}

export function tutorialIsTerminal(session) {
  return session?.status === 'completed' || session?.status === 'skipped';
}

function next(session, stepId, context = {}, evidence = {}) {
  return {
    ...session,
    stepId,
    status: 'active',
    context: { ...session.context, ...context },
    evidence: { ...session.evidence, ...evidence },
    updatedAt: stamp(),
  };
}

function retry(session) {
  return { ...session, evidence: { ...session.evidence, retries: (Number(session.evidence.retries) || 0) + 1 }, updatedAt: stamp() };
}

export function applyTutorialEvent(session, event) {
  const s = normalizeTutorial(session);
  if (!s || tutorialIsTerminal(s) || !event || typeof event !== 'object') return s;
  const id = s.stepId;
  switch (event.type) {
    case 'ui:cta':
      if (event.stepId !== id) return s;
      if (id === 'welcome') return next(s, 'openJobs');
      if (id === 'learnJobs') return next(s, 'race');
      if (id === 'complete') return { ...s, status: 'completed', updatedAt: stamp() };
      return s;
    case 'jobs:opened':
      return id === 'openJobs' ? next(s, 'startRepair') : s;
    case 'job:started':
      return id === 'startRepair' && event.tutorial !== false
        ? next(s, 'waitRepair', { jobId: event.jobId }, { repairStarted: true })
        : s;
    case 'job:ready':
      return id === 'waitRepair' && event.jobId === s.context.jobId
        ? next(s, 'collectPay', {}, { repairReady: true })
        : s;
    case 'job:claimed':
      return id === 'collectPay' && event.jobId === s.context.jobId
        ? next(s, 'closeJobs', {}, { collected: true })
        : s;
    case 'jobs:closed':
      return id === 'closeJobs' ? next(s, 'selectCar') : s;
    case 'customize:opened':
      return id === 'selectCar' ? next(s, 'applyChange', { carId: event.carId }) : s;
    case 'car:customized':
      return id === 'applyChange' && event.carId === s.context.carId && event.changed !== false
        ? next(s, 'learnJobs', {}, { customized: true })
        : s;
    case 'customize:cancelled':
      return id === 'applyChange' ? retry(s) : s;
    case 'race:started':
      return id === 'race'
        ? { ...s, context: { ...s.context, raceSessionId: event.sessionId }, evidence: { ...s.evidence, raceStarted: true }, updatedAt: stamp() }
        : s;
    case 'race:finished':
      return id === 'race' && event.sessionId === s.context.raceSessionId && event.resultsInDom !== false
        ? next(s, 'raceResult', {}, { raced: true })
        : s;
    case 'race:results-closed':
      return id === 'raceResult' ? next(s, 'town') : s;
    case 'race:aborted':
      return id === 'raceResult' || id === 'race'
        ? { ...next(s, 'race', { raceSessionId: null }), evidence: { ...s.evidence, retries: (Number(s.evidence.retries) || 0) + 1 } }
        : s;
    case 'town:opened':
      return id === 'town' ? next(s, 'complete', {}, { townVisited: true }) : s;
    case 'skip':
      return { ...s, status: 'skipped', updatedAt: stamp() };
    default:
      return s;
  }
}
