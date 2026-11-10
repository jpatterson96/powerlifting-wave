import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, emptyState } from '../logic.js';
import { MUSCLES, LIFT_MUSCLES, ALSO_MAX, guessMuscles, cleanAlso, fillMuscles, creditsOf } from '../muscles.js';
import {
  newExercise, cleanExtras, dayExtras, dayGroups, exercisesByDay, ensureEntry, finishExtras, muscleSets, muscleOutlook, dropOffers,
  isPaused, pausedOn,
} from '../extras.js';

const MAX = { squat: 385, bench: 315, deadlift: 455 };
const names = ({ muscle, also }) => [muscle, ...also].join(', ');

test('an exercise\'s muscles are read from its name, the narrower name first', () => {
  const expected = {
    'Incline barbell bench press': 'Chest, Front delts, Triceps',
    'Dumbbell bench press': 'Chest, Triceps, Front delts',
    'Chest press machine': 'Chest, Triceps, Front delts',
    'Close grip bench press': 'Triceps, Chest, Front delts',
    'High cable fly': 'Chest, Front delts',
    'Dumbbell reverse fly': 'Rear delts, Upper back',
    Dips: 'Triceps, Chest, Front delts',
    'Tricep pushdown, straight bar': 'Triceps',
    'Seated barbell overhead press': 'Front delts, Triceps, Side delts',
    'Shoulder press': 'Front delts, Triceps, Side delts',
    'Dumbbell lateral raise': 'Side delts',
    'Plate loaded lat pulldown, neutral grip': 'Lats, Biceps',
    'Behind the neck lat pulldown': 'Lats, Biceps',
    'Single arm chest supported low row': 'Lats, Upper back, Biceps',
    'Chest supported row, neutral narrow grip': 'Upper back, Lats, Biceps, Rear delts',
    'Bent over barbell row, overhand grip': 'Upper back, Lats, Biceps, Rear delts',
    'Seated cable row, neutral grip': 'Upper back, Lats, Biceps, Rear delts',
    'EZ bar preacher curl': 'Biceps',
    'Romanian deadlift': 'Hamstrings, Glutes, Lower back',
    'Seated leg curl': 'Hamstrings',
    'Leg extension': 'Quads',
    'Single leg hack squat': 'Quads, Glutes',
    'Leg press, wide stance': 'Quads, Glutes',
    'Calf raise on leg press': 'Calves',
    'Seated calf raise': 'Calves',
    'Barbell hip thrust': 'Glutes, Hamstrings',
    'Ab machine': 'Abs',
  };
  for (const [name, muscles] of Object.entries(expected)) assert.equal(names(guessMuscles(name)), muscles, name);
  assert.deepEqual(guessMuscles('Sled push'), { muscle: null, also: [] });
  // "Cable" and "slab" aren't abs, and every rule names muscles there are.
  assert.equal(guessMuscles('Cable thing').muscle, null);
  for (const lift of Object.values(LIFT_MUSCLES)) for (const m of [lift.muscle, ...lift.also]) assert.ok(MUSCLES.includes(m), m);
});

test('older exercises get the finer muscles and the ones they also work, once', () => {
  const fill = (e) => fillMuscles({ ...e });
  // Back and Shoulders are split by the name.
  assert.deepEqual(fill({ name: 'Neutral grip lat pulldown', muscle: 'Back' }), { name: 'Neutral grip lat pulldown', muscle: 'Lats', also: ['Biceps'] });
  assert.equal(fill({ name: 'Dumbbell lateral raise', muscle: 'Shoulders' }).muscle, 'Side delts');
  assert.equal(fill({ name: 'Dumbbell reverse fly', muscle: 'Shoulders' }).muscle, 'Rear delts');
  // A name the rules don't know keeps to the part it was: lats for the back, front delts for the shoulders.
  assert.deepEqual(fill({ name: 'Mystery machine', muscle: 'Back' }), { name: 'Mystery machine', muscle: 'Lats', also: [] });
  assert.equal(fill({ name: 'Mystery machine', muscle: 'Shoulders' }).muscle, 'Front delts');
  // A muscle that still stands is kept, even where the name says another: that one is then one it also works.
  assert.deepEqual(fill({ name: 'Dips', muscle: 'Chest' }), { name: 'Dips', muscle: 'Chest', also: ['Triceps', 'Front delts'] });
  // Never set, or dropped by an older copy of the app: read from the name. Set to none on purpose: left alone.
  assert.equal(fill({ name: 'Leg extension' }).muscle, 'Quads');
  assert.deepEqual(fill({ name: 'Leg extension', muscle: null }), { name: 'Leg extension', muscle: null, also: [] });
  // What's been picked by hand stays, tidied; and a second pass changes nothing.
  assert.deepEqual(fill({ name: 'Dips', muscle: 'Triceps', also: [] }).also, []);
  assert.deepEqual(fill({ name: 'Dips', muscle: 'Triceps', also: ['Chest', 'Chest', 'Triceps', 'Other', 'Wings'] }).also, ['Chest']);
  const once = fill({ name: 'Bent over barbell row', muscle: 'Back' });
  assert.deepEqual(fill(once), once);
  assert.equal(cleanAlso(['Chest', 'Lats', 'Biceps', 'Quads', 'Abs'], 'Triceps').length, ALSO_MAX);
});

test('a set counts in full for the main muscle and as half for each one also worked', () => {
  assert.deepEqual(creditsOf({ muscle: 'Chest', also: ['Triceps', 'Front delts'] }), [['Chest', 1], ['Triceps', 0.5], ['Front delts', 0.5]]);
  assert.deepEqual(creditsOf({ muscle: 'Biceps' }), [['Biceps', 1]]);
  assert.deepEqual(creditsOf(undefined), [[null, 1]]);

  const state = { ...emptyState(), blocks: [newBlock(MAX, '2026-11-02')] };
  const pulldown = newExercise({ name: 'Lat pulldown', muscle: 'Back', variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days: ['Wednesday'] });
  state.exercises.push(pulldown);
  cleanExtras(state);
  assert.deepEqual([pulldown.muscle, pulldown.also], ['Lats', ['Biceps']]);
  const wed = state.blocks[0].log[0][2];
  wed.reps = [5, 5, null];
  ensureEntry(wed, pulldown, null).sets = [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 9 }];
  // Two deadlift sets and three pulldowns.
  assert.deepEqual(Object.fromEntries(muscleSets(state, state.blocks[0].log[0])),
    { 'Lower back': 2, Glutes: 1, Hamstrings: 1, 'Upper back': 1, Lats: 3, Biceps: 1.5 });
});

test('an exercise on a break is off its days, with its days and log kept', () => {
  const state = { ...emptyState(), blocks: [newBlock(MAX, '2026-11-02')] };
  const make = (name, days) => newExercise({ name, variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days, link: null });
  const incline = make('Incline dumbbell bench press', ['Monday', 'Thursday']);
  const fly = make('Cable fly', ['Monday', 'Thursday']);
  state.exercises.push(incline, fly);
  cleanExtras(state);
  const [mon, , , thu] = state.blocks[0].log[0];
  const done = [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }, { weight: 60, reps: 9 }];
  ensureEntry(mon, incline, null).sets = done;
  const chest = () => muscleOutlook(state, state.blocks[0].log[0], 0, 0).get('Chest');
  assert.deepEqual(chest(), { sets: 18, target: 10 });

  incline.paused = true;
  cleanExtras(state);
  assert.equal(isPaused(incline), true);
  assert.deepEqual(incline.days, ['Monday', 'Thursday']);
  // Monday still shows it, as it was done there; Thursday doesn't, and nothing is planned or skipped for it.
  assert.deepEqual(dayExtras(state, mon), [fly, incline]);
  assert.deepEqual(dayExtras(state, thu), [fly]);
  assert.deepEqual(dayGroups(state, thu), [[fly]]);
  assert.deepEqual(pausedOn(state, 'Thursday'), [incline]);
  assert.deepEqual(pausedOn(state, 'Tuesday'), []);
  assert.deepEqual(chest(), { sets: 15, target: 10 }); // the bench's 6, Monday's 3 done, the fly's 6
  assert.equal(finishExtras(state, thu), 1);
  assert.equal(thu.extras.length, 1);
  assert.deepEqual(dropOffers(state, [0, 0, 3]), []);
  // Settings still lists it under its days.
  assert.deepEqual(exercisesByDay(state)[0].exercises, [incline, fly]);

  incline.paused = false;
  assert.deepEqual(dayExtras(state, thu), [incline, fly]);
});
