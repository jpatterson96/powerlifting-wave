import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newBlock, prescription, weekdayOf, dueSession, missedSessions, platesPerSide, plateSizes, emptyState,
  convertState,
} from '../logic.js';

const MAX = { squat: 385, bench: 315, deadlift: 455 };
const at = (block, week, day) => ({ week, index: block.log[week].findIndex((s) => s.day === day) });
const log = (block, week, day, date) => {
  const s = block.log[week].find((x) => x.day === day);
  s.reps = Array(s.reps.length).fill(prescription(s.kind, week).reps);
  s.date = date;
  return s;
};

// Block 1 starts Monday 2 November 2026: week 1 is 2-6 November, week 2 is 9-13 November.
test('dates fall on their days of the week', () => {
  assert.equal(weekdayOf('2026-11-02'), 'Monday');
  assert.equal(weekdayOf('2026-11-05'), 'Thursday');
  assert.equal(weekdayOf('2026-11-08'), 'Sunday');
});

test("today's day opens when it's still to do, even with an earlier day missed", () => {
  const b = newBlock(MAX, '2026-11-02');
  log(b, 0, 'Monday', '2026-11-02');
  log(b, 0, 'Tuesday', '2026-11-03');
  assert.deepEqual(dueSession(b, '2026-11-04'), at(b, 0, 'Wednesday'));
  // Wednesday missed: Thursday's bench doesn't wait for it.
  assert.deepEqual(dueSession(b, '2026-11-05'), at(b, 0, 'Thursday'));
  assert.deepEqual(missedSessions(b, '2026-11-05'), [at(b, 0, 'Wednesday')]);
  // On the weekend there's no day of its own, so the next to train opens (Wednesday could be made up), and it
  // counts as missed once a later day has been trained. Friday isn't missed until a later day is due.
  log(b, 0, 'Thursday', '2026-11-05');
  assert.deepEqual(dueSession(b, '2026-11-07'), at(b, 0, 'Wednesday'));
  assert.deepEqual(missedSessions(b, '2026-11-07'), [at(b, 0, 'Wednesday')]);
  assert.deepEqual(missedSessions(b, '2026-11-09'), [at(b, 0, 'Wednesday'), at(b, 0, 'Friday')]);
});

test('a day trained today stays open once it is done', () => {
  const b = newBlock(MAX, '2026-11-02');
  for (const [day, date] of [['Monday', '2026-11-02'], ['Tuesday', '2026-11-03'], ['Wednesday', '2026-11-04'], ['Thursday', '2026-11-05']]) log(b, 0, day, date);
  assert.deepEqual(dueSession(b, '2026-11-05'), at(b, 0, 'Thursday'));
  assert.deepEqual(missedSessions(b, '2026-11-05'), []);
  assert.deepEqual(dueSession(b, '2026-11-06'), at(b, 0, 'Friday'));
});

test("a missed Friday doesn't hold up next Monday, and skipped or started days aren't missed", () => {
  const b = newBlock(MAX, '2026-11-02');
  for (const [day, date] of [['Monday', '2026-11-02'], ['Tuesday', '2026-11-03'], ['Wednesday', '2026-11-04']]) log(b, 0, day, date);
  b.log[0].find((s) => s.day === 'Thursday').skipped = true;
  assert.deepEqual(dueSession(b, '2026-11-09'), at(b, 1, 'Monday'));
  assert.deepEqual(missedSessions(b, '2026-11-09'), [at(b, 0, 'Friday')]);
  b.log[0].find((s) => s.day === 'Friday').reps[0] = 4;
  assert.deepEqual(missedSessions(b, '2026-11-09'), []);
  // Further ahead than the week after the next day to train, it just opens that day.
  assert.deepEqual(dueSession(b, '2026-11-17'), at(b, 0, 'Friday'));
});

test('a block with nothing trained yet starts on its Monday, whatever the day', () => {
  // As when a re-max week ends on Wednesday and the next block is started on Thursday.
  const b = newBlock(MAX, '2026-11-05');
  assert.deepEqual(dueSession(b, '2026-11-05'), at(b, 0, 'Monday'));
  assert.deepEqual(missedSessions(b, '2026-11-05'), []);
});

test('days done on other days of the week go in order', () => {
  const b = newBlock(MAX, '2026-11-02');
  // Monday's bench done on Tuesday: the days aren't on the calendar any more, so Tuesday's squat is next on Wednesday.
  log(b, 0, 'Monday', '2026-11-03');
  assert.deepEqual(dueSession(b, '2026-11-04'), at(b, 0, 'Tuesday'));
  assert.deepEqual(missedSessions(b, '2026-11-04'), []);
  // A later day picked by hand still leaves the one passed over as missed.
  log(b, 0, 'Wednesday', '2026-11-04');
  assert.deepEqual(missedSessions(b, '2026-11-05'), [at(b, 0, 'Tuesday')]);
});

test('a finished block has no day due and nothing missed', () => {
  const b = newBlock(MAX, '2026-11-02', 'deload');
  for (const week of b.log) for (const s of week) s.skipped = true;
  assert.equal(dueSession(b, '2026-12-28'), null);
  assert.deepEqual(missedSessions(b, '2026-12-28'), []);
});


test('plate math uses only the plates owned', () => {
  const state = { ...emptyState(), platesOwned: [45, 25, 10, 5, 2.5] };
  assert.deepEqual(plateSizes(state), [45, 25, 10, 5, 2.5]);
  assert.deepEqual(plateSizes(emptyState()), [45, 35, 25, 10, 5, 2.5, 1.25]);
  assert.deepEqual(platesPerSide(385, 'lb', 45, plateSizes(state)), [45, 45, 45, 25, 10]);
  assert.deepEqual(platesPerSide(160, 'lb', 45, plateSizes(state)), [45, 10, 2.5]);
  // Without the smallest plate what can't be made is left off, for the caller to say so.
  assert.deepEqual(platesPerSide(160, 'lb', 45, [45, 25, 10, 5]), [45, 10]);
  // Switching units starts from every plate of the new unit.
  const kg = convertState({ ...state, blocks: [newBlock(MAX, '2026-11-02')] }, 'kg');
  assert.equal(kg.platesOwned, undefined);
  assert.deepEqual(plateSizes(kg), [25, 20, 15, 10, 5, 2.5, 1.25]);
});
