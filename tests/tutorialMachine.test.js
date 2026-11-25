import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTutorialEvent,
  newTutorialSession,
  normalizeTutorial,
  tutorialSessionFromLegacy,
  tutorialTarget,
} from '../src/game/tutorialMachine.js';

function run(session, ...events) {
  return events.reduce((state, event) => applyTutorialEvent(state, event), session);
}

test('complete tutorial flow', () => {
  let s = newTutorialSession();
  s = run(s,
    { type: 'ui:cta', stepId: 'welcome' },
    { type: 'jobs:opened' },
    { type: 'job:started', jobId: 'j1', tutorial: true },
    { type: 'job:ready', jobId: 'j1' },
    { type: 'job:claimed', jobId: 'j1' },
    { type: 'jobs:closed' },
    { type: 'customize:opened', carId: 'c1' },
    { type: 'car:customized', carId: 'c1', changed: true },
    { type: 'ui:cta', stepId: 'learnJobs' },
    { type: 'race:started', sessionId: 'r1' },
    { type: 'race:finished', sessionId: 'r1', resultsInDom: true },
    { type: 'race:results-closed', sessionId: 'r1' },
    { type: 'town:opened' },
    { type: 'ui:cta', stepId: 'complete' });
  assert.equal(s.status, 'completed');
  assert.deepEqual(s.evidence, {
    repairStarted: true,
    repairReady: true,
    collected: true,
    customized: true,
    raceStarted: true,
    raced: true,
    townVisited: true,
  });
});

test('events from other jobs or races do not advance', () => {
  let s = newTutorialSession();
  s = run(s, { type: 'ui:cta', stepId: 'welcome' }, { type: 'jobs:opened' }, { type: 'job:started', jobId: 'j1', tutorial: true });
  assert.equal(s.stepId, 'waitRepair');
  s = applyTutorialEvent(s, { type: 'job:ready', jobId: 'other' });
  assert.equal(s.stepId, 'waitRepair');
  s = applyTutorialEvent(s, { type: 'job:ready', jobId: 'j1' });
  assert.equal(s.stepId, 'collectPay');
  s = run(s,
    { type: 'job:claimed', jobId: 'j1' },
    { type: 'jobs:closed' },
    { type: 'customize:opened', carId: 'c1' },
    { type: 'car:customized', carId: 'c1', changed: true },
    { type: 'ui:cta', stepId: 'learnJobs' },
    { type: 'race:started', sessionId: 'r1' });
  assert.equal(s.stepId, 'race');
  s = applyTutorialEvent(s, { type: 'race:finished', sessionId: 'other', resultsInDom: true });
  assert.equal(s.stepId, 'race');
  s = applyTutorialEvent(s, { type: 'race:finished', sessionId: 'r1', resultsInDom: true });
  assert.equal(s.stepId, 'raceResult');
  s = applyTutorialEvent(s, { type: 'race:results-closed', sessionId: 'r1' });
  assert.equal(s.stepId, 'town');
});

test('race abort returns to race step and increments retries', () => {
  let s = run(newTutorialSession(),
    { type: 'ui:cta', stepId: 'welcome' }, { type: 'jobs:opened' },
    { type: 'job:started', jobId: 'j1', tutorial: true }, { type: 'job:ready', jobId: 'j1' },
    { type: 'job:claimed', jobId: 'j1' }, { type: 'jobs:closed' },
    { type: 'customize:opened', carId: 'c1' }, { type: 'car:customized', carId: 'c1', changed: true },
    { type: 'ui:cta', stepId: 'learnJobs' }, { type: 'race:started', sessionId: 'r1' });
  s = applyTutorialEvent(s, { type: 'race:aborted', sessionId: 'r1' });
  assert.equal(s.stepId, 'race');
  assert.equal(s.context.raceSessionId, null);
  assert.equal(s.evidence.retries, 1);
});

test('legacy step migrates and target interpolates job id', () => {
  const legacy = tutorialSessionFromLegacy(2);
  assert.equal(legacy.stepId, 'collectPay');
  const s = { ...legacy, context: { jobId: 'j7' } };
  assert.equal(tutorialTarget(s), '[data-tutorial="claim"][data-job-id="j7"]');
  assert.equal(normalizeTutorial({ version: 1, stepId: 'race' }), null);
});

test('skip ends the session without completing evidence', () => {
  const s = applyTutorialEvent(newTutorialSession(), { type: 'skip' });
  assert.equal(s.status, 'skipped');
  assert.equal(applyTutorialEvent(s, { type: 'ui:cta', stepId: 'welcome' }).status, 'skipped');
});
