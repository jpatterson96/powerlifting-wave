import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOW, PR_SHOW, liftShow, prShow, showPlan, stepAt } from '../show.js';

const values = (lift) => lift.steps.map((s) => s.value);

test('a number climbs by a pair of plates at a time and ends on the record', () => {
  const lift = liftShow(385, 'lb', 0);
  assert.deepEqual(lift.plates, [45, 45, 45, 35]);
  assert.deepEqual(values(lift), [45, 135, 225, 315, 385, 385]);
  for (let k = 1; k < lift.steps.length; k++) assert.ok(lift.steps[k].at > lift.steps[k - 1].at);
  assert.equal(lift.steps[0].at, SHOW.start + SHOW.drop);
  assert.equal(lift.lock, lift.steps[lift.steps.length - 1].at);
  assert.equal(lift.lock, lift.plateAt(lift.plates.length) + SHOW.fly * SHOW.land);
});

test('a record the plates cannot make exactly still ends on the record', () => {
  const lift = liftShow(386, 'lb', 0);
  assert.deepEqual(values(lift).slice(-2), [385, 386]);
});

test('a record lighter than the bar reads as itself, with no plates', () => {
  const lift = liftShow(30, 'lb', 0);
  assert.deepEqual(lift.plates, []);
  assert.deepEqual(values(lift), [30, 30]);
});

test('kilo plates add up the same way', () => {
  const lift = liftShow(140, 'kg', 0);
  assert.deepEqual(lift.plates, [25, 25, 10]);
  assert.deepEqual(values(lift), [20, 70, 120, 140, 140]);
});

test('later bars start later, and the finale waits for the slowest', () => {
  const plan = showPlan([385, 315, 455], 'lb');
  assert.equal(plan.lifts[1].t0 - plan.lifts[0].t0, SHOW.stagger);
  assert.equal(plan.done, plan.lifts[2].lock);
  assert.equal(plan.finale, plan.done + SHOW.finale);
  assert.deepEqual(showPlan([], 'lb'), { lifts: [], done: 0, finale: SHOW.finale });
});

test('stepAt reads the last step reached', () => {
  const steps = [{ at: 100, value: 45 }, { at: 300, value: 135 }];
  assert.equal(stepAt(steps, 0), null);
  assert.equal(stepAt(steps, 100).value, 45);
  assert.equal(stepAt(steps, 299).value, 45);
  assert.equal(stepAt(steps, 1000).value, 135);
});

const climbs = (steps) => steps.every((s, k) => k === 0 || s.value >= steps[k - 1].value);

test('a PR by a pair of fives keeps the old plates and flies the fives on', () => {
  const plan = prShow(455, 465, 'lb');
  assert.deepEqual(plan.keep, [45, 45, 45, 45, 25]);
  assert.deepEqual(plan.off, []);
  assert.deepEqual(plan.on, [5]);
  assert.deepEqual(plan.plates, [45, 45, 45, 45, 25, 5]);
  assert.deepEqual(plan.steps.map((s) => s.value), [455, 465, 465]);
  assert.equal(plan.steps[0].old, true);
  assert.equal(plan.steps[0].at, plan.landed);
  assert.equal(plan.steps[1].at, plan.onAt(0) + PR_SHOW.onDur * PR_SHOW.land);
  assert.equal(plan.lock, plan.onAt(1) + PR_SHOW.onDur * PR_SHOW.land);
  assert.equal(plan.steps[2].at, plan.lock);
  assert.equal(plan.finale, plan.lock + PR_SHOW.finale);
  assert.equal(plan.gainAt, plan.lock + PR_SHOW.gain);
  assert.ok(climbs(plan.steps));
});

test('the collars come off before anything moves, and the first new plate flies after them', () => {
  const plan = prShow(455, 465, 'lb');
  assert.equal(plan.unlock, plan.landed + PR_SHOW.pause);
  assert.equal(plan.onAt(0), plan.unlock + PR_SHOW.collar);
});

test('a PR the old plates cannot grow into swaps them: the 35s come off, 45s go on', () => {
  const plan = prShow(385, 405, 'lb');
  assert.deepEqual(plan.keep, [45, 45, 45]);
  assert.deepEqual(plan.off, [35]);
  assert.deepEqual(plan.on, [45]);
  assert.equal(plan.offAt(0), plan.unlock + PR_SHOW.collar);
  assert.equal(plan.onAt(0), plan.offAt(0) + PR_SHOW.offDur);
  assert.deepEqual(plan.steps.map((s) => s.value), [385, 405, 405]);
  assert.ok(climbs(plan.steps));
});

test('the number never dips while the plates change over', () => {
  for (const [a, b] of [[440, 445], [460, 465], [470, 475], [315, 320], [225, 235], [135, 140]]) {
    assert.ok(climbs(prShow(a, b, 'lb').steps), `${a} to ${b}`);
  }
});

test('a record the plates cannot make exactly still ends on the record', () => {
  const plan = prShow(455, 467, 'lb');
  assert.deepEqual(plan.steps.map((s) => s.value).slice(-2), [465, 467]);
});

test('an old record under the bar flies everything on', () => {
  const plan = prShow(30, 55, 'lb');
  assert.deepEqual([plan.keep, plan.off, plan.on], [[], [], [5]]);
  assert.deepEqual(plan.steps.map((s) => s.value), [30, 55, 55]);
});

test('kilo PRs load the same way', () => {
  const plan = prShow(140, 150, 'kg');
  assert.deepEqual([plan.keep, plan.off, plan.on], [[25, 25], [10], [15]]);
  assert.deepEqual(plan.steps.map((s) => s.value), [140, 150, 150]);
});

test('the lights come on one after another before the bar drops', () => {
  const plan = prShow(455, 465, 'lb');
  assert.deepEqual(plan.lightsAt, [PR_SHOW.lights, PR_SHOW.lights + PR_SHOW.lightGap, PR_SHOW.lights + 2 * PR_SHOW.lightGap]);
  assert.ok(plan.lightsAt[2] < plan.t0);
});
