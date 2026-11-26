import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/game/state.js';

function makeState(mechanics = 2) {
  const state = Object.create(GameState.prototype);
  state.data = {
    cars: [
      { id: 'c1', cfg: { model: 'hatch', upgrades: {} }, placed: null },
      { id: 'c2', cfg: { model: 'hatch', upgrades: {} }, placed: null },
      { id: 'c3', cfg: { model: 'hatch', upgrades: {} }, placed: null },
    ],
    jobs: [],
    coins: 100000,
    staff: { mechanics },
    settings: { tutorial: null },
  };
  state.remote = false;
  state.emit = () => {};
  state.emitTutorialEvent = () => {};
  state.save = () => {};
  state.saveNow = () => {};
  state.spend = (cost) => {
    if (state.data.coins < cost) return false;
    state.data.coins -= cost;
    return true;
  };
  return state;
}

test('own workshop jobs run in parallel up to the hired mechanics', () => {
  const st = makeState(2);
  assert.equal(st.jobSlots('own'), 2);
  assert.equal(st.startOwnJob('c1', 'engine', 'lift-1', 0).ok, true);
  assert.equal(st.startOwnJob('c2', 'turbo', 'lift-2', 1).ok, true);
  assert.equal(st.startOwnJob('c3', 'gearbox', 'lift-3', 2).error, 'slots');
});

test('own workshop jobs cannot reuse a mechanic or a lift', () => {
  const st = makeState(2);
  assert.equal(st.startOwnJob('c1', 'engine', 'lift-1', 0).ok, true);
  assert.equal(st.startOwnJob('c2', 'turbo', 'lift-2', 0).error, 'mechanic');
  assert.equal(st.startOwnJob('c2', 'turbo', 'lift-1', 1).error, 'stationBusy');
});
