import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, emptyState, convertState, upgrade, isValidState, estimateMax } from '../logic.js';
import {
  newExercise, dayExtras, ensureEntry, entryOf, exerciseHistory, lastTime, defaultVariant, suggestion, sessionBest,
  records, logBodyweight, cleanExtras,
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
  saved.blocks[0].log[0][0].extras.push({ exercise: 'x', variant: null, skipped: 'no', sets: [] });
  saved.blocks[0].log[0][1].extras = 'nope';
  saved.blocks[0].log[0][0].date = 'yesterday';
  saved.bodyweight = [{ date: '2026-11-02', weight: -1 }, { date: '2026-11-02', weight: 200 }];
  const clean = cleanExtras(upgrade(saved));
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
