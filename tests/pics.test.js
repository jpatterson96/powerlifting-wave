import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PICS, picFor, picFile } from '../pics.js';
import { emptyState, newBlock } from '../logic.js';
import { newExercise, cleanExtras } from '../extras.js';

// The lifter's own accessories, and the picture each should get from its name alone.
const MINE = {
  'Incline dumbbell bench press': 'incline-dumbbell-press',
  'Dumbbell bench press': 'dumbbell-bench-press',
  'Chest press machine': 'chest-press-machine',
  'Dumbbell lateral raise': 'lateral-raise',
  'High cable fly': 'cable-fly',
  'Tricep pushdown, straight bar': 'pushdown',
  'Shoulder press': 'shoulder-press-machine',
  'Seated barbell overhead press': 'overhead-press-barbell',
  'Incline barbell bench press': 'incline-barbell-press',
  'Dips': 'dips',
  'Plate loaded lat pulldown, neutral grip': 'lat-pulldown',
  'Inverted row, overhand grip': 'inverted-row',
  'Bent over barbell row, overhand grip': 'bent-over-row',
  'Single arm chest supported low row': 'one-arm-row',
  'Chest supported row, neutral narrow grip': 'chest-supported-row',
  'Behind the neck lat pulldown': 'lat-pulldown-behind',
  'Preacher curl machine': 'preacher-curl',
  'Seated cable row, neutral grip': 'seated-cable-row',
  'EZ bar preacher curl': 'preacher-curl',
  'Dumbbell reverse fly': 'reverse-fly',
  'Underhand grip lat pulldown': 'lat-pulldown-underhand',
  'Neutral grip lat pulldown': 'lat-pulldown-machine',
  'Barbell hip thrust': 'hip-thrust',
  'Leg press, wide stance': 'leg-press',
  'Calf raise on leg press': 'leg-press-calf',
  'Lying leg curl': 'lying-leg-curl',
  'Single leg hack squat': 'hack-squat',
  'Seated calf raise': 'seated-calf-raise',
  'Leg extension': 'leg-extension',
  'Ab machine': 'crunch',
  'Seated leg curl': 'seated-leg-curl',
};

test('every one of the lifter’s exercises gets the right picture from its name', () => {
  for (const [name, key] of Object.entries(MINE)) assert.equal(picFor({ name }), key, name);
});

test('the variant in use can change the picture', () => {
  assert.equal(picFor({ name: 'Shoulder press' }, 'Dumbbell'), 'shoulder-press-dumbbell');
  assert.equal(picFor({ name: 'Shoulder press' }, 'Machine'), 'shoulder-press-machine');
  assert.equal(picFor({ name: 'Shoulder press' }), 'shoulder-press-machine');
});

test('a chosen picture wins, an unknown one is ignored, and a name nothing fits gets none', () => {
  assert.equal(picFor({ name: 'Leg press', pic: 'crunch' }), 'crunch');
  assert.equal(picFor({ name: 'Leg press', pic: 'nope' }), 'leg-press');
  assert.equal(picFor({ name: 'Farmer carry' }), null);
  assert.equal(picFor({ name: '' }), null);
});

test('other common names land somewhere sensible', () => {
  const cases = { 'Barbell back squat': 'squat', 'Romanian deadlift': 'deadlift', 'Pull-up': 'pull-up', 'Chin up': 'pull-up', 'Walking lunge': 'lunge',
    'Standing calf raise': 'standing-calf-raise', 'Dumbbell curl': 'dumbbell-curl', 'EZ bar curl': 'barbell-curl', 'Skull crusher': 'skull-crusher',
    'Overhead triceps extension': 'skull-crusher', 'Dumbbell shrug': 'shrug', 'Face pull': 'reverse-fly', 'Pec deck': 'cable-fly', 'Push-up': 'push-up',
    'Plank': 'crunch', 'Bench press': 'bench-press', 'Dumbbell shoulder press': 'shoulder-press-dumbbell', 'Machine row': 'chest-supported-row' };
  for (const [name, key] of Object.entries(cases)) assert.equal(picFor({ name }), key, name);
});

test('every picture has its file, and the keys are unique', () => {
  const keys = PICS.map(([key]) => key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.ok(existsSync(new URL(`../${picFile(key)}`, import.meta.url)), key);
});

test('a saved picture that is not one of the choices is dropped on load, a real one kept', () => {
  const state = { ...emptyState(), blocks: [newBlock({ squat: 385, bench: 315, deadlift: 455 }, '2026-11-02')] };
  const a = newExercise({ name: 'Row', variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days: [], pic: 'nope' });
  const b = newExercise({ name: 'Row', variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days: [], pic: 'squat' });
  const c = newExercise({ name: 'Row', variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days: [], pic: null });
  state.exercises.push(a, b, c);
  cleanExtras(state);
  assert.equal(Object.hasOwn(state.exercises[0], 'pic'), false);
  assert.equal(state.exercises[1].pic, 'squat');
  assert.equal(state.exercises[2].pic, null);
});
