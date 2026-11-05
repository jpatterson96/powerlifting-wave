// The PRs page's entrance, planned on one clock so the bars (on CSS delays) and the numbers over them (stepped in
// script) agree: each bar drops into its station, its plates fly on a pair at a time, and the collars lock last.
import { BAR, PLATES, platesPerSide, tidy } from './logic.js';

// Milliseconds. The first bar starts at `start` and each later one `stagger` after; a bar takes `drop` to land;
// plates follow every `plate` ms, each flying for `fly` and touching down `land` of the way through; the finale
// (the total's pop, the shine over the bars) comes `finale` after the last collar locks.
export const SHOW = { start: 160, stagger: 200, drop: 380, plate: 110, fly: 360, land: 0.7, finale: 120 };

// One lift's schedule. `steps` is what its number reads from each moment on: the bar when it lands, then every
// pair of plates as it touches down, then the record itself once the collars are on (which also covers a record
// the plates can't make exactly). `plateAt(k)` is when plate k starts flying; the collar is plate `plates.length`.
// `sizes` is the plates there are to load.
export function liftShow(value, unit, i, timing = SHOW, sizes = PLATES[unit]) {
  const bar = BAR[unit];
  const plates = platesPerSide(value, unit, bar, sizes);
  const t0 = timing.start + i * timing.stagger;
  const landed = t0 + timing.drop;
  const plateAt = (k) => landed + k * timing.plate;
  const touch = timing.fly * timing.land;
  const steps = [{ at: landed, value: Math.min(bar, value) }];
  let loaded = bar;
  plates.forEach((p, k) => {
    loaded = tidy(loaded + 2 * p);
    steps.push({ at: plateAt(k) + touch, value: loaded });
  });
  const lock = plateAt(plates.length) + touch;
  steps.push({ at: lock, value });
  return { value, plates, t0, landed, plateAt, lock, steps };
}

export function showPlan(values, unit, timing = SHOW, sizes = PLATES[unit]) {
  const lifts = values.map((v, i) => liftShow(v, unit, i, timing, sizes));
  const done = Math.max(0, ...lifts.map((l) => l.lock));
  return { lifts, done, finale: done + timing.finale };
}

// What a number reads at time t: the last step reached, or null before its bar lands.
export const stepAt = (steps, t) => steps.reduce((reached, s) => (s.at <= t ? s : reached), null);

// The PR moment, after a good re-max lift heavier than any record: the old record's bar is made into the new one.
// Milliseconds. The screen darkens at 0; the three lights come on from `lights`, `lightGap` apart; the bar drops at
// `bar` and lands `drop` later, loaded to the old record; after `pause` the collars come off (`collar` long), the
// plates the new record doesn't keep fly off `offGap` apart (each away in `offDur`), then the new ones fly on `onGap`
// apart, each in the air `onDur` and touching down `land` of the way through; the collars lock last; the shine comes
// `finale` after the lock and the gain `gain` after.
export const PR_SHOW = { lights: 340, lightGap: 210, bar: 1000, drop: 380, pause: 260, collar: 220, offGap: 160, offDur: 300, onGap: 260, onDur: 420, land: 0.7, finale: 120, gain: 220 };

// The moment's schedule. `keep` is what both loads share from the bar out, `off` the rest of the old load and `on`
// the rest of the new one. `steps` is what the number reads from each moment on: the old record (marked `old`) when
// the bar lands, then each new pair of plates as it touches down, then the record itself once the collars are on.
export function prShow(oldValue, value, unit, timing = PR_SHOW, sizes = PLATES[unit]) {
  const bar = BAR[unit];
  const was = platesPerSide(oldValue, unit, bar, sizes);
  const plates = platesPerSide(value, unit, bar, sizes);
  let k = 0;
  while (k < was.length && k < plates.length && was[k] === plates[k]) k++;
  const keep = was.slice(0, k);
  const off = was.slice(k);
  const on = plates.slice(k);
  const lightsAt = [0, 1, 2].map((i) => timing.lights + i * timing.lightGap);
  const t0 = timing.bar;
  const landed = t0 + timing.drop;
  const unlock = landed + timing.pause;
  const offAt = (j) => unlock + timing.collar + j * timing.offGap;
  const onStart = off.length ? offAt(off.length - 1) + timing.offDur : unlock + timing.collar;
  const onAt = (j) => onStart + j * timing.onGap;
  const touch = timing.onDur * timing.land;
  const lock = onAt(on.length) + touch;
  const steps = [{ at: landed, value: oldValue, old: true }];
  let loaded = tidy(bar + 2 * keep.reduce((sum, p) => sum + p, 0));
  on.forEach((p, j) => {
    loaded = tidy(loaded + 2 * p);
    steps.push({ at: onAt(j) + touch, value: loaded });
  });
  steps.push({ at: lock, value });
  return { value, oldValue, plates, keep, off, on, lightsAt, t0, landed, unlock, offAt, onAt, lock, finale: lock + timing.finale, gainAt: lock + timing.gain, steps };
}
