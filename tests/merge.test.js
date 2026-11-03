import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLogs } from '../merge.js';

const ex = (id, name = id) => ({ id, name, variants: [], sets: 3, low: 8, high: 12, step: 5, rest: 90, days: ['Monday'], link: null });
const log = (fields) => ({ v: 3, unit: 'lb', round: 5, trainingMax: false, rest: 'sound', blocks: [{ tag: 'base' }], exercises: [], bodyweight: [], ...fields });

test('a part only GitHub changed comes from GitHub, one only the phone changed stays', () => {
  const base = log({});
  const local = log({ blocks: [{ tag: 'phone logged a set' }] });
  const remote = log({ exercises: [ex('a'), ex('b')] });
  const merged = mergeLogs(base, local, remote);
  assert.deepEqual(merged.blocks, [{ tag: 'phone logged a set' }]);
  assert.deepEqual(merged.exercises.map((e) => e.id), ['a', 'b']);
});

test('an exercise edited only on GitHub replaces the phone copy', () => {
  const base = log({ exercises: [ex('a'), ex('b')] });
  const local = log({ exercises: [ex('a'), ex('b')], blocks: [{ tag: 'new set' }] });
  const remote = log({ exercises: [{ ...ex('a'), link: 'b' }, ex('b')] });
  assert.equal(mergeLogs(base, local, remote).exercises[0].link, 'b');
});

test('lists both sides changed are joined, keeping the phone copy of shared items', () => {
  const base = log({ exercises: [ex('a')] });
  const local = log({ exercises: [ex('a', 'Row (phone)'), ex('p')], bodyweight: [{ date: '2026-11-03', weight: 200 }] });
  const remote = log({ exercises: [ex('a', 'Row (pc)'), ex('r')], bodyweight: [{ date: '2026-11-01', weight: 201 }, { date: '2026-11-03', weight: 199 }] });
  const merged = mergeLogs(base, local, remote);
  assert.deepEqual(merged.exercises.map((e) => e.name), ['Row (phone)', 'p', 'r']);
  assert.deepEqual(merged.bodyweight, [{ date: '2026-11-01', weight: 201 }, { date: '2026-11-03', weight: 200 }]);
});

test('earlier maxes entered on both sides are joined by day and lift', () => {
  const base = log({});
  const local = log({ pastMaxes: [{ date: '2025-01-05', lift: 'bench', value: 300 }] });
  const remote = log({ pastMaxes: [{ date: '2024-02-01', lift: 'bench', value: 285 }, { date: '2025-01-05', lift: 'bench', value: 295 }] });
  assert.deepEqual(mergeLogs(base, local, remote).pastMaxes.map((p) => p.value), [285, 300]);
});

test('without a record of the last match, the training log stays and lists are joined', () => {
  const local = log({ blocks: [{ tag: 'phone' }], exercises: [] });
  const remote = log({ blocks: [{ tag: 'older copy' }], exercises: [ex('g01'), ex('g02')] });
  const merged = mergeLogs(null, local, remote);
  assert.deepEqual(merged.blocks, [{ tag: 'phone' }]);
  assert.equal(merged.exercises.length, 2);
  // A field the phone's copy of an exercise lacks comes from GitHub's copy.
  const { link, ...unlinked } = ex('g03');
  const joined = mergeLogs(null, log({ exercises: [unlinked], blocks: [{ tag: 'phone' }] }), log({ exercises: [{ ...ex('g03'), link: 'g04' }] }));
  assert.equal(joined.exercises[0].link, 'g04');
  assert.equal(link, null);
  // A part the phone doesn't have yet is taken as is.
  const older = log({});
  delete older.bodyweight;
  assert.deepEqual(mergeLogs(null, older, log({ bodyweight: [{ date: '2026-11-02', weight: 200 }] })).bodyweight.length, 1);
});
