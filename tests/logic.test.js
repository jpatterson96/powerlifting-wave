import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKS, ATTEMPTS, FIRST_TEST, SECOND_TEST, FINISH_WEEK, prescription, roundTo, targetWeight, workingMax, platesPerSide,
  warmups, REMAX_RAMP, estimateMax, adjustMax, weekMax, attemptWeight, setWeight, singleWeight, restSeconds, newBlock,
  setFinish, finishFor, sessionStatus, weekProgress, nextSession, currentWeek, weekToRepeat, resetWeek, longBreak,
  restartBlock, evaluateLift, liftHistory, maxChanges, liftRecord, totalHistory, convertState, isValidState, upgrade, emptyState,
  dayPct, heatOf, liftPath, weekHeat,
} from '../logic.js';

const MAX = { squat: 405, bench: 285, deadlift: 495 };
const LB = { unit: 'lb', round: 5, trainingMax: false };

const dayIndex = (block, day, week = 0) => block.log[week].findIndex((s) => s.day === day);
const base = (block, week, lift) => block.log[week].find((s) => s.lift === lift && s.kind === 'base');

// Logs every training day in weeks 1-7 at target reps; test sets get `first` and `second` reps.
function cleanBlock({ first = 6, second = 5, finish = 'deload' } = {}) {
  const b = newBlock(MAX, '2026-11-02', finish);
  for (let w = 0; w < FINISH_WEEK; w++) {
    for (const s of b.log[w]) s.reps = Array(s.reps.length).fill(prescription(s.kind, w).reps);
  }
  for (const [week, reps] of [[FIRST_TEST, first], [SECOND_TEST, second]]) {
    for (const s of b.log[week]) if (s.kind === 'base') s.reps[s.reps.length - 1] = reps;
  }
  return b;
}

test('target weights follow both waves, the taper and the deload finish', () => {
  assert.equal(targetWeight(405, 'base', 0, 5), 285); // 70%: 283.5
  assert.equal(targetWeight(405, 'base', 1, 5), 305); // 75%: 303.75
  assert.equal(targetWeight(405, 'base', 2, 5), 335); // 82.5%: 334.125
  assert.equal(targetWeight(405, 'heavy', 0, 5), 315); // 77.5%: 313.875
  assert.equal(targetWeight(405, 'heavy', 2, 5), 355); // 87.5%: 354.375
  assert.equal(targetWeight(405, 'base', 3, 5), 305); // wave 2, 75%
  assert.equal(targetWeight(405, 'base', 4, 5), 325); // 80%
  assert.equal(targetWeight(405, 'base', 5, 5), 345); // 85%: 344.25
  assert.equal(targetWeight(405, 'heavy', 5, 5), 375); // 92.5%: 374.6
  assert.equal(targetWeight(405, 'base', 6, 5), 325); // taper doubles at 80%
  assert.equal(targetWeight(405, 'heavy', 7, 5), 245); // deload 60%: 243
  assert.equal(roundTo(201.2, 2.5), 200);
  assert.equal(roundTo(201.3, 2.5), 202.5);
  const b = newBlock(MAX, '2026-11-02');
  assert.equal(singleWeight(b, base(b, 6, 'squat'), 6, LB), 365); // 90%: 364.5
  assert.equal(singleWeight(b, b.log[6][3], 6, LB), null);
});

test('a day\'s heat runs from the deload\'s 60% to the third re-max attempt', () => {
  const b = newBlock(MAX, '2026-11-02', 'remax');
  const deload = newBlock(MAX, '2026-11-02', 'deload');
  assert.equal(dayPct(b.log[0][3], 0), 0.775);
  assert.equal(dayPct(base(b, 6, 'bench'), 6), 0.9); // the taper's single, not its 80% doubles
  assert.equal(dayPct(b.log[7][0], 7), 1.02);
  assert.equal(dayPct(deload.log[7][0], 7), 0.6);
  assert.equal(heatOf(0.6), 0);
  assert.equal(heatOf(1.02), 1);
  assert.equal(heatOf(0.81), 0.5);
  assert.equal(heatOf(0.5), 0);
  assert.equal(weekHeat(b, 5), 0.774); // week 6's 92.5% heavy days
  assert.equal(weekHeat(b, 5, 'deadlift'), heatOf(0.85)); // deadlift has only the template day
  assert.equal(weekHeat(b, 7), 1);
  assert.equal(weekHeat(deload, 7), 0);
});

test('a lift\'s path through the block is each of its days\' top weight', () => {
  const b = newBlock(MAX, '2026-11-02', 'remax');
  const path = liftPath(b, 'bench', LB);
  assert.equal(path.length, 15); // Monday and Thursday for 7 weeks, then the re-max Monday
  assert.deepEqual(path[0], { week: 0, index: 0, weight: 200, pct: 0.7 }); // 70% of 285: 199.5
  assert.equal(path.find((d) => d.week === 6).weight, 255); // the taper's 90% single, over its 80% doubles
  assert.equal(path.at(-1).weight, 290); // third attempt, 102%: 290.7
  b.log[7][0].reps = [1, 1, 0];
  assert.equal(liftPath(b, 'bench', LB).at(-1).weight, 275); // the second, the best made
  assert.ok(liftPath(b, 'deadlift', LB).every((d) => b.log[d.week][d.index].lift === 'deadlift'));
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
  assert.deepEqual(platesPerSide(65, 'lb', 25), [10, 10]); // EZ bar
  assert.deepEqual(platesPerSide(180, 'lb', 0), [45, 45]); // plate-loaded machine
});

test('warm-ups ramp up and stay below the working weight', () => {
  assert.deepEqual(warmups(405, 285, 'lb', 5), [{ weight: 205, reps: '5' }, { weight: 255, reps: '3' }]);
  assert.deepEqual(warmups(405, 355, 'lb', 5).map((s) => s.weight), [205, 255, 305, 345]);
  assert.deepEqual(warmups(80, 60, 'lb', 5), [{ weight: 50, reps: '3' }]); // 40 is lighter than the bar
  assert.deepEqual(warmups(80, 45, 'lb', 5), []); // working on the empty bar
  // 75% of 285 rounds to 215, too close to the 220 working weight to be its own set.
  assert.deepEqual(warmups(285, 220, 'lb', 5).map((s) => s.weight), [145, 180]);
  // Re-max: two singles before the opener, one for deadlift.
  assert.deepEqual(warmups(385, 350, 'lb', 5, REMAX_RAMP.lift).map((s) => s.weight), [155, 230, 270, 310, 335]);
  assert.deepEqual(warmups(455, 415, 'lb', 5, REMAX_RAMP.deadlift).map((s) => s.weight), [180, 275, 320, 365]);
});

test('a block is 8 weeks on the Mon-Fri schedule; week 8 is a re-max or a deload', () => {
  const b = newBlock(MAX, '2026-11-02');
  assert.deepEqual(b.log[0].map((s) => `${s.day} ${s.lift} ${s.kind}`), [
    'Monday bench base', 'Tuesday squat base', 'Wednesday deadlift base', 'Thursday bench heavy', 'Friday squat heavy',
  ]);
  assert.equal(b.log.length, 8);
  assert.deepEqual(b.log.map((week) => week[0].reps.length), [3, 4, 5, 3, 4, 4, 2, 3]);
  assert.deepEqual(b.log.slice(0, 7).map((week) => week[3].reps.length), [3, 4, 3, 3, 4, 3, 3]);
  assert.equal(b.finish, 'remax');
  assert.deepEqual(b.log[7].map((s) => `${s.day} ${s.kind}`), ['Monday max', 'Tuesday max', 'Wednesday max']);
  assert.deepEqual(b.log[7][0].weights, [null, null, null]);
  const d = newBlock(MAX, '2026-11-02', 'deload');
  assert.deepEqual(d.log[7].map((s) => s.reps.length), [2, 2, 2, 2, 2]);
  assert.deepEqual([0, 1, 2, 3].map(finishFor), ['remax', 'deload', 'remax', 'deload']);
});

test('week 8 switches between re-max and deload only before it is used', () => {
  const b = newBlock(MAX, '2026-11-02');
  assert.equal(setFinish(b, 'deload'), true);
  assert.equal(b.log[7].length, 5);
  b.log[7][0].reps[0] = 5;
  assert.equal(setFinish(b, 'remax'), false);
  assert.equal(b.finish, 'deload');
  b.log[7][0].reps[0] = null;
  assert.equal(setFinish(b, 'remax'), true);
  b.log[7][1].weights[2] = 400;
  assert.equal(setFinish(b, 'deload'), false);
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
  assert.deepEqual(nextSession(done), { week: 7, index: 0 });
  for (const s of done.log[7]) s.skipped = true;
  assert.equal(nextSession(done), null);
  assert.equal(currentWeek(done), 7);
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
  assert.equal(b.log[7].length, 5); // the deload finish stays a deload
});

test('test-set reps move a max: down 5%, held, or up the low, middle or top step', () => {
  const squat = (week, pct) => {
    const w = roundTo(385 * pct, 5);
    return (reps) => adjustMax(385, estimateMax(w, reps), 'squat', LB).value;
  };
  const w3 = squat(FIRST_TEST, 0.825); // 320
  assert.deepEqual([2, 4, 5, 6, 7, 8, 9].map(w3), [365, 365, 385, 385, 390, 392.5, 395]);
  const w6 = squat(SECOND_TEST, 0.85); // 325
  assert.deepEqual([3, 4, 5, 6, 7, 8].map(w6), [365, 385, 385, 390, 392.5, 395]);
  assert.equal(adjustMax(315, estimateMax(260, 7), 'bench', LB).value, 317.5);
  assert.equal(estimateMax(320, 7), 389.333); // Epley 394.67, Brzycki 384
});

test('the week 3 test set sets the max for weeks 4-8', () => {
  const b = newBlock(MAX, '2026-11-02');
  const tue = base(b, FIRST_TEST, 'squat');
  assert.equal(weekMax(b, 'squat', 4, LB), 405);
  tue.reps = [2, 2, 2, 2, 8]; // 335 x 8 at a 405 max: estimate ~414, +7.5
  assert.equal(weekMax(b, 'squat', 2, LB), 405);
  assert.equal(weekMax(b, 'squat', 3, LB), 412.5);
  assert.equal(setWeight(b, base(b, 3, 'squat'), 3, 0, LB), 310); // 75% of 412.5: 309.4
  tue.reps = [2, 2, 2, 2, 3];
  assert.equal(weekMax(b, 'squat', 5, LB), 385); // 95% of 405: 384.75
  tue.skipped = true;
  assert.equal(weekMax(b, 'squat', 5, LB), 405);
});

test('each max is dated: the block start, then the day of a week 3 test set that moved it', () => {
  const state = { ...LB, blocks: [newBlock(MAX, '2026-11-02')] };
  const tue = base(state.blocks[0], FIRST_TEST, 'squat');
  assert.deepEqual(maxChanges(state, 'squat').map((c) => [c.date, c.value]), [['2026-11-02', 405]]);
  tue.reps = [2, 2, 2, 2, 8];
  tue.date = '2026-11-17';
  state.blocks.push(newBlock({ ...MAX, squat: 425 }, '2026-12-28'));
  assert.deepEqual(maxChanges(state, 'squat').map((c) => [c.date, c.value, c.change]),
    [['2026-11-02', 405, 0], ['2026-11-17', 412.5, 7.5], ['2026-12-28', 425, 12.5]]);
  // A test that holds the max isn't a new one, and one logged before days were recorded has no date.
  delete tue.date;
  assert.equal(maxChanges(state, 'squat')[1].date, null);
  tue.reps = [2, 2, 2, 2, 5];
  assert.equal(maxChanges(state, 'squat').length, 2);
  // Maxes from before the app come first by date, and a block's max can be dated the day it was hit.
  state.pastMaxes = [{ date: '2025-03-01', lift: 'squat', value: 365 }, { date: '2024-05-01', lift: 'squat', value: 335 },
    { date: '2025-03-01', lift: 'bench', value: 275 }];
  state.blocks[0].maxDates = { squat: '2026-09-20' };
  assert.deepEqual(maxChanges(state, 'squat').map((c) => [c.date, c.value, c.change, Boolean(c.past)]), [
    ['2024-05-01', 335, 0, true], ['2025-03-01', 365, 30, true], ['2026-09-20', 405, 40, false], ['2026-12-28', 425, 20, false]]);
  assert.equal(convertState(state, 'kg').pastMaxes[0].value, 365 / 2.20462);
});

test('records are lifts: earlier maxes, the first maxes entered and good re-max attempts', () => {
  const state = {
    ...LB,
    pastMaxes: [{ date: '2019-11-09', lift: 'squat', value: 340 }, { date: '2024-01-05', lift: 'squat', value: 405 },
      { date: '2019-12-12', lift: 'bench', value: 235 }, { date: '2019-11-04', lift: 'deadlift', value: 405 }],
    blocks: [newBlock(MAX, '2026-11-02')],
  };
  state.blocks[0].maxDates = { squat: '2026-09-20' };
  // 405 was lifted twice: the record is the first time, and the best before it is the previous record.
  let r = liftRecord(state, 'squat');
  assert.deepEqual([r.value, r.date, r.kind, r.previous.value, r.previous.date], [405, '2024-01-05', 'past', 340, '2019-11-09']);
  assert.equal(liftRecord(state, 'bench').previous.value, 235);
  assert.equal(liftRecord(state, 'deadlift').previous.value, 405);
  // Good re-max attempts count; a miss and the max the next block starts from don't.
  const tue = state.blocks[0].log[FINISH_WEEK][1];
  assert.equal(tue.lift, 'squat');
  Object.assign(tue, { date: '2026-12-22', weights: [380, 410, 425], reps: [1, 1, 0] });
  state.blocks.push(newBlock({ ...MAX, squat: 440 }, '2026-12-28'));
  r = liftRecord(state, 'squat');
  assert.deepEqual([r.value, r.date, r.kind, r.previous.value], [410, '2026-12-22', 'remax', 405]);
  // The total exists from the first day all three lifts had one, and rises with each record.
  assert.deepEqual(totalHistory(state), [
    { date: '2019-12-12', total: 980 }, { date: '2024-01-05', total: 1045 }, { date: '2026-11-02', total: 1185 }, { date: '2026-12-22', total: 1190 },
  ]);
});

test('re-max attempts build from the week 6 estimate and can be changed', () => {
  const b = newBlock({ squat: 385, bench: 315, deadlift: 455 }, '2026-11-02');
  assert.deepEqual([0, 1, 2].map((a) => attemptWeight(b, 'squat', a, LB)), [350, 370, 395]);
  assert.deepEqual([0, 1, 2].map((a) => attemptWeight(b, 'bench', a, LB)), [285, 300, 320]);
  // Built from the max, attempts ignore a training max: the point is to test the real one.
  assert.equal(attemptWeight(b, 'squat', 0, { ...LB, trainingMax: true }), 350);
  base(b, SECOND_TEST, 'squat').reps = [2, 2, 2, 8]; // 325 x 8: estimate 407.6
  assert.deepEqual([0, 1, 2].map((a) => attemptWeight(b, 'squat', a, LB)), [370, 390, 415]);
  const tue = b.log[7][1];
  tue.weights[2] = 400;
  assert.equal(setWeight(b, tue, 7, 2, LB), 400);
  assert.equal(ATTEMPTS.length, 3);
});

test('rest depends on the lift and the load, and is longest before tests and attempts', () => {
  const b = newBlock(MAX, '2026-11-02');
  const at = (week, day) => b.log[week][dayIndex(b, day, week)];
  assert.equal(restSeconds(at(0, 'Monday'), 0, 1), 120); // bench 70%
  assert.equal(restSeconds(at(0, 'Tuesday'), 0, 1), 150); // squat 70%
  assert.equal(restSeconds(at(0, 'Wednesday'), 0, 1), 180); // deadlift 70%
  assert.equal(restSeconds(at(1, 'Tuesday'), 1, 1), 180); // squat 75%
  assert.equal(restSeconds(at(0, 'Thursday'), 0, 1), 150); // bench 77.5%
  assert.equal(restSeconds(at(5, 'Wednesday'), 5, 1), 240); // deadlift 85%
  assert.equal(restSeconds(at(5, 'Friday'), 5, 1), 240); // squat 92.5%
  assert.equal(restSeconds(at(2, 'Tuesday'), 2, 4), 300); // before the squat test set
  assert.equal(restSeconds(at(2, 'Monday'), 2, 4), 240); // before the bench test set
  assert.equal(restSeconds(at(7, 'Monday'), 7, 1), 240); // bench attempts
  const d = newBlock(MAX, '2026-11-02', 'deload');
  assert.equal(restSeconds(d.log[7][0], 7, 1), 90); // bench deload
});

test('a good re-max single is the next max, unless it is an off day', () => {
  const b = cleanBlock({ first: 6, second: 4, finish: 'remax' });
  const mon = b.log[7][0];
  mon.reps = [1, 1, 0];
  const r = evaluateLift(b, 'bench', LB);
  assert.equal(r.basis, 'remax');
  assert.equal(r.suggested, setWeight(b, mon, 7, 1, LB));
  mon.weights = [225, 235, 300]; // 235 is more than 5% under the 266.9 the week 6 set (240 x 4) estimated
  const off = evaluateLift(b, 'bench', LB);
  assert.equal(off.basis, 'remax-off-day');
  assert.equal(off.suggested, 250); // halfway: 250.95
  mon.reps = [0, 0, 0];
  const missed = evaluateLift(b, 'bench', LB);
  assert.equal(missed.basis, 'remax-missed');
  assert.equal(missed.suggested, roundTo(missed.second.estimate * 0.95, 5));
});

test('without a re-max, the week 6 test set moves the second-wave max', () => {
  // Week 3 at 6 reps holds 405; week 6 at 345 x 8 estimates ~431, the top step.
  const up = evaluateLift(cleanBlock({ first: 6, second: 8 }), 'squat', LB);
  assert.equal(up.basis, 'test-raise');
  assert.equal(up.suggested, 415);
  assert.equal(evaluateLift(cleanBlock({ first: 6, second: 5 }), 'squat', LB).suggested, 405);
  const down = evaluateLift(cleanBlock({ first: 6, second: 2 }), 'squat', LB);
  assert.equal(down.basis, 'test-lower');
  assert.equal(down.suggested, 385);
  // Week 3 at 9 reps: 405 -> 415 for weeks 4-8; week 6 then holds 415.
  const both = evaluateLift(cleanBlock({ first: 9, second: 5 }), 'squat', LB);
  assert.equal(both.waveMax, 415);
  assert.equal(both.suggested, 415);
  // Heavy-day sets aren't test sets, so extra reps there change nothing.
  const heavy = cleanBlock({ first: 6, second: 5 });
  heavy.log[SECOND_TEST][dayIndex(heavy, 'Thursday', SECOND_TEST)].reps[2] = 5;
  assert.equal(evaluateLift(heavy, 'bench', LB).suggested, 285);
});

test('with no test at all, weeks 4-6 decide: clean adds a step, misses hold or lower', () => {
  const untested = () => {
    const b = cleanBlock({ first: 6, second: 5 });
    base(b, SECOND_TEST, 'deadlift').skipped = true;
    return b;
  };
  const clean = evaluateLift(untested(), 'deadlift', LB);
  assert.equal(clean.basis, 'clean');
  assert.equal(clean.suggested, 500);
  const one = untested();
  base(one, 4, 'deadlift').reps[0] = 1;
  assert.equal(evaluateLift(one, 'deadlift', LB).basis, 'hold');
  assert.equal(evaluateLift(one, 'deadlift', LB).suggested, 495);
  base(one, 3, 'deadlift').reps[2] = 2;
  assert.equal(evaluateLift(one, 'deadlift', LB).basis, 'missed');
  assert.equal(evaluateLift(one, 'deadlift', LB).suggested, 470); // 95%: 470.25
  // Skipped days are left out rather than counted as misses.
  const skipped = untested();
  base(skipped, 3, 'deadlift').skipped = true;
  const s = evaluateLift(skipped, 'deadlift', LB);
  assert.equal(s.skipped, 2);
  assert.equal(s.basis, 'clean');
  const nothing = evaluateLift(newBlock(MAX, '2026-11-02'), 'deadlift', LB);
  assert.equal(nothing.performed, 0);
  assert.equal(nothing.suggested, 495);
});

test('lift history adds up weekly volume and tested results', () => {
  const b = newBlock({ squat: 385, bench: 315, deadlift: 455 }, '2026-11-02');
  const mon = b.log[0][0];
  mon.reps = [6, 6, 7];
  mon.weight = 225;
  b.log[0][3].reps = [4, 4, null]; // Thursday: 77.5% of 315 = 245
  base(b, FIRST_TEST, 'bench').reps = [2, 2, 2, 2, 7]; // 260 x 7
  b.log[7][0].reps = [1, 1, 0];
  const weeks = liftHistory({ ...LB, blocks: [b] }, 'bench');
  assert.equal(weeks.length, 8);
  assert.equal(weeks[0].volume, 225 * 19 + 245 * 8);
  assert.equal(weeks[0].reps, 27);
  assert.deepEqual(weeks[2].tests, [{ value: estimateMax(260, 7), weight: 260, reps: 7, kind: 'estimate' }]);
  assert.equal(weeks[3].max, 317.5); // moved by the week 3 test set
  assert.equal(weeks[7].tests[0].kind, 'remax');
  assert.equal(weeks[7].tests[0].value, setWeight(b, b.log[7][0], 7, 1, LB));
  assert.equal(weeks[7].volume, setWeight(b, b.log[7][0], 7, 0, LB) + setWeight(b, b.log[7][0], 7, 1, LB));
});

test('unit conversion round-trips, attempt weights included, and resets rounding', () => {
  const b = cleanBlock({ finish: 'remax' });
  b.log[0][0].weight = 280;
  b.log[7][0].weights = [250, null, 300];
  const kg = convertState({ ...emptyState(), blocks: [b] }, 'kg');
  assert.equal(kg.round, 2.5);
  assert.equal(Math.round(kg.blocks[0].max.squat * 10) / 10, 183.7);
  assert.equal(Math.round(kg.blocks[0].log[0][0].weight * 10) / 10, 127);
  assert.equal(kg.blocks[0].log[7][0].weights[1], null);
  const back = convertState(kg, 'lb');
  for (const [id, v] of Object.entries(b.max)) assert.ok(Math.abs(back.blocks[0].max[id] - v) < 1e-9);
  assert.ok(Math.abs(back.blocks[0].log[7][0].weights[2] - 300) < 1e-9);
});

test('saved data validation accepts real data and rejects malformed data', () => {
  const good = { ...emptyState(), blocks: [cleanBlock(), cleanBlock({ finish: 'remax' })] };
  assert.equal(isValidState(good), true);
  assert.equal(isValidState(JSON.parse(JSON.stringify(good))), true);
  const copy = () => JSON.parse(JSON.stringify(good));
  const badReps = copy();
  badReps.blocks[0].log[0][0].reps = [6, 6];
  assert.equal(isValidState(badReps), false);
  const badDay = copy();
  badDay.blocks[0].log[0][0].day = '<img src=x>';
  assert.equal(isValidState(badDay), false);
  const badFinish = copy();
  badFinish.blocks[0].finish = 'remax';
  assert.equal(isValidState(badFinish), false);
  const badAttempt = copy();
  badAttempt.blocks[1].log[7][0].reps[0] = 2;
  assert.equal(isValidState(badAttempt), false);
  const noRest = copy();
  delete noRest.rest;
  assert.equal(isValidState(noRest), false);
  assert.equal(isValidState(null), false);
  assert.equal(WEEKS.length, 8);
});

test('a 3-week log from the last release carries into the 8-week block', () => {
  const sets = { base: [3, 4, 5], heavy: [3, 4, 3] };
  const days = [['Monday', 'bench', 'base'], ['Tuesday', 'squat', 'base'], ['Wednesday', 'deadlift', 'base'], ['Thursday', 'bench', 'heavy'], ['Friday', 'squat', 'heavy']];
  const log = [0, 1, 2].map((w) => days.map(([day, lift, kind]) => ({ day, lift, kind, reps: Array(sets[kind][w]).fill(null), weight: null, skipped: false })));
  log[0][0].reps = [6, 6, 7];
  log[0][0].weight = 225;
  const v2 = { v: 2, unit: 'lb', round: 5, trainingMax: false, blocks: [
    { started: '2026-11-02', finished: null, deload: false, lastTrained: '2026-11-02', breakSeen: null, max: { squat: 385, bench: 315, deadlift: 455 }, log },
  ] };
  const v3 = upgrade(JSON.parse(JSON.stringify(v2)));
  assert.equal(isValidState(v3), true);
  const b = v3.blocks[0];
  assert.equal(b.log.length, 8);
  assert.equal(b.finish, 'remax');
  assert.equal(b.lastTrained, '2026-11-02');
  assert.deepEqual(b.log[0][0].reps, [6, 6, 7]);
  assert.equal(b.log[0][0].weight, 225);
  assert.deepEqual(nextSession(b), { week: 0, index: 1 });
  assert.equal(v3.rest, 'sound');

  // A finished block with a deload keeps weeks 1-3 and counts the rest as skipped.
  const done = JSON.parse(JSON.stringify(v2));
  done.blocks[0].finished = '2026-11-23';
  done.blocks[0].deload = true;
  done.blocks[0].log.push(days.map(([day, lift, kind]) => ({ day, lift, kind, reps: [5, 5], weight: null, skipped: false })));
  const old = upgrade(done).blocks[0];
  assert.equal(sessionStatus(old.log[3][0]), 'skipped');
  assert.equal(sessionStatus(old.log[7][0]), 'skipped');
});

test('first-release data moves each lift onto its template day', () => {
  const v1Log = [3, 4, 5, 2].map((sets, w) => ({
    squat: { reps: Array(sets).fill(w === 0 ? 6 : null), weight: null },
    bench: { reps: Array(sets).fill(null), weight: w === 0 ? 200 : null },
    deadlift: { reps: Array(sets).fill(null), weight: null },
  }));
  const v1 = { v: 1, unit: 'lb', round: 5, blocks: [{ started: '2026-11-02', finished: null, max: MAX, log: v1Log }] };
  const v3 = upgrade(v1);
  assert.equal(isValidState(v3), true);
  const b = v3.blocks[0];
  assert.deepEqual(b.log[0][dayIndex(b, 'Tuesday')].reps, [6, 6, 6]);
  assert.equal(b.log[0][dayIndex(b, 'Monday')].weight, 200);
  // Heavy days in the week already under way count as skipped, so the log resumes where it was.
  assert.equal(sessionStatus(b.log[0][dayIndex(b, 'Thursday')]), 'skipped');
  assert.equal(sessionStatus(b.log[1][dayIndex(b, 'Thursday')]), 'todo');
  assert.deepEqual(nextSession(b), { week: 0, index: dayIndex(b, 'Monday') });
  assert.equal(upgrade({ nope: 1 }), null);
  assert.equal(upgrade(v3), v3);
});
