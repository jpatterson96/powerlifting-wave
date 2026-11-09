import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, emptyState, convertState, upgrade, isValidState, estimateMax } from '../logic.js';
import {
  newExercise, dayExtras, dayGroups, setLink, supersetOrder, ensureEntry, entryOf, exerciseHistory, lastTime, earlierTimes,
  defaultVariant, suggestion, sessionBest, records, logBodyweight, cleanExtras, finishExtras, plannedSets, isNewBest, muscleSets,
  isCounted, countedPlates, weightOf, loadOf, looksCounted, countInPlates, workoutTime, timedSessions, partTimes, exercisesByDay, moveExercise,
  learnOrder, muscleOutlook, skipConcern, skipStreak, dropOffers,
} from '../extras.js';

const MAX = { squat: 385, bench: 315, deadlift: 455 };

function setup() {
  const state = { ...emptyState(), blocks: [newBlock(MAX, '2026-11-02')] };
  const press = newExercise({ name: 'Shoulder press', variants: ['Dumbbell', 'Machine'], sets: 3, low: 8, high: 12, step: 5, rest: 90, days: ['Monday', 'Thursday'] });
  const row = newExercise({ name: 'Row', variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days: ['Monday'] });
  const curl = newExercise({ name: 'Curl', variants: [], sets: 2, low: 10, high: 15, step: 5, rest: 60, days: [] });
  state.exercises.push(press, row, curl);
  return { state, press, row, curl, b: state.blocks[0] };
}

test('each day lists its accessories, then anything added to that day only', () => {
  const { state, press, row, curl, b } = setup();
  const mon = b.log[0][0];
  assert.deepEqual(dayExtras(state, mon), [press, row]);
  assert.deepEqual(dayExtras(state, b.log[0][3]), [press]); // Thursday
  assert.deepEqual(dayExtras(state, b.log[0][1]), []); // Tuesday
  ensureEntry(mon, curl, null);
  assert.deepEqual(dayExtras(state, mon), [press, row, curl]);
  assert.deepEqual(entryOf(mon, curl.id).sets, [null, null]);
});

test('supersets pair two exercises, in order, wherever they sit in the list', () => {
  const { state, press, row, curl, b } = setup();
  const mon = b.log[0][0];
  curl.days = ['Monday'];
  assert.deepEqual(dayGroups(state, mon).map((g) => g.map((e) => e.name)), [['Shoulder press'], ['Row'], ['Curl']]);
  setLink(state, curl, press); // curl first, though it's last in the list
  assert.deepEqual(dayGroups(state, mon).map((g) => g.map((e) => e.name)), [['Curl', 'Shoulder press'], ['Row']]);
  setLink(state, row, press); // press can only be in one superset
  assert.equal(curl.link, null);
  assert.equal(row.link, press.id);
  setLink(state, row, null);
  assert.equal(row.link, null);
  // On a day without its partner, an exercise shows on its own.
  setLink(state, press, row);
  assert.deepEqual(dayGroups(state, b.log[0][3]).map((g) => g.length), [1]);
  assert.deepEqual(supersetOrder([3, 2]), [
    { which: 0, set: 0 }, { which: 1, set: 0 }, { which: 0, set: 1 }, { which: 1, set: 1 }, { which: 0, set: 2 },
  ]);
  assert.deepEqual(supersetOrder([0, 2]), [{ which: 1, set: 0 }, { which: 1, set: 1 }]);
});

test('finishing a day skips what was not started and ends the rest at the sets logged', () => {
  const { state, press, row, curl, b } = setup();
  const mon = b.log[0][0];
  ensureEntry(mon, press, 'Machine').sets = [{ weight: 50, reps: 10 }, null, { weight: 50, reps: 9 }];
  ensureEntry(mon, curl, null).sets = [{ weight: 30, reps: 12 }, { weight: 30, reps: 12 }];
  assert.equal(finishExtras(state, mon), 2);
  assert.deepEqual(entryOf(mon, press.id).sets, [{ weight: 50, reps: 10 }, { weight: 50, reps: 9 }]);
  assert.equal(entryOf(mon, press.id).variant, 'Machine');
  assert.equal(entryOf(mon, row.id).skipped, true);
  assert.equal(entryOf(mon, curl.id).sets.length, 2);
  // Already finished: nothing more to do, and a skip can still be undone by hand.
  assert.equal(finishExtras(state, mon), 0);
});

test('last time is per variant and only looks at earlier days', () => {
  const { state, press, b } = setup();
  const w1 = ensureEntry(b.log[0][0], press, 'Dumbbell');
  w1.sets = [{ weight: 50, reps: 12 }, { weight: 50, reps: 11 }, { weight: 50, reps: 10 }];
  const machine = ensureEntry(b.log[0][3], press, 'Machine');
  machine.sets = [{ weight: 120, reps: 10 }, null, null];
  assert.equal(lastTime(state, press.id, 'Dumbbell', [0, 1, 0]).sets.length, 3);
  assert.equal(lastTime(state, press.id, 'Machine', [0, 1, 0]).sets[0].weight, 120);
  assert.equal(lastTime(state, press.id, 'Dumbbell', [0, 0, 0]), null); // nothing before week 1 Monday
  assert.equal(earlierTimes(state, press.id, 'Machine', [0, 1, 0]).length, 1);
  assert.equal(defaultVariant(state, press), 'Machine'); // the variant used most recently
  assert.equal(exerciseHistory(state, press.id).length, 2);
});

test('double progression adds a rep a set, then weight once every set tops out', () => {
  const ex = { sets: 3, low: 8, high: 12, step: 5 };
  assert.deepEqual(suggestion(ex, null), { weights: [null, null, null], reps: [8, 8, 8], change: null });
  const mid = suggestion(ex, { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 11 }, { weight: 50, reps: 7 }] });
  assert.deepEqual(mid, { weights: [50, 50, 50], reps: [12, 12, 8], change: null });
  const top = suggestion(ex, { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }, { weight: 50, reps: 13 }] });
  assert.deepEqual(top, { weights: [55, 55, 55], reps: [8, 8, 8], change: 'up' });
  // Two sets logged of three: not every set reached the top, so the weight holds.
  assert.equal(suggestion(ex, { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }] }).change, null);
});

test('body-weight work climbs to the top of the range, then takes its first weight', () => {
  const ex = { sets: 3, low: 8, high: 12, step: 5 };
  const bw = (...reps) => ({ sets: reps.map((r) => ({ weight: 0, reps: r })) });
  assert.deepEqual(suggestion(ex, bw(15, 4, 7)), { weights: [0, 0, 0], reps: [12, 8, 8], change: null });
  // A 5 lb jump would read as plates a side, so it's the smallest plate over 10 lb there is.
  assert.deepEqual(suggestion(ex, bw(12, 12, 13), 0, 'lb', { sizes: [45, 25, 10, 5, 2.5] }), { weights: [25, 25, 25], reps: [8, 8, 8], change: 'add' });
  assert.equal(suggestion(ex, bw(12, 12, 12), 0, 'lb', { sizes: [45, 10, 5] }).weights[0], 45);
  assert.equal(suggestion({ ...ex, step: 15 }, bw(12, 12, 12)).weights[0], 15);
  assert.equal(suggestion({ ...ex, step: 2.5 }, bw(12, 12, 12), 0, 'kg').weights[0], 2.5);
  // Not with a set short of the top, or in a lighter week.
  assert.equal(suggestion(ex, bw(12, 12, 11)).change, null);
  assert.equal(suggestion(ex, bw(12, 12, 12), 6).change, null);
});

test('two sessions in a row at one weight averaging under the range take it down about 10%', () => {
  const ex = { sets: 3, low: 8, high: 12, step: 5 };
  const short = { sets: [{ weight: 190, reps: 10 }, { weight: 190, reps: 7 }, { weight: 190, reps: 6 }] };
  // Short once: the weight holds and asks for the bottom of the range.
  assert.deepEqual(suggestion(ex, short), { weights: [190, 190, 190], reps: [11, 8, 8], change: null });
  // Twice: 10% of 190 in 5 lb jumps is 20, from the bottom of the range.
  assert.deepEqual(suggestion(ex, short, 0, 'lb', { prior: short }), { weights: [170, 170, 170], reps: [8, 8, 8], change: 'down' });
  // Not when the time before was at another weight, nor in a lighter week, nor when the average reaches the bottom.
  assert.equal(suggestion(ex, short, 0, 'lb', { prior: { sets: [{ weight: 200, reps: 6 }] } }).change, null);
  assert.equal(suggestion(ex, short, 6, 'lb', { prior: short }).change, null);
  const level = { sets: [{ weight: 190, reps: 10 }, { weight: 190, reps: 8 }, { weight: 190, reps: 6 }] };
  assert.equal(suggestion(ex, level, 0, 'lb', { prior: short }).change, null);
  // Each set comes down the same, so a drop set keeps its steps.
  const drops = { sets: [{ weight: 97.5, reps: 6 }, { weight: 87.5, reps: 6 }, { weight: 77.5, reps: 6 }] };
  assert.deepEqual(suggestion(ex, drops, 0, 'lb', { prior: drops }).weights, [87.5, 77.5, 67.5]);
  // At least one jump, but never to 10 lb or less, which reads as plates a side.
  const small = { sets: Array(3).fill({ weight: 20, reps: 5 }) };
  assert.deepEqual(suggestion(ex, small, 0, 'lb', { prior: small }).weights, [15, 15, 15]);
  const smaller = { sets: Array(3).fill({ weight: 15, reps: 5 }) };
  assert.deepEqual(suggestion(ex, smaller, 0, 'lb', { prior: smaller }), { weights: [15, 15, 15], reps: [8, 8, 8], change: null });
  // Plates a side come down in the exercise's jump: 3.5 (45 + 45 + 45 + 25) to 3, but one plate can't go to none.
  const sled = { counted: true, sets: 3, low: 6, high: 10, step: 0.5 };
  const heavy = { sets: Array(3).fill({ weight: 3.5, reps: 4 }) };
  assert.deepEqual(suggestion(sled, heavy, 0, 'lb', { prior: heavy }).weights, [3, 3, 3]);
  const one = { sets: Array(3).fill({ weight: 1, reps: 4 }) };
  assert.equal(suggestion({ ...sled, step: 1 }, one, 0, 'lb', { prior: one }).change, null);
});

test('weeks 7 and 8 halve the sets and repeat last time, and progression skips over them', () => {
  const ex = { sets: 3, low: 8, high: 12, step: 5 };
  assert.deepEqual([0, 5, 6, 7].map((w) => plannedSets(ex, w)), [3, 3, 2, 2]);
  assert.equal(plannedSets({ ...ex, sets: 1 }, 6), 1);
  const topped = { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }, { weight: 50, reps: 12 }] };
  assert.deepEqual(suggestion(ex, topped, 6), { weights: [50, 50], reps: [12, 12], change: null });
  assert.deepEqual(suggestion(ex, { sets: [{ weight: 50, reps: 9 }, { weight: 50, reps: 8 }] }, 7).reps, [9, 8]);
  const { state, press, b } = setup();
  ensureEntry(b.log[5][0], press, 'Dumbbell').sets = [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }, { weight: 50, reps: 11 }];
  ensureEntry(b.log[6][0], press, 'Dumbbell', 2).sets = [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }];
  const next = [1, 0, 0]; // block 2, week 1
  state.blocks.push(newBlock(MAX, '2026-12-28'));
  assert.equal(lastTime(state, press.id, 'Dumbbell', next).sets.length, 2); // what was done last
  assert.equal(lastTime(state, press.id, 'Dumbbell', next, true).sets.length, 3); // what to progress from
});

test('a new best beats every earlier session of the variant; a first time is not one', () => {
  const { state, press, b } = setup();
  const sets = [{ weight: 50, reps: 10 }];
  assert.equal(isNewBest(state, press.id, 'Dumbbell', [0, 0, 0], sets), false);
  ensureEntry(b.log[0][0], press, 'Dumbbell').sets = [{ weight: 50, reps: 10 }, null, null];
  assert.equal(isNewBest(state, press.id, 'Dumbbell', [0, 1, 0], [{ weight: 50, reps: 10 }]), false); // a tie
  assert.equal(isNewBest(state, press.id, 'Dumbbell', [0, 1, 0], [{ weight: 55, reps: 9 }]), true);
  assert.equal(isNewBest(state, press.id, 'Machine', [0, 1, 0], [{ weight: 99, reps: 9 }]), false); // other variant
});

test('weekly sets count the main lift and accessories by muscle, leaving out skips', () => {
  const { state, press, row, b } = setup();
  press.muscle = 'Shoulders';
  const mon = b.log[0][0];
  mon.reps = [6, 6, null];
  ensureEntry(mon, press, 'Dumbbell').sets = [{ weight: 50, reps: 10 }, { weight: 50, reps: 9 }, null];
  ensureEntry(mon, row, null).skipped = true;
  const tue = b.log[0][1];
  tue.skipped = true;
  tue.reps = [5, 5, 5];
  const counts = muscleSets(state, b.log[0]);
  assert.deepEqual(Object.fromEntries(counts), { Chest: 2, Shoulders: 2 });
  ensureEntry(b.log[0][3], row, null).sets = [{ weight: 100, reps: 8 }];
  assert.equal(muscleSets(state, b.log[0]).get(null), 1); // no muscle set
});

// Bench days with plenty of chest and one row, squat days with one glute exercise and two for hamstrings.
function skipSetup() {
  const state = { ...emptyState(), blocks: [newBlock(MAX, '2026-11-02')] };
  const make = (name, muscle, days) => newExercise({ name, muscle, variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days });
  const ex = {
    press: make('Incline press', 'Chest', ['Monday', 'Thursday']),
    fly: make('Fly', 'Chest', ['Monday', 'Thursday']),
    row: make('Row', 'Back', ['Monday', 'Thursday']),
    thrust: make('Hip thrust', 'Glutes', ['Tuesday', 'Friday']),
    lying: make('Lying leg curl', 'Hamstrings', ['Tuesday', 'Friday']),
    seated: make('Seated leg curl', 'Hamstrings', ['Tuesday', 'Friday']),
  };
  state.exercises.push(...Object.values(ex));
  return { state, ...ex, b: state.blocks[0] };
}
const three = [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 10 }];

test('a skip warns when it leaves its muscle under 10 sets for the week, or under the plan when that is less', () => {
  const { state, fly, row, thrust, lying, seated, b } = skipSetup();
  const [mon, tue, , , fri] = b.log[0];
  // Chest has the bench and two exercises twice a week, so the fly can go.
  assert.equal(skipConcern(state, [0, 0, 0], fly), null);
  assert.deepEqual(Object.fromEntries(muscleOutlook(state, b.log[0], 0, 0)), {
    Chest: { sets: 18, target: 10 }, Back: { sets: 9, target: 9 }, Quads: { sets: 6, target: 6 },
    Glutes: { sets: 6, target: 6 }, Hamstrings: { sets: 12, target: 10 },
  });
  // The row is most of the back's week: the plan's 9 sets is the target, as it's under 10.
  assert.deepEqual(skipConcern(state, [0, 0, 0], row), { muscle: 'Back', sets: 6, target: 9, done: 0, others: [], streak: 0, lastWeek: null });
  // Hamstrings fall under 10 without the lying curl; the seated one is still to come today.
  assert.deepEqual(skipConcern(state, [0, 0, 1], lying), { muscle: 'Hamstrings', sets: 9, target: 10, done: 0, others: [seated], streak: 0, lastWeek: null });
  assert.equal(skipConcern(state, [0, 0, 1], thrust).sets, 3);

  // Tuesday: hip thrust and lying curl skipped, seated curl done. On Friday the hip thrust is the only glute work.
  ensureEntry(tue, thrust, null).skipped = true;
  ensureEntry(tue, lying, null).skipped = true;
  ensureEntry(tue, seated, null).sets = three;
  assert.deepEqual(skipConcern(state, [0, 0, 4], thrust), { muscle: 'Glutes', sets: 0, target: 6, done: 0, others: [], streak: 1, lastWeek: null });
  ensureEntry(fri, seated, null).sets = three;
  assert.deepEqual(skipConcern(state, [0, 0, 4], lying), { muscle: 'Hamstrings', sets: 6, target: 10, done: 6, others: [], streak: 1, lastWeek: null });

  // Days before `from` are over, so what they didn't log doesn't count; looking ahead from an earlier due day, it does.
  ensureEntry(mon, row, null).skipped = true;
  assert.equal(skipConcern(state, [0, 0, 3], row, 2).sets, 3); // Thursday seen on Wednesday: the deadlift's to come
  assert.equal(skipConcern(state, [0, 0, 3], row).sets, 0);
  mon.ended = '2026-11-02T18:00:00Z';
  assert.equal(muscleOutlook(state, b.log[0], 0, 0).get('Chest').sets, 9); // an ended day has nothing to come

  // Weeks 7 and 8 are light on purpose.
  assert.equal(skipConcern(state, [0, 6, 1], thrust), null);
});

test('a skip says how many times running it was skipped and whether its muscle was short last week too', () => {
  const { state, fly, row, thrust, b } = skipSetup();
  for (const s of [b.log[0][1], b.log[0][4]]) ensureEntry(s, thrust, null).skipped = true;
  const c = skipConcern(state, [0, 1, 1], thrust);
  assert.equal(c.streak, 2);
  assert.equal(c.lastWeek, 0);
  // A day skipped whole doesn't break the run or add to it; a day it was done ends it.
  b.log[1][1].skipped = true;
  assert.equal(skipStreak(state, thrust.id, [0, 1, 4]), 2);
  ensureEntry(b.log[1][4], thrust, null).sets = three;
  assert.equal(skipStreak(state, thrust.id, [0, 2, 1]), 0);

  // Skipped a third time running with chest still on target, the fly is offered off bench days; the row isn't,
  // as the back's week is short without it.
  for (const s of [b.log[0][0], b.log[0][3], b.log[1][0]]) {
    ensureEntry(s, fly, null).skipped = true;
    ensureEntry(s, row, null).skipped = true;
  }
  assert.deepEqual(dropOffers(state, [0, 1, 0]), [{ exercise: fly, times: 3 }]);
  assert.deepEqual(dropOffers(state, [0, 0, 3]), []); // only twice so far
});

test('records find the heaviest set, best estimate and biggest session', () => {
  const history = [
    { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }] },
    { sets: [{ weight: 55, reps: 8 }, { weight: 55, reps: 6 }] },
  ];
  const r = records(history);
  assert.deepEqual(r.heaviest, { weight: 55, reps: 8 });
  assert.equal(r.best.value, estimateMax(50, 12));
  assert.equal(r.volume, 1200);
  assert.deepEqual(sessionBest([{ weight: 0, reps: 10 }, { weight: 0, reps: 12 }]), { value: 12, kind: 'reps' });
});

test('body weight keeps one entry a day, in date order', () => {
  const state = emptyState();
  logBodyweight(state, '2026-11-03', 200);
  logBodyweight(state, '2026-11-02', 201);
  logBodyweight(state, '2026-11-03', 199.5);
  assert.deepEqual(state.bodyweight, [{ date: '2026-11-02', weight: 201 }, { date: '2026-11-03', weight: 199.5 }]);
});

test('accessory weights convert with the units and survive a round trip', () => {
  const { state, press, b } = setup();
  ensureEntry(b.log[0][0], press, 'Dumbbell').sets = [{ weight: 50, reps: 12 }, null, null];
  logBodyweight(state, '2026-11-02', 200);
  const kg = convertState(state, 'kg');
  assert.ok(Math.abs(kg.blocks[0].log[0][0].extras[0].sets[0].weight - 22.68) < 0.01);
  assert.ok(Math.abs(kg.exercises[0].step - 2.268) < 0.01);
  const back = convertState(kg, 'lb');
  assert.ok(Math.abs(back.blocks[0].log[0][0].extras[0].sets[0].weight - 50) < 1e-9);
  assert.ok(Math.abs(back.bodyweight[0].weight - 200) < 1e-9);
  assert.equal(back.blocks[0].log[0][0].extras[0].sets[1], null);
});

test('bad accessory data is dropped without losing the log', () => {
  const { state, press, b } = setup();
  ensureEntry(b.log[0][0], press, 'Dumbbell').sets = [{ weight: 50, reps: 12 }, null, null];
  const saved = JSON.parse(JSON.stringify(state));
  saved.exercises.push({ id: 'BAD id', name: '<b>' });
  saved.exercises.push({ ...saved.exercises[0], id: 'selfie', link: 'selfie' }); // can't superset with itself
  saved.exercises[1].muscle = 'Lats'; // not a choice: dropped, the exercise kept
  saved.exercises[1].plates = 'toString';
  saved.exercises[2].plates = 'ez';
  saved.blocks[0].log[0][0].extras.push({ exercise: 'x', variant: null, skipped: 'no', sets: [] });
  saved.blocks[0].log[0][1].extras = 'nope';
  saved.blocks[0].log[0][0].date = 'yesterday';
  saved.bodyweight = [{ date: '2026-11-02', weight: -1 }, { date: '2026-11-02', weight: 200 }];
  saved.pastMaxes = [{ date: '2025-06-01', lift: 'squat', value: 365 }, { date: '2025-06-01', lift: 'curl', value: 99 }, { date: 'June', lift: 'bench', value: 300 }];
  saved.blocks[0].maxDates = { squat: '2026-08-15', bench: 'last week' };
  const clean = cleanExtras(upgrade(saved));
  assert.deepEqual(clean.pastMaxes, [{ date: '2025-06-01', lift: 'squat', value: 365 }]);
  assert.deepEqual(clean.blocks[0].maxDates, { squat: '2026-08-15' });
  assert.equal('muscle' in clean.exercises[1] || 'plates' in clean.exercises[1], false);
  assert.equal(clean.exercises[2].plates, 'ez');
  assert.equal(isValidState(clean), true);
  assert.equal(clean.exercises.length, 3);
  assert.equal(clean.blocks[0].log[0][0].extras.length, 1);
  assert.deepEqual(clean.blocks[0].log[0][1].extras, []);
  assert.equal(clean.blocks[0].log[0][0].date, undefined);
  assert.equal(clean.bodyweight.length, 1);
  // A log saved before accessories existed gets the empty lists.
  const old = JSON.parse(JSON.stringify({ ...state, exercises: undefined, bodyweight: undefined }));
  const filled = cleanExtras(upgrade(old));
  assert.deepEqual(filled.exercises, []);
  assert.deepEqual(filled.bodyweight, []);
});

test('an exercise counted in plates a side logs plates, makes weight for volume, and keeps its count across units', () => {
  const { state, press, b } = setup();
  press.counted = true;
  press.step = 1;
  assert.equal(isCounted(press), true);
  assert.equal(loadOf(press, 6, 'lb'), 540);
  assert.equal(loadOf(press, 1, 'kg'), 40);
  assert.equal(loadOf({ plates: 'machine' }, 6, 'lb'), 6);
  ensureEntry(b.log[0][0], press, 'Dumbbell').sets = [{ weight: 6, reps: 10 }, null, null];
  const kg = convertState(state, 'kg');
  assert.equal(kg.blocks[0].log[0][0].extras[0].sets[0].weight, 6);
  assert.equal(kg.exercises[0].step, 1);
  assert.ok(Math.abs(kg.exercises[1].step - 2.268) < 0.01); // the others still convert
  assert.deepEqual(suggestion(press, { sets: Array(3).fill({ weight: 6, reps: 12 }) }).weights, [7, 7, 7]);
  const saved = JSON.parse(JSON.stringify(state));
  saved.exercises[1].counted = 'yes';
  const clean = cleanExtras(saved);
  assert.equal(clean.exercises[0].counted, true);
  assert.equal('counted' in clean.exercises[1], false);
});

test('plates a side are typed to a tenth: whole 45s, then .5 for a 25 and .1 for each 10', () => {
  assert.deepEqual(countedPlates(2.5, 'lb'), [45, 45, 25]);
  assert.deepEqual(countedPlates(2.1, 'lb'), [45, 45, 10]);
  assert.deepEqual(countedPlates(2.2, 'lb'), [45, 45, 10, 10]);
  assert.deepEqual(countedPlates(2.7, 'lb'), [45, 45, 25, 10, 10]);
  assert.deepEqual(countedPlates(0.5, 'lb'), [25]);
  assert.deepEqual(countedPlates(3, 'lb'), [45, 45, 45]);
  assert.deepEqual(countedPlates(2.5, 'kg'), [20, 20, 10]);
  assert.deepEqual(countedPlates(0, 'lb'), []);
  const row = { counted: true, step: 0.5, sets: 3, low: 6, high: 10 };
  assert.equal(weightOf(row, 3.5, 'lb'), 160);
  assert.equal(loadOf(row, 2.5, 'lb'), 230);
  assert.equal(weightOf({}, 2.5, 'lb'), 2.5);
  // 2.3 (45 + 45 + 30) is heavier than 2.5 (45 + 45 + 25), so estimates and records go by weight.
  const sets = [{ weight: 2.5, reps: 8 }, { weight: 2.3, reps: 8 }];
  assert.equal(sessionBest(sets, row, 'lb').value, estimateMax(120, 8));
  const r = records([{ sets }], row, 'lb');
  assert.equal(r.heaviest.weight, 2.3);
  assert.equal(r.volume, 8 * 230 + 8 * 240);
  assert.deepEqual(suggestion(row, { sets: [{ weight: 2.5, reps: 10 }, { weight: 2.3, reps: 10 }, { weight: 2.3, reps: 10 }] }).weights, [2.8, 2.8, 2.8]);
});

test('anything from just over 0 to 10 lb reads as plates a side; 0 is body weight', () => {
  const { state, row } = setup();
  assert.equal(looksCounted(state, row, 2.5), true);
  assert.equal(looksCounted(state, row, 3), true);
  assert.equal(looksCounted(state, row, 10), true);
  assert.equal(looksCounted(state, row, 0.5), true);
  assert.equal(looksCounted(state, row, 10.5), false);
  assert.equal(looksCounted(state, row, 17.5), false); // a dumbbell
  assert.equal(looksCounted(state, row, 0), false);
  assert.equal(looksCounted(state, row, null), false);
  assert.equal(looksCounted({ ...state, unit: 'kg' }, row, 2.5), false);
  countInPlates(row);
  assert.deepEqual([row.counted, row.plates, row.step], [true, null, 0.5]);
  assert.equal(looksCounted(state, row, 2.5), false); // already counted
});

test('a timed day runs from start to end, each set counted toward the exercise it ended', () => {
  const { state, press, row, b } = setup();
  const mon = b.log[0][0];
  const t = (min) => new Date(Date.UTC(2026, 10, 2, 17, min)).toISOString();
  mon.started = t(0);
  mon.reps = [6, 6, 7];
  mon.times = [t(15), t(18), t(21)];
  ensureEntry(mon, press, 'Dumbbell').sets = [{ weight: 50, reps: 10, at: t(25) }, { weight: 50, reps: 10, at: t(28) }, { weight: 50, reps: 10 }];
  ensureEntry(mon, row, null).sets = [{ weight: 100, reps: 8, at: t(31) }, null, null];
  mon.ended = t(35);
  const time = workoutTime(mon);
  assert.equal(time.total, 35 * 60000);
  assert.equal(time.ended, true);
  assert.deepEqual(time.parts.map((p) => [p.part, p.ms / 60000, p.sets]), [['lift', 21, 3], [press.id, 7, 2], [row.id, 3, 1]]);
  // Not ended, it runs to the last set; not started, the first set has nothing before it and isn't counted.
  delete mon.ended;
  assert.equal(workoutTime(mon).total, 31 * 60000);
  assert.equal(workoutTime(mon).end, t(31));
  delete mon.started;
  assert.equal(workoutTime(mon).total, 16 * 60000);
  assert.deepEqual(workoutTime(mon).parts.map((p) => [p.part, p.ms / 60000, p.sets]), [['lift', 6, 2], [press.id, 7, 2], [row.id, 3, 1]]);
  // A set logged after the end isn't part of the workout.
  mon.started = t(0);
  mon.ended = t(30);
  assert.deepEqual(workoutTime(mon).parts.map((p) => p.part), ['lift', press.id]);
  assert.equal(workoutTime(b.log[0][1]), null);
  assert.equal(timedSessions(state).length, 1);
  // Each exercise's time adds up across the days timed, the lift by name.
  const thu = b.log[0][3];
  thu.started = t(0);
  ensureEntry(thu, press, 'Dumbbell').sets = [{ weight: 50, reps: 10, at: t(4) }, null, null];
  const parts = partTimes(state);
  assert.deepEqual(parts.get('lift:squat'), undefined);
  assert.deepEqual(parts.get(`lift:${mon.lift}`), { ms: 21 * 60000, sets: 3, days: 1 });
  assert.deepEqual(parts.get(press.id), { ms: 11 * 60000, sets: 3, days: 2 });
});

test('workout times that do not read as times are dropped, keeping the sets', () => {
  const { state, press, b } = setup();
  const mon = b.log[0][0];
  mon.started = 'noon';
  mon.ended = '2026-11-02T18:30:00.000Z';
  mon.reps = [6, null, null];
  mon.times = ['2026-11-02T17:30:00.000Z', null]; // one slot short
  ensureEntry(mon, press, 'Dumbbell').sets = [{ weight: 50, reps: 12, at: 'later' }, { weight: 50, reps: 12, at: '2026-11-02T17:40:00.000Z' }, null];
  const s = cleanExtras(upgrade(JSON.parse(JSON.stringify(state)))).blocks[0].log[0][0];
  assert.equal(s.started, undefined);
  assert.equal(s.ended, '2026-11-02T18:30:00.000Z');
  assert.equal(s.times, undefined);
  assert.deepEqual(s.extras[0].sets[0], { weight: 50, reps: 12 });
  assert.equal(s.extras[0].sets[1].at, '2026-11-02T17:40:00.000Z');
});

test('settings split the exercises by kind of day, and a move steps over the next of the same days', () => {
  const { state, press, row, curl } = setup();
  const legs = newExercise({ name: 'Leg press', variants: [], sets: 3, low: 8, high: 12, step: 1, rest: 90, days: ['Tuesday', 'Friday'] });
  const fly = newExercise({ name: 'Fly', variants: [], sets: 3, low: 10, high: 15, step: 5, rest: 60, days: ['Thursday', 'Wednesday'] });
  state.exercises.push(legs, fly);
  const names = (kinds) => kinds.map((k) => [k.lift, k.days, k.exercises.map((e) => e.name)]);
  assert.deepEqual(names(exercisesByDay(state)), [
    ['bench', ['Monday', 'Thursday'], ['Shoulder press', 'Row', 'Fly']],
    ['squat', ['Tuesday', 'Friday'], ['Leg press']],
    ['deadlift', ['Wednesday'], ['Fly']],
    [null, [], ['Curl']],
  ]);
  // Down from the row steps over the fly, the next bench-day exercise, not the curl next in the list.
  const bench = () => exercisesByDay(state)[0].exercises;
  assert.equal(moveExercise(state, row, 1, bench()), true);
  assert.deepEqual(state.exercises.map((e) => e.name), ['Shoulder press', 'Curl', 'Leg press', 'Fly', 'Row']);
  assert.deepEqual(bench().map((e) => e.name), ['Shoulder press', 'Fly', 'Row']);
  assert.equal(moveExercise(state, row, 1, bench()), false);
  assert.equal(moveExercise(state, press, -1, bench()), false);
  assert.equal(moveExercise(state, fly, -1, bench()), true);
  assert.deepEqual(state.exercises.map((e) => e.name), ['Fly', 'Shoulder press', 'Curl', 'Leg press', 'Row']);
  // Without an exercise lacking days there's no fourth group, and the list as a whole can be moved in too.
  state.exercises = state.exercises.filter((e) => e !== curl);
  assert.equal(exercisesByDay(state).length, 3);
  assert.equal(moveExercise(state, legs, -1), true);
  assert.deepEqual(state.exercises.map((e) => e.name), ['Fly', 'Leg press', 'Shoulder press', 'Row']);
});

test('a settled day teaches the list its order: what was done in the order started, a superset as one', () => {
  const { state, press, row, curl, b } = setup();
  const ex = (name, days) => newExercise({ name, variants: [], sets: 2, low: 8, high: 12, step: 5, rest: 90, days });
  const fly = ex('Fly', ['Monday', 'Thursday']);
  const dips = ex('Dips', ['Monday', 'Thursday']);
  const pushdown = ex('Pushdown', ['Monday', 'Thursday']);
  const legs = ex('Leg press', ['Tuesday', 'Friday']);
  curl.days = ['Monday'];
  // Bench days: press, row, curl, fly, then dips + pushdown as a superset, with a squat-day exercise among them.
  state.exercises = [press, row, legs, curl, fly, dips, pushdown];
  setLink(state, dips, pushdown);
  const names = () => state.exercises.map((e) => e.name);
  const at = (minute) => `2026-11-02T17:${String(minute).padStart(2, '0')}:00.000Z`;
  const did = (session, e, ...minutes) => { ensureEntry(session, e, null).sets = minutes.map((m) => ({ weight: 50, reps: 10, at: at(m) })); };
  const mon = b.log[0][0];
  mon.date = '2026-11-02';
  // Done: the superset first (pushdown's set logged before dips' counts as the pair starting), then the fly,
  // then the press. The row is skipped and the curl never touched: both keep their places.
  did(mon, pushdown, 1, 4);
  did(mon, dips, 2, 5);
  did(mon, fly, 10, 12);
  ensureEntry(mon, row, null).skipped = true;
  did(mon, press, 20, 22);
  assert.equal(learnOrder(state, mon), true);
  assert.deepEqual(names(), ['Dips', 'Pushdown', 'Leg press', 'Row', 'Curl', 'Fly', 'Shoulder press']);
  assert.deepEqual(dayGroups(state, mon).map((g) => g.map((e) => e.name)), [['Dips', 'Pushdown'], ['Row'], ['Curl'], ['Fly'], ['Shoulder press']]);
  // Done again in the same order, nothing changes.
  assert.equal(learnOrder(state, mon), false);
  // Thursday has no row or curl: only Thursday's exercises trade places, and Monday's own keep theirs in the list.
  const thu = b.log[0][3];
  thu.date = '2026-11-05';
  did(thu, press, 1);
  did(thu, fly, 5);
  did(thu, dips, 9);
  assert.equal(learnOrder(state, thu), true);
  assert.deepEqual(names(), ['Shoulder press', 'Fly', 'Leg press', 'Row', 'Curl', 'Dips', 'Pushdown']);
  // Monday is older than a Thursday with accessories logged, so going back to it changes nothing.
  assert.equal(learnOrder(state, mon), false);
  assert.deepEqual(names(), ['Shoulder press', 'Fly', 'Leg press', 'Row', 'Curl', 'Dips', 'Pushdown']);
  // A day with nothing done, or no date, teaches nothing.
  const tue = b.log[0][1];
  tue.date = '2026-11-03';
  ensureEntry(tue, legs, null).skipped = true;
  assert.equal(learnOrder(state, tue), false);
  assert.equal(learnOrder(state, b.log[1][0]), false);
});

test('warm-up ticks, how a heavy day moved and the plates owned are kept when they check out', () => {
  const { state } = setup();
  const [mon, , , thu] = state.blocks[0].log[0];
  mon.warmups = ['2026-11-02T16:30:00.000Z', null, '2026-11-02T16:38:00.000Z'];
  thu.feel = 'grind';
  state.platesOwned = [45, 25, 10, 5, 2.5];
  const clean = cleanExtras(upgrade(JSON.parse(JSON.stringify(state))));
  assert.deepEqual(clean.blocks[0].log[0][0].warmups, mon.warmups);
  assert.equal(clean.blocks[0].log[0][3].feel, 'grind');
  assert.deepEqual(clean.platesOwned, [45, 25, 10, 5, 2.5]);
  // Anything else is dropped, keeping the rest of the log.
  Object.assign(mon, { warmups: ['yesterday'] });
  Object.assign(thu, { feel: 'heavy' });
  for (const owned of [[], [45, 30], 'all']) {
    const bad = cleanExtras(upgrade(JSON.parse(JSON.stringify({ ...state, platesOwned: owned }))));
    assert.equal(bad.platesOwned, undefined);
    assert.equal(bad.blocks[0].log[0][0].warmups, undefined);
    assert.equal(bad.blocks[0].log[0][3].feel, undefined);
    assert.equal(bad.blocks[0].log[0][3].reps.length, 3);
  }
});
