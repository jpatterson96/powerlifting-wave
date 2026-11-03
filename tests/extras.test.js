import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, emptyState, convertState, upgrade, isValidState, estimateMax } from '../logic.js';
import {
  newExercise, dayExtras, dayGroups, setLink, supersetOrder, ensureEntry, entryOf, exerciseHistory, lastTime,
  defaultVariant, suggestion, sessionBest, records, logBodyweight, cleanExtras, finishExtras, plannedSets, isNewBest, muscleSets,
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
  assert.equal(defaultVariant(state, press), 'Machine'); // the variant used most recently
  assert.equal(exerciseHistory(state, press.id).length, 2);
});

test('double progression adds a rep a set, then weight once every set tops out', () => {
  const ex = { sets: 3, low: 8, high: 12, step: 5 };
  assert.deepEqual(suggestion(ex, null), { weights: [null, null, null], reps: [8, 8, 8], up: false });
  const mid = suggestion(ex, { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 11 }, { weight: 50, reps: 7 }] });
  assert.deepEqual(mid, { weights: [50, 50, 50], reps: [12, 12, 8], up: false });
  const top = suggestion(ex, { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }, { weight: 50, reps: 13 }] });
  assert.deepEqual(top, { weights: [55, 55, 55], reps: [8, 8, 8], up: true });
  // Two sets logged of three: not every set reached the top, so the weight holds.
  assert.equal(suggestion(ex, { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }] }).up, false);
  // Body-weight work keeps adding reps past the range instead of suggesting weight.
  assert.deepEqual(suggestion(ex, { sets: Array(3).fill({ weight: 0, reps: 12 }) }), { weights: [0, 0, 0], reps: [13, 13, 13], up: false });
});

test('weeks 7 and 8 halve the sets and repeat last time, and progression skips over them', () => {
  const ex = { sets: 3, low: 8, high: 12, step: 5 };
  assert.deepEqual([0, 5, 6, 7].map((w) => plannedSets(ex, w)), [3, 3, 2, 2]);
  assert.equal(plannedSets({ ...ex, sets: 1 }, 6), 1);
  const topped = { sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }, { weight: 50, reps: 12 }] };
  assert.deepEqual(suggestion(ex, topped, 6), { weights: [50, 50], reps: [12, 12], up: false });
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
