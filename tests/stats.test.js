import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, emptyState, LB_PER_KG } from '../logic.js';
import { newExercise, ensureEntry } from '../extras.js';
import {
  DOTS, dots, strength, gains, maxChecks, nextTest, testBands, consistency, totals, accessoryTrends, weekSummary, blockSummary, maxPath,
  STUCK_AFTER,
} from '../stats.js';

const MAX = { squat: 385, bench: 315, deadlift: 455 };

function setup() {
  const state = { ...emptyState(), blocks: [newBlock(MAX, '2026-11-02')] };
  return { state, b: state.blocks[0] };
}

const day = (b, week, name) => b.log[week].find((s) => s.day === name);

test('DOTS matches the published score and holds body weight to its range', () => {
  // 1,150 lb at 185 lb: 521.6 kg at 83.9 kg scores 350.0 for men.
  assert.ok(Math.abs(dots(521.6, 83.9, 'men') - 350.0) < 0.1);
  assert.equal(dots(500, 250, 'men'), dots(500, DOTS.men.range[1], 'men'));
  assert.equal(dots(300, 30, 'women'), dots(300, DOTS.women.range[0], 'women'));
  // Lighter at the same total scores higher.
  assert.ok(dots(500, 90, 'women') > dots(500, 100, 'women'));
});

test('strength is the records total against the latest body weight, scored once a formula is picked', () => {
  const { state } = setup();
  assert.deepEqual(strength(state).body, null);
  state.bodyweight = [{ date: '2026-10-20', weight: 245 }, { date: '2026-11-03', weight: 240 }];
  const s = strength(state);
  assert.equal(s.total, 1155);
  assert.equal(s.ratio, 1155 / 240);
  assert.deepEqual(s.lifts.map((l) => l.ratio), [385 / 240, 315 / 240, 455 / 240]);
  assert.equal(s.score, null);
  state.dots = 'men';
  const scored = strength(state);
  assert.equal(scored.score, dots(1155 / LB_PER_KG, 240 / LB_PER_KG, 'men'));
  assert.ok(scored.perTotal > 0 && scored.perBody > 0);
  state.dots = 'other';
  assert.equal(strength(state).score, null);
});

test('gains run from the first lift on record to today, with the last 12 months on their own', () => {
  const { state } = setup();
  state.blocks[0].maxDates = { deadlift: '2026-07-31' };
  state.pastMaxes = [
    { date: '2019-06-01', lift: 'deadlift', value: 315 }, { date: '2019-11-04', lift: 'deadlift', value: 405 },
    { date: '2025-01-24', lift: 'deadlift', value: 425 }, { date: '2024-05-01', lift: 'deadlift', value: 400 },
  ];
  const g = gains(state, 'deadlift', '2026-11-04');
  assert.deepEqual(g.steps.map((s) => s.value), [315, 405, 425, 455]); // 400 wasn't a record
  assert.deepEqual(g.best, { date: '2026-07-31', value: 455 });
  assert.equal(g.lastYear, 30);
  assert.ok(Math.abs(g.perYear - 140 / g.years) < 1e-9);
  assert.ok(g.years > 7.4 && g.years < 7.5);
  // With nothing older than a year there's no 12-month change, and too little history for a rate.
  const fresh = gains(state, 'bench', '2026-11-04');
  assert.equal(fresh.lastYear, null);
  assert.equal(fresh.perYear, null);
});

test('the next test set lists what each rep count does to the max', () => {
  const { state, b } = setup();
  const t = nextTest(state, 'squat');
  assert.equal(t.week, 2);
  assert.equal(t.weight, 320);
  assert.deepEqual(t.bands, [
    { from: 1, to: 4, change: 'lower', by: -20 },
    { from: 5, to: 6, change: 'hold', by: 0 },
    { from: 7, to: 7, change: 'raise', by: 5 },
    { from: 8, to: 8, change: 'raise', by: 7.5 },
    { from: 9, to: null, change: 'raise', by: 10 },
  ]);
  // Once week 3's is logged, the check has a result and the next test is week 6's.
  day(b, 2, 'Tuesday').reps = [2, 2, 2, 2, 7];
  const [check] = maxChecks(state, 'squat');
  assert.equal(check.week, 2);
  assert.equal(check.weight, 320);
  assert.equal(check.max, 385);
  assert.equal(check.change, 'raise');
  assert.equal(check.by, 5);
  assert.ok(check.ratio > 1 && check.ratio < 1.02);
  assert.equal(nextTest(state, 'squat').week, 5);
  // Week 6's runs a rep lower, at 85% of the max week 3 moved to.
  assert.deepEqual(testBands(b, 'squat', 5, state).bands.map((x) => [x.from, x.change]), [[1, 'lower'], [4, 'hold'], [6, 'raise'], [7, 'raise'], [8, 'raise']]);
  // A skipped test is passed over.
  day(b, 5, 'Tuesday').skipped = true;
  assert.equal(nextTest(state, 'squat'), null);
});

test('consistency grids the block, tallies weekdays and counts the days trained since the last skip', () => {
  const { state, b } = setup();
  day(b, 0, 'Monday').reps = [6, 6, 7];
  day(b, 0, 'Tuesday').skipped = true;
  day(b, 0, 'Wednesday').reps = [6, 6, 7];
  day(b, 0, 'Thursday').reps = [4, null, null]; // under way counts as trained
  const c = consistency(state);
  assert.deepEqual(c.grid.map((row) => row[0]), ['trained', 'skipped', 'trained', 'trained', 'next']);
  assert.equal(c.grid[4][1], 'todo');
  assert.equal(c.grid[0][1], 'todo');
  // The re-max week has no Thursday or Friday.
  assert.deepEqual(c.grid.map((row) => row[7] === null), [false, false, false, true, true]);
  assert.equal(c.trained, 3);
  assert.equal(c.skipped, 1);
  assert.equal(c.toGo, 38 - 4);
  assert.equal(c.run, 2);
  assert.equal(c.slips.day, 'Tuesday');
  assert.deepEqual(c.byDay[1], { day: 'Tuesday', trained: 0, skipped: 1 });
  day(b, 0, 'Tuesday').skipped = false;
  day(b, 0, 'Tuesday').reps = [6, 6, 6];
  assert.equal(consistency(state).slips, null);
  assert.equal(consistency(state).run, 4);
});

test('totals add the main work sets, accessories with plates on both sides, and timed days', () => {
  const { state, b } = setup();
  const press = newExercise({ name: 'Leg press', variants: [], sets: 2, low: 8, high: 12, step: 1, rest: 90, days: ['Tuesday'], counted: true });
  const dip = newExercise({ name: 'Dip', variants: [], sets: 2, low: 8, high: 12, step: 5, rest: 90, days: ['Tuesday'] });
  state.exercises.push(press, dip);
  const tue = day(b, 0, 'Tuesday');
  tue.reps = [6, 6, 7]; // 270 a set in week 1
  ensureEntry(tue, press, null).sets = [{ weight: 2.5, reps: 10 }, { weight: 2.5, reps: 8 }]; // 45 + 45 + 25 a side
  ensureEntry(tue, dip, null).sets = [{ weight: 0, reps: 12 }, null];
  Object.assign(tue, { started: '2026-11-03T17:00:00Z', ended: '2026-11-03T18:00:00Z' });
  day(b, 0, 'Monday').skipped = true;
  const { all, blocks } = totals(state);
  assert.deepEqual(blocks[0], { days: 1, sets: 6, reps: 49, volume: 270 * 19 + 230 * 18, ms: 3600000, timed: 1 });
  assert.equal(all.volume, 270 * 19 + 230 * 18);
  // Imported workouts count in all, not in a block.
  state.imported = [{ date: '2026-10-01', extras: [{ exercise: dip.id, variant: null, skipped: false, sets: [{ weight: 25, reps: 10 }] }] }];
  assert.equal(totals(state).all.days, 2);
  assert.equal(totals(state).all.volume, 270 * 19 + 230 * 18 + 250);
  assert.equal(totals(state).blocks[0].days, 1);
});

test('a week sums up each day against its plan, the accessories due and the new bests', () => {
  const { state, b } = setup();
  const curl = newExercise({ name: 'Leg curl', variants: [], sets: 2, low: 8, high: 12, step: 5, rest: 90, days: ['Tuesday', 'Friday'] });
  const calf = newExercise({ name: 'Calf raise', variants: [], sets: 2, low: 8, high: 12, step: 5, rest: 90, days: ['Tuesday'] });
  state.exercises.push(curl, calf);
  day(b, 0, 'Monday').reps = [6, 6, 7]; // 220
  day(b, 0, 'Wednesday').skipped = true;
  const tue = day(b, 0, 'Tuesday');
  Object.assign(tue, { reps: [6, 6, 5], date: '2026-11-03' }); // 270, a rep short on the last
  ensureEntry(tue, curl, null).sets = [{ weight: 190, reps: 10 }, { weight: 190, reps: 8 }];
  ensureEntry(tue, calf, null).skipped = true;
  const thu = day(b, 0, 'Thursday');
  Object.assign(thu, { reps: [4, 4, 5], feel: 'grind', date: '2026-11-05', started: '2026-11-05T17:00:00Z', ended: '2026-11-05T18:00:00Z' });
  const fri = day(b, 0, 'Friday');
  Object.assign(fri, { reps: [4, 4, 4], date: '2026-11-06' }); // 300
  ensureEntry(fri, curl, null).sets = [{ weight: 190, reps: 12 }, { weight: 190, reps: 8 }];
  const w = weekSummary(state, 0, 0);
  assert.deepEqual({ ...w, days: undefined }, {
    from: '2026-11-03', to: '2026-11-06', days: undefined, trained: 4, skipped: 1, bests: 1, extrasDone: 2, extrasDue: 3,
    sets: 16, volume: 220 * 19 + 270 * 17 + 245 * 13 + 300 * 12 + 190 * 38, ms: 3600000, timed: 1,
  });
  assert.deepEqual(w.days.map((d) => [d.day, d.top, d.over, d.short, d.feel]), [
    ['Monday', { weight: 220, reps: 7 }, 1, 0, null],
    ['Tuesday', { weight: 270, reps: 6 }, 0, 1, null],
    ['Wednesday', undefined, undefined, undefined, undefined],
    ['Thursday', { weight: 245, reps: 5 }, 1, 0, 'grind'],
    ['Friday', { weight: 300, reps: 4 }, 0, 0, null],
  ]);
  assert.equal(w.days[2].skipped, true);
});

test('a block adds up its weeks, and each max runs from the start through the test sets to the re-max', () => {
  const { state, b } = setup();
  Object.assign(day(b, 0, 'Monday'), { reps: [6, 6, 6], date: '2026-11-02' }); // 220
  day(b, 0, 'Tuesday').skipped = true;
  Object.assign(day(b, 2, 'Tuesday'), { reps: [2, 2, 2, 2, 7], date: '2026-11-17' }); // 320, 7 reps raises 5
  Object.assign(day(b, 5, 'Tuesday'), { reps: [2, 2, 2, 6], date: '2026-12-08' }); // 330
  Object.assign(day(b, 7, 'Tuesday'), { reps: [1, 1, 0], weights: [null, null, 420], date: '2026-12-22' });
  Object.assign(day(b, 7, 'Monday'), { reps: [1, null, null], date: '2026-12-21' }); // the second and third not judged
  const sum = blockSummary(state, 0);
  assert.deepEqual(sum.weeks.map((w) => w.volume), [3960, 0, 4800, 0, 0, 3960, 0, 355 + 375 + 285]);
  assert.deepEqual({ ...sum, weeks: undefined }, {
    from: '2026-11-02', to: '2026-12-22', weeks: undefined, sets: 16, volume: 13735, ms: 0, timed: 0, bests: 0, extrasDone: 0, extrasDue: 0,
  });
  const squat = maxPath(state, 0, 'squat');
  assert.deepEqual([squat.start, squat.wave], [385, 390]);
  assert.deepEqual(squat.tests.map((t) => [t.week, t.weight, t.reps]), [[2, 320, 7], [5, 330, 6]]);
  assert.deepEqual(squat.attempts, [{ attempt: 0, weight: 355, good: true }, { attempt: 1, weight: 375, good: true }, { attempt: 2, weight: 420, good: false }]);
  assert.deepEqual(maxPath(state, 0, 'bench'), { start: 315, wave: 315, tests: [], attempts: [{ attempt: 0, weight: 285, good: true }] });
  day(b, 7, 'Wednesday').skipped = true;
  assert.deepEqual(maxPath(state, 0, 'deadlift').attempts, []);
});

test('accessory trends measure the change since the first session and how long progress has stalled', () => {
  const { state, b } = setup();
  const row = newExercise({ name: 'Row', variants: ['Cable', 'Machine'], sets: 2, low: 8, high: 12, step: 5, rest: 90, days: ['Monday'] });
  const dip = newExercise({ name: 'Dip', variants: [], sets: 2, low: 8, high: 12, step: 5, rest: 90, days: ['Monday'] });
  state.exercises.push(row, dip);
  const log = (week, e, variant, sets) => { ensureEntry(day(b, week, 'Monday'), e, variant).sets = sets; };
  const two = (weight, a, c = a) => [{ weight, reps: a }, { weight, reps: c }];
  log(0, row, 'Cable', two(100, 10));
  log(1, row, 'Cable', two(100, 10));
  log(2, row, 'Cable', two(100, 10, 9)); // fewer reps isn't progress either
  log(3, row, 'Machine', two(150, 8));
  log(4, row, 'Machine', two(155, 8));
  log(6, row, 'Machine', two(155, 8)); // a light week is left out
  log(0, dip, null, two(0, 10));
  log(1, dip, null, two(0, 12));
  const [cable, machine, bw] = accessoryTrends(state);
  assert.equal(cable.variant, 'Cable');
  assert.equal(cable.flat, STUCK_AFTER);
  assert.equal(cable.change, 0); // the best set held
  assert.equal(machine.sessions, 2);
  assert.equal(machine.flat, 1);
  assert.ok(Math.abs(machine.change - (155 / 150 - 1)) < 1e-5);
  assert.equal(bw.first.kind, 'reps');
  assert.ok(Math.abs(bw.change - 0.2) < 1e-9);
  // Done once, an exercise has no trend yet.
  state.exercises.push(newExercise({ name: 'Curl', variants: [], sets: 2, low: 8, high: 12, step: 5, rest: 60, days: ['Monday'] }));
  log(0, state.exercises[2], null, two(30, 10));
  assert.equal(accessoryTrends(state).length, 3);
  // A block's own trends count only its sessions.
  state.blocks.push(newBlock(MAX, '2026-12-28'));
  ensureEntry(day(state.blocks[1], 0, 'Monday'), dip, null).sets = two(0, 12);
  ensureEntry(day(state.blocks[1], 1, 'Monday'), dip, null).sets = two(0, 15);
  assert.equal(accessoryTrends(state).find((t) => t.exercise === dip).sessions, 4);
  assert.equal(accessoryTrends(state, 0).find((t) => t.exercise === dip).sessions, 2);
  const [fresh, ...none] = accessoryTrends(state, 1);
  assert.deepEqual([fresh.exercise, fresh.sessions, fresh.change, none], [dip, 2, 0.25, []]);
});
