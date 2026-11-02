import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFTS, WEEKS, HEAVY_WEEK, HEAVY_SET, roundTo, targetWeight, platesPerSide, newBlock,
  weekProgress, currentWeek, evaluateLift, convertState, isValidState,
} from '../logic.js';

const MAX = { squat: 405, bench: 285, deadlift: 495 };

// Logs every set in weeks 1-3 at target reps, then sets the test set to `heavyReps`.
function cleanBlock(heavyReps = 2) {
  const b = newBlock(MAX, '2026-11-02');
  for (let w = 0; w < 3; w++) {
    for (const l of LIFTS) b.log[w][l.id].reps = Array(WEEKS[w].sets).fill(WEEKS[w].reps);
  }
  for (const l of LIFTS) b.log[HEAVY_WEEK][l.id].reps[HEAVY_SET] = heavyReps;
  return b;
}

test('target weights match the template percentages, rounded to the plate increment', () => {
  assert.equal(targetWeight(405, 0, 5), 285); // 283.5
  assert.equal(targetWeight(405, 1, 5), 305); // 303.75
  assert.equal(targetWeight(405, 2, 5), 335); // 334.125
  assert.equal(targetWeight(405, 3, 5), 205); // 202.5 rounds up
  assert.equal(targetWeight(285, 0, 5), 200); // 199.5
  assert.equal(targetWeight(285, 2, 2.5), 235); // 235.125
  assert.equal(roundTo(201.2, 2.5), 200);
  assert.equal(roundTo(201.3, 2.5), 202.5);
});

test('plates per side are greedy from the heaviest plate', () => {
  assert.deepEqual(platesPerSide(335, 'lb'), [45, 45, 45, 10]);
  assert.deepEqual(platesPerSide(200, 'lb'), [45, 25, 5, 2.5]);
  assert.deepEqual(platesPerSide(45, 'lb'), []);
  assert.deepEqual(platesPerSide(30, 'lb'), []);
  assert.deepEqual(platesPerSide(142.5, 'kg'), [25, 25, 10, 1.25]);
});

test('progress and current week follow logged sets', () => {
  const b = newBlock(MAX, '2026-11-02');
  assert.equal(currentWeek(b), 0);
  assert.equal(weekProgress(b, 0), 0);
  b.log[0].squat.reps = [6, 6, 6];
  assert.equal(weekProgress(b, 0), 1 / 3);
  const done = cleanBlock();
  assert.equal(currentWeek(done), 3);
  for (const l of LIFTS) done.log[3][l.id].reps = [5, 5];
  assert.equal(currentWeek(done), 3);
});

test('increase scales with extra reps on the heavy set', () => {
  assert.equal(evaluateLift(cleanBlock(2), 'squat', 'lb').suggested, 410);
  assert.equal(evaluateLift(cleanBlock(3), 'squat', 'lb').suggested, 412.5);
  assert.equal(evaluateLift(cleanBlock(4), 'squat', 'lb').suggested, 415);
  assert.equal(evaluateLift(cleanBlock(7), 'deadlift', 'lb').suggested, 505);
  assert.equal(evaluateLift(cleanBlock(2), 'bench', 'lb').suggested, 287.5);
  assert.equal(evaluateLift(cleanBlock(3), 'bench', 'lb').suggested, 288.75);
  assert.equal(evaluateLift(cleanBlock(4), 'bench', 'lb').suggested, 290);
  assert.equal(evaluateLift(cleanBlock(3), 'squat', 'lb').extra, 1);
});

test('a short or unlogged set in weeks 1-3 holds the max; the deload week does not count', () => {
  const short = cleanBlock(4);
  short.log[1].bench.reps[2] = 3;
  const r = evaluateLift(short, 'bench', 'lb');
  assert.equal(r.passed, false);
  assert.equal(r.suggested, 285);
  assert.deepEqual(r.misses, [{ week: 1, short: 1, unlogged: 0 }]);
  assert.equal(evaluateLift(short, 'squat', 'lb').passed, true);

  const unlogged = cleanBlock(2);
  unlogged.log[0].deadlift.reps[0] = null;
  assert.deepEqual(evaluateLift(unlogged, 'deadlift', 'lb').misses, [{ week: 0, short: 0, unlogged: 1 }]);

  const missedHeavy = cleanBlock(1);
  assert.equal(evaluateLift(missedHeavy, 'squat', 'lb').passed, false);
});

test('unit conversion converts maxes and logged weights and resets rounding', () => {
  const b = cleanBlock();
  b.log[0].squat.weight = 280;
  const kg = convertState({ v: 1, unit: 'lb', round: 5, blocks: [b] }, 'kg');
  assert.equal(kg.unit, 'kg');
  assert.equal(kg.round, 2.5);
  assert.equal(Math.round(kg.blocks[0].max.squat * 10) / 10, 183.7);
  assert.equal(Math.round(kg.blocks[0].log[0].squat.weight * 10) / 10, 127);
  assert.equal(kg.blocks[0].log[0].bench.weight, null);
});

test('switching units and back returns the original numbers', () => {
  const b = newBlock({ squat: 415, bench: 288.75, deadlift: 495 }, '2026-11-02');
  const lb = { v: 1, unit: 'lb', round: 5, blocks: [b] };
  const back = convertState(convertState(lb, 'kg'), 'lb');
  for (const [id, v] of Object.entries(b.max)) assert.ok(Math.abs(back.blocks[0].max[id] - v) < 1e-9);
  assert.equal(targetWeight(back.blocks[0].max.squat, 2, back.round), 340); // 342.375
});

test('backup validation accepts real data and rejects malformed data', () => {
  const good = { v: 1, unit: 'lb', round: 5, blocks: [cleanBlock()] };
  assert.equal(isValidState(good), true);
  assert.equal(isValidState(JSON.parse(JSON.stringify(good))), true);
  assert.equal(isValidState({ ...good, v: 2 }), false);
  assert.equal(isValidState({ ...good, round: 3 }), false);
  const badReps = JSON.parse(JSON.stringify(good));
  badReps.blocks[0].log[0].squat.reps = [6, 6];
  assert.equal(isValidState(badReps), false);
  assert.equal(isValidState(null), false);
});
