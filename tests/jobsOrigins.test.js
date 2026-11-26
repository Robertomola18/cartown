import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerJob,
  customerJobDuration,
  customerPayout,
  streetJobDuration,
  JOB_MAX_DURATION_MS,
  JOB_MAX_PAYOUT,
} from '../src/game/jobs.js';

const service = { id: 'restoration', name: 'Full Restoration', icon: '🏆', time: 3, fuel: 8, coins: 360, xp: 60 };

test('panel customer jobs keep the scaled payout and duration', () => {
  const job = customerJob('panel', service);
  assert.equal(job.origin, 'panel');
  assert.equal(job.coins, JOB_MAX_PAYOUT);
  assert.equal(job.duration, JOB_MAX_DURATION_MS);
  assert.equal(customerPayout(service), JOB_MAX_PAYOUT);
  assert.equal(customerJobDuration(service), JOB_MAX_DURATION_MS);
});

test('street car jobs stay between one and three minutes', () => {
  const short = { ...service, time: 1 };
  const street = customerJob('street', service, 1000, { origin: 'street', coins: 400, xp: 60 });
  assert.equal(street.origin, 'street');
  assert.equal(street.coins, 400);
  assert.equal(street.xp, 60);
  assert.equal(street.duration, 3 * 60 * 1000);
  assert.equal(streetJobDuration(short), 60 * 1000);
  assert.equal(streetJobDuration(service), 3 * 60 * 1000);
});
