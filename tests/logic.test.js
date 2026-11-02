import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN, DELOAD, TEST_WEEK, prescription, roundTo, targetWeight, workingMax, platesPerSide, warmups, newBlock,
  setDeload, sessionStatus, weekProgress, nextSession, currentWeek, weekToRepeat, resetWeek, longBreak,
  restartBlock, evaluateLift, convertState, isValidState, upgrade, emptyState,
} from '../logic.js';

const MAX = { squat: 405, bench: 285, deadlift: 495 };

const dayIndex = (block, day) => block.log[0].findIndex((s) => s.day === day);

// Logs every day in weeks 1-3 at target reps, then sets each week 3 test set to `testReps`.
function cleanBlock(testReps = 2, opts = {}) {
  const b = newBlock(MAX, '2026-11-02', opts);
  for (let w = 0; w < 3; w++) {
    for (const s of b.log[w]) s.reps = Array(s.reps.length).fill(prescription(s.kind, w).reps);
  }
  for (const s of b.log[TEST_WEEK]) if (s.kind === 'base') s.reps[s.reps.length - 1] = testReps;
  return b;
}

test('target weights follow the template days and the heavier repeat days', () => {
  assert.equal(targetWeight(405, 'base', 0, 5), 285); // 70%: 283.5
  assert.equal(targetWeight(405, 'base', 1, 5), 305); // 75%: 303.75
  assert.equal(targetWeight(405, 'base', 2, 5), 335); // 82.5%: 334.125
  assert.equal(targetWeight(405, 'heavy', 0, 5), 315); // 77.5%: 313.875
  assert.equal(targetWeight(405, 'heavy', 1, 5), 335); // 82.5%
  assert.equal(targetWeight(405, 'heavy', 2, 5), 355); // 87.5%: 354.375
  assert.equal(targetWeight(405, 'base', 3, 5), 245); // deload 60%: 243
  assert.equal(targetWeight(285, 'base', 0, 5), 200); // 199.5
  assert.equal(roundTo(201.2, 2.5), 200);
  assert.equal(roundTo(201.3, 2.5), 202.5);
});

test('a training max takes 90% of the real max', () => {
  assert.equal(workingMax(400, { trainingMax: false }), 400);
  assert.equal(workingMax(400, { trainingMax: true }), 360);
  assert.equal(targetWeight(workingMax(400, { trainingMax: true }), 'base', 0, 5), 250); // 252
});

test('plates per side are greedy from the heaviest plate', () => {
  assert.deepEqual(platesPerSide(335, 'lb'), [45, 45, 45, 10]);
  assert.deepEqual(platesPerSide(200, 'lb'), [45, 25, 5, 2.5]);
  assert.deepEqual(platesPerSide(45, 'lb'), []);
  assert.deepEqual(platesPerSide(30, 'lb'), []);
  assert.deepEqual(platesPerSide(142.5, 'kg'), [25, 25, 10, 1.25]);
});

test('warm-ups ramp up and stay below the working weight', () => {
  assert.deepEqual(warmups(405, 285, 'lb', 5), [{ weight: 205, reps: '5' }, { weight: 255, reps: '3' }]);
  assert.deepEqual(warmups(405, 355, 'lb', 5).map((s) => s.weight), [205, 255, 305, 345]);
  assert.deepEqual(warmups(405, 245, 'lb', 5).map((s) => s.weight), [205]);
  assert.deepEqual(warmups(80, 60, 'lb', 5), [{ weight: 50, reps: '3' }]); // 40 is lighter than the bar
  assert.deepEqual(warmups(80, 45, 'lb', 5), []); // working on the empty bar
  // 75% of 285 rounds to 215, too close to the 220 working weight to be its own set.
  assert.deepEqual(warmups(285, 220, 'lb', 5).map((s) => s.weight), [145, 180]);
});

test('each week follows the Mon-Fri schedule; Thursday and Friday are the heavy days', () => {
  const b = newBlock(MAX, '2026-11-02');
  assert.deepEqual(b.log[0].map((s) => `${s.day} ${s.lift} ${s.kind}`), [
    'Monday bench base', 'Tuesday squat base', 'Wednesday deadlift base', 'Thursday bench heavy', 'Friday squat heavy',
  ]);
  assert.equal(b.log.length, 3);
  assert.deepEqual(b.log.map((week) => week[0].reps.length), [3, 4, 5]);
  assert.deepEqual(b.log.map((week) => week[3].reps.length), [3, 4, 3]);
});

test('the deload week can be added, and removed only before it is used', () => {
  const b = newBlock(MAX, '2026-11-02');
  assert.equal(setDeload(b, true), true);
  assert.equal(b.log.length, 4);
  assert.deepEqual(b.log[3].map((s) => s.reps.length), [2, 2, 2, 2, 2]);
  b.log[3][0].reps[0] = 5;
  assert.equal(setDeload(b, false), false);
  assert.equal(b.log.length, 4);
  b.log[3][0].reps[0] = null;
  assert.equal(setDeload(b, false), true);
  assert.equal(b.log.length, 3);
  assert.equal(newBlock(MAX, '2026-11-02', { deload: true }).log.length, 4);
  assert.equal(DELOAD.pct, 0.6);
});

test('next session waits on a missed day until it is done or skipped', () => {
  const b = newBlock(MAX, '2026-11-02');
  assert.deepEqual(nextSession(b), { week: 0, index: 0 });
  b.log[0][0].reps = [6, 6, null];
  assert.equal(sessionStatus(b.log[0][0]), 'started');
  b.log[0][0].skipped = true;
  assert.equal(sessionStatus(b.log[0][0]), 'skipped');
  assert.deepEqual(nextSession(b), { week: 0, index: 1 });
  assert.equal(weekProgress(b, 0), 1 / 5);
  const done = cleanBlock();
  assert.equal(nextSession(done), null);
  assert.equal(currentWeek(done), 2);
});

test('skipping most of a week offers to repeat it before the next week starts', () => {
  const b = newBlock(MAX, '2026-11-02');
  b.log[0][0].reps = [6, 6, 6];
  b.log[0][1].reps = [6, 6, 6];
  for (const i of [2, 3, 4]) b.log[0][i].skipped = true;
  assert.equal(weekToRepeat(b), 0);
  resetWeek(b, 0);
  assert.equal(sessionStatus(b.log[0][2]), 'todo');
  assert.equal(weekToRepeat(b), null);

  const two = newBlock(MAX, '2026-11-02');
  for (const i of [0, 1, 2]) two.log[0][i].reps.fill(6);
  for (const i of [3, 4]) two.log[0][i].skipped = true;
  assert.equal(weekToRepeat(two), null); // 2 of 5 skipped is not most of the week
});

test('two weeks off offers a restart at week 1, once per break', () => {
  const b = cleanBlock();
  resetWeek(b, 2);
  b.lastTrained = '2026-11-01';
  assert.equal(longBreak(b, '2026-11-10'), 0);
  assert.equal(longBreak(b, '2026-11-15'), 14);
  b.breakSeen = '2026-11-01';
  assert.equal(longBreak(b, '2026-11-20'), 0);
  b.breakSeen = null;
  restartBlock(b);
  assert.deepEqual(nextSession(b), { week: 0, index: 0 });
  assert.equal(longBreak(b, '2026-11-20'), 0);
});

test('increase scales with the best extra reps on a week 3 test set', () => {
  // Only the target reps: the max is likely too high, so it holds even though every rep was hit.
  const flat = evaluateLift(cleanBlock(2), 'squat', 'lb');
  assert.equal(flat.passed, true);
  assert.equal(flat.tested, true);
  assert.equal(flat.suggested, 405);
  assert.equal(evaluateLift(cleanBlock(3), 'squat', 'lb').suggested, 410);
  assert.equal(evaluateLift(cleanBlock(4), 'squat', 'lb').suggested, 412.5);
  assert.equal(evaluateLift(cleanBlock(5), 'squat', 'lb').suggested, 415);
  assert.equal(evaluateLift(cleanBlock(9), 'deadlift', 'lb').suggested, 505);
  assert.equal(evaluateLift(cleanBlock(3), 'bench', 'lb').suggested, 287.5);
  assert.equal(evaluateLift(cleanBlock(4), 'bench', 'lb').suggested, 288.75);

  // No test set logged (that day skipped): the template's low step applies.
  const untested = cleanBlock(2);
  untested.log[TEST_WEEK][dayIndex(untested, 'Wednesday')].skipped = true;
  assert.equal(evaluateLift(untested, 'deadlift', 'lb').tested, false);
  assert.equal(evaluateLift(untested, 'deadlift', 'lb').suggested, 500);

  // Heavy-day sets aren't test sets, so extra reps there don't change the increase.
  const heavyExtra = cleanBlock(2);
  heavyExtra.log[TEST_WEEK][dayIndex(heavyExtra, 'Thursday')].reps[2] = 5;
  assert.equal(evaluateLift(heavyExtra, 'bench', 'lb').extra, 0);
});

test('a short set on any trained day holds the max; skipped days are left out', () => {
  const short = cleanBlock(4);
  short.log[1][dayIndex(short, 'Thursday')].reps[2] = 2;
  const r = evaluateLift(short, 'bench', 'lb');
  assert.equal(r.passed, false);
  assert.equal(r.suggested, 285);
  assert.deepEqual(r.misses, [{ week: 1, day: 'Thursday', short: 1, unlogged: 0 }]);

  const skipped = cleanBlock(3);
  skipped.log[0][dayIndex(skipped, 'Friday')].skipped = true;
  skipped.log[1][dayIndex(skipped, 'Tuesday')].reps.fill(null);
  const s = evaluateLift(skipped, 'squat', 'lb');
  assert.equal(s.passed, true);
  assert.equal(s.skipped, 2);
  assert.equal(s.suggested, 410);

  const nothing = newBlock(MAX, '2026-11-02');
  assert.equal(evaluateLift(nothing, 'deadlift', 'lb').performed, 0);
  assert.equal(evaluateLift(nothing, 'deadlift', 'lb').passed, false);

  // The deload week never counts.
  const deload = cleanBlock(2, { deload: true });
  deload.log[3][0].reps = [1, 1];
  assert.equal(evaluateLift(deload, 'bench', 'lb').passed, true);
});

test('unit conversion round-trips and resets rounding', () => {
  const b = cleanBlock();
  b.log[0][0].weight = 280;
  const kg = convertState({ ...emptyState(), blocks: [b] }, 'kg');
  assert.equal(kg.round, 2.5);
  assert.equal(Math.round(kg.blocks[0].max.squat * 10) / 10, 183.7);
  assert.equal(Math.round(kg.blocks[0].log[0][0].weight * 10) / 10, 127);
  const back = convertState(kg, 'lb');
  for (const [id, v] of Object.entries(b.max)) assert.ok(Math.abs(back.blocks[0].max[id] - v) < 1e-9);
});

test('saved data validation accepts real data and rejects malformed data', () => {
  const good = { ...emptyState(), blocks: [cleanBlock(), cleanBlock(2, { deload: true })] };
  assert.equal(isValidState(good), true);
  assert.equal(isValidState(JSON.parse(JSON.stringify(good))), true);
  const copy = () => JSON.parse(JSON.stringify(good));
  const badReps = copy();
  badReps.blocks[0].log[0][0].reps = [6, 6];
  assert.equal(isValidState(badReps), false);
  const badDay = copy();
  badDay.blocks[0].log[0][0].day = '<img src=x>';
  assert.equal(isValidState(badDay), false);
  const badDeload = copy();
  badDeload.blocks[0].deload = true;
  assert.equal(isValidState(badDeload), false);
  const noTm = copy();
  delete noTm.trainingMax;
  assert.equal(isValidState(noTm), false);
  assert.equal(isValidState(null), false);
});

test('first-release data moves each lift onto its template day and keeps the deload', () => {
  const v1Log = [3, 4, 5, 2].map((sets, w) => ({
    squat: { reps: Array(sets).fill(w === 0 ? 6 : null), weight: null },
    bench: { reps: Array(sets).fill(null), weight: w === 0 ? 200 : null },
    deadlift: { reps: Array(sets).fill(null), weight: null },
  }));
  const v1 = { v: 1, unit: 'lb', round: 5, blocks: [{ started: '2026-11-02', finished: null, max: MAX, log: v1Log }] };
  const v2 = upgrade(v1);
  assert.equal(isValidState(v2), true);
  const b = v2.blocks[0];
  assert.equal(b.deload, true);
  assert.deepEqual(b.log[0][dayIndex(b, 'Tuesday')].reps, [6, 6, 6]);
  assert.deepEqual(b.log[0][dayIndex(b, 'Friday')].reps, [null, null, null]);
  assert.equal(b.log[0][dayIndex(b, 'Monday')].weight, 200);
  // Heavy days in the week already under way count as skipped, so the log resumes where it was.
  assert.equal(sessionStatus(b.log[0][dayIndex(b, 'Thursday')]), 'skipped');
  assert.equal(sessionStatus(b.log[1][dayIndex(b, 'Thursday')]), 'todo');
  assert.deepEqual(nextSession(b), { week: 0, index: dayIndex(b, 'Monday') });
  assert.equal(upgrade({ nope: 1 }), null);
  assert.equal(upgrade(v2), v2);
  assert.equal(PLAN.heavy[2].pct, 0.875);
});
