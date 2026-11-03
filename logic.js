// Program rules: an 8-week block built on the template wave. No DOM access here so it can be tested in Node.

export const LIFTS = [
  { id: 'squat', name: 'Squat', short: 'Squat' },
  { id: 'bench', name: 'Bench press', short: 'Bench' },
  { id: 'deadlift', name: 'Deadlift', short: 'Deadlift' },
];

const DELOAD = { sets: 2, reps: 5, pct: 0.60 };

// Re-max attempts as a share of the max going in: opener, second, third. Openers near 91% with jumps of
// about 5% and 3% match what successful meet lifters take.
export const ATTEMPTS = [0.91, 0.96, 1.02];
export const ATTEMPT_NAMES = ['Opener', 'Second', 'Third'];

// Each week's template days (Monday to Wednesday, `base`) and heavy days (Thursday and Friday, `heavy`).
// Weeks 1-3 are the template's wave. Weeks 4-6 repeat it about 5% heavier with a rep fewer, trained from
// the max the week 3 test set settles on. Week 7 tapers: less work at the same weight, with one heavy
// single on the template days. Week 8 finishes the block with a re-max (template days only) or a deload.
// `amrap` marks a week whose template days end on a test set: as many clean reps as possible.
export const WEEKS = [
  { name: 'Accumulation', note: 'High volume', base: { sets: 3, reps: 6, pct: 0.70 }, heavy: { sets: 3, reps: 4, pct: 0.775 } },
  { name: 'Intensification', note: 'Moderate volume and weight', base: { sets: 4, reps: 4, pct: 0.75 }, heavy: { sets: 4, reps: 3, pct: 0.825 } },
  { name: 'Realization', note: 'Heavy peak', amrap: true, base: { sets: 5, reps: 2, pct: 0.825 }, heavy: { sets: 3, reps: 2, pct: 0.875 } },
  { name: 'Accumulation', note: 'Second wave, heavier', base: { sets: 3, reps: 5, pct: 0.75 }, heavy: { sets: 3, reps: 3, pct: 0.825 } },
  { name: 'Intensification', note: 'Second wave', base: { sets: 4, reps: 3, pct: 0.80 }, heavy: { sets: 4, reps: 2, pct: 0.875 } },
  { name: 'Realization', note: 'The heaviest week', amrap: true, base: { sets: 4, reps: 2, pct: 0.85 }, heavy: { sets: 3, reps: 1, pct: 0.925 } },
  { name: 'Taper', note: 'Less work, same weights', base: { sets: 2, reps: 2, pct: 0.80, single: 0.90 }, heavy: { sets: 3, reps: 2, pct: 0.75 } },
  { name: 'Finish', note: '', base: DELOAD, heavy: DELOAD, max: { sets: 3, reps: 1, pct: ATTEMPTS[0] } },
];
export const BLOCK_WEEKS = WEEKS.length;
export const WAVE_TWO = 3;
export const FINISH_WEEK = 7;
export const FIRST_TEST = 2;
export const SECOND_TEST = 5;
export const FINISHES = ['remax', 'deload'];

export const prescription = (kind, week) => WEEKS[week][kind];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The lifter's own week. Thursday and Friday are the heavier repeat sessions of bench and squat.
export const SCHEDULE = [
  { day: 'Monday', lift: 'bench', kind: 'base' },
  { day: 'Tuesday', lift: 'squat', kind: 'base' },
  { day: 'Wednesday', lift: 'deadlift', kind: 'base' },
  { day: 'Thursday', lift: 'bench', kind: 'heavy' },
  { day: 'Friday', lift: 'squat', kind: 'heavy' },
];

// The last set of each template day in an amrap week is the test set.
export const isTestSet = (session, week, set) =>
  Boolean(WEEKS[week].amrap) && session.kind === 'base' && set === session.reps.length - 1;

// Low, middle and top step for raising a max.
export const BUMPS = {
  lb: { squat: [5, 7.5, 10], bench: [2.5, 3.75, 5], deadlift: [5, 7.5, 10] },
  kg: { squat: [2.5, 3.75, 5], bench: [1.25, 2, 2.5], deadlift: [2.5, 3.75, 5] },
};

export const TRAINING_MAX = 0.9;
export const LONG_BREAK_DAYS = 14;

export const BAR = { lb: 45, kg: 20 };

export const PLATES = {
  lb: [45, 35, 25, 10, 5, 2.5, 1.25],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export const ROUNDING = { lb: [5, 2.5], kg: [2.5, 5] };
export const REST_MODES = ['sound', 'silent', 'off'];

const LB_PER_KG = 2.20462;

// Avoids float noise like 334.99999 in displayed numbers.
export function tidy(n) {
  return Math.round(n * 1000) / 1000;
}

export function roundTo(weight, increment) {
  return tidy(Math.round(weight / increment) * increment);
}

// The max that percentages are taken from: the real max, or 90% of it when a training max is on.
export function workingMax(max, state) {
  return state.trainingMax ? max * TRAINING_MAX : max;
}

export function targetWeight(max, kind, week, increment) {
  return roundTo(max * prescription(kind, week).pct, increment);
}

// Estimated one-rep max from a set taken close to failure: the average of the Epley and Brzycki
// formulas, which bracket the standard rep tables at 2-6 reps.
export function estimateMax(weight, reps) {
  const r = Math.min(reps, 15);
  return tidy((weight * (1 + r / 30) + (weight * 36) / (37 - r)) / 2);
}

// A max moved by a test set's estimate: down 5% when the estimate is well under it, held when close,
// then up the lift's low, middle or top step as the estimate pulls ahead. At 82.5% that's 4 reps or
// fewer down, 5-6 held, 7, 8 and 9+ up; at 85% each band is a rep lower.
export function adjustMax(max, estimate, liftId, state) {
  const ratio = estimate / max;
  if (ratio < 0.93) return { change: 'lower', value: roundTo(max * 0.95, state.round) };
  if (ratio < 0.99) return { change: 'hold', value: max };
  const steps = BUMPS[state.unit][liftId];
  return { change: 'raise', value: tidy(max + steps[ratio < 1.02 ? 0 : ratio < 1.05 ? 1 : 2]) };
}

// The logged test set of one lift in an amrap week, or null.
function testResult(block, liftId, week, state) {
  const s = block.log[week].find((x) => x.lift === liftId && x.kind === 'base');
  const last = s && !s.skipped ? s.reps[s.reps.length - 1] : null;
  if (last === null || last === undefined) return null;
  const weight = setWeight(block, s, week, s.reps.length - 1, state);
  return { weight, reps: last, estimate: estimateMax(weight, last), date: s.date ?? null };
}

// The max a week's percentages come from. From week 4 on, it's the max the week 3 test set settled on.
export function weekMax(block, liftId, week, state) {
  const max = block.max[liftId];
  if (week < WAVE_TWO) return max;
  const test = testResult(block, liftId, FIRST_TEST, state);
  return test ? adjustMax(max, test.estimate, liftId, state).value : max;
}

// Every max a lift has trained from, oldest first, with the day it was set: each block's starting max (the
// day the block started), then the max its week 3 test set moved it to. A test logged before days were
// recorded has a null date.
export function maxChanges(state, liftId) {
  const out = [];
  state.blocks.forEach((b, block) => {
    out.push({ block, week: 0, date: b.started, value: b.max[liftId], test: null });
    const test = testResult(b, liftId, FIRST_TEST, state);
    const moved = weekMax(b, liftId, WAVE_TWO, state);
    if (test && moved !== b.max[liftId]) out.push({ block, week: WAVE_TWO, date: test.date, value: moved, test });
  });
  return out.map((c, i) => ({ ...c, change: i ? c.value - out[i - 1].value : 0 }));
}

// Re-max attempts build from the week 6 estimate when there is one, else the second-wave max. The real
// max either way, even with a training max on: the point is to test it.
export function attemptBase(block, liftId, state) {
  return testResult(block, liftId, SECOND_TEST, state)?.estimate ?? weekMax(block, liftId, SECOND_TEST, state);
}

export function attemptWeight(block, liftId, attempt, state) {
  return roundTo(attemptBase(block, liftId, state) * ATTEMPTS[attempt], state.round);
}

// The weight a set was lifted with: what was entered, or else the target.
export function setWeight(block, session, week, set, state) {
  if (session.kind === 'max') return session.weights[set] ?? attemptWeight(block, session.lift, set, state);
  const max = workingMax(weekMax(block, session.lift, week, state), state);
  return session.weight ?? targetWeight(max, session.kind, week, state.round);
}

// The taper week's heavy single on the template days, done before its sets.
export function singleWeight(block, session, week, state) {
  const { single } = prescription(session.kind, week);
  return single ? roundTo(workingMax(weekMax(block, session.lift, week, state), state) * single, state.round) : null;
}

// Seconds of rest before the next set by lift and load: bench recovers fastest, deadlift slowest, and
// test sets and re-max attempts get the most. Each is a minimum; add up to a minute after a slow set.
const REST = {
  bench: [90, 120, 150, 180, 180, 210],
  squat: [120, 150, 180, 180, 210, 240],
  deadlift: [120, 180, 180, 210, 240, 240],
};
const REST_TEST = { bench: 240, squat: 300, deadlift: 300 };
const restBand = (pct) => (pct <= 0.65 ? 0 : pct < 0.725 ? 1 : pct < 0.79 ? 2 : pct < 0.84 ? 3 : pct < 0.89 ? 4 : 5);

export function restSeconds(session, week, nextSet) {
  if (session.kind === 'max' || isTestSet(session, week, nextSet)) return REST_TEST[session.lift];
  return REST[session.lift][restBand(prescription(session.kind, week).pct)];
}

// Greedy works because each plate set is listed heaviest first and every size is loadable.
export function platesPerSide(total, unit) {
  let side = (total - BAR[unit]) / 2;
  const plates = [];
  if (side <= 0) return plates;
  for (const p of PLATES[unit]) {
    while (side >= p - 1e-9) {
      plates.push(p);
      side = tidy(side - p);
    }
  }
  return plates;
}

// Warm-up ramps as a share of max; only the steps lighter than the day's working weight are used.
export const RAMP = [[0.5, '5'], [0.625, '3'], [0.75, '1–2'], [0.85, '1']];
// Before a re-max: five sets ending in two singles, or one for deadlift, which takes the most out of you.
export const REMAX_RAMP = { lift: [[0.4, '5'], [0.6, '3'], [0.7, '2'], [0.8, '1'], [0.87, '1']], deadlift: [[0.4, '5'], [0.6, '3'], [0.7, '2'], [0.8, '1']] };

export function warmups(max, working, unit, increment, ramp = RAMP) {
  const steps = [];
  // A step must sit at least two plate increments under the working weight to be worth a separate set.
  const ceiling = working - 2 * increment;
  for (const [pct, reps] of ramp) {
    const weight = roundTo(max * pct, increment);
    if (weight > BAR[unit] && weight <= ceiling && !steps.some((s) => s.weight === weight)) steps.push({ weight, reps });
  }
  return steps;
}

export function emptyState(unit = 'lb') {
  return { v: 3, unit, round: ROUNDING[unit][0], trainingMax: false, rest: 'sound', blocks: [], exercises: [], bodyweight: [] };
}

// Re-max every second block: often enough to keep the max honest, rare enough to spend most blocks training.
export const finishFor = (blockIndex) => FINISHES[blockIndex % 2];

// The days trained in a week. A re-max week only has the template days, which become the tests.
function weekDays(week, finish) {
  if (week !== FINISH_WEEK || finish !== 'remax') return SCHEDULE;
  return SCHEDULE.filter((s) => s.kind === 'base').map((s) => ({ ...s, kind: 'max' }));
}

// `sessions` only needs day, lift and kind, so a week can be rebuilt from itself.
function emptyWeek(week, sessions) {
  return sessions.map(({ day, lift, kind }) => {
    const sets = prescription(kind, week).sets;
    const session = { day, lift, kind, reps: Array(sets).fill(null), weight: null, skipped: false };
    if (kind === 'max') session.weights = Array(sets).fill(null);
    return session;
  });
}

export function newBlock(max, started, finish = 'remax') {
  return {
    started, finished: null, finish, lastTrained: null, breakSeen: null, max: { ...max },
    log: WEEKS.map((_, w) => emptyWeek(w, weekDays(w, finish))),
  };
}

const touched = (session) => session.skipped || session.reps.some((r) => r !== null) || session.weight !== null ||
  Boolean(session.weights?.some((w) => w !== null)) || Boolean(session.extras?.some((x) => x.skipped || x.sets.some(Boolean)));

// Switches week 8 between a re-max and a deload; only before anything in it is logged.
export function setFinish(block, finish) {
  if (block.finish === finish) return true;
  if (block.log[FINISH_WEEK].some(touched)) return false;
  block.finish = finish;
  block.log[FINISH_WEEK] = emptyWeek(FINISH_WEEK, weekDays(FINISH_WEEK, finish));
  return true;
}

export function sessionStatus(session) {
  if (session.skipped) return 'skipped';
  const logged = session.reps.filter((r) => r !== null).length;
  if (logged === session.reps.length) return 'done';
  return logged ? 'started' : 'todo';
}

const settled = (session) => ['done', 'skipped'].includes(sessionStatus(session));

export function weekProgress(block, week) {
  const sessions = block.log[week];
  return sessions.filter(settled).length / sessions.length;
}

// The first day that is neither finished nor skipped. A missed day waits here until it's done or skipped.
export function nextSession(block) {
  for (let w = 0; w < block.log.length; w++) {
    const index = block.log[w].findIndex((s) => !settled(s));
    if (index !== -1) return { week: w, index };
  }
  return null;
}

export function currentWeek(block) {
  return nextSession(block)?.week ?? block.log.length - 1;
}

// When most of last week was skipped and this week hasn't started, the advice is to repeat last week.
export function weekToRepeat(block) {
  const next = nextSession(block);
  if (!next || next.week === 0 || block.log[next.week].some(touched)) return null;
  const prev = block.log[next.week - 1];
  return prev.filter((s) => s.skipped).length * 2 > prev.length ? next.week - 1 : null;
}

export function resetWeek(block, week) {
  block.log[week] = emptyWeek(week, block.log[week]);
}

const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// After two or more weeks off, the advice is to restart the block at week 1.
export function longBreak(block, today) {
  if (!block.lastTrained || block.breakSeen === block.lastTrained) return 0;
  const next = nextSession(block);
  if (!next || next.week === 0) return 0;
  const days = dayNumber(today) - dayNumber(block.lastTrained);
  return days >= LONG_BREAK_DAYS ? days : 0;
}

export function restartBlock(block) {
  block.log = block.log.map((week, w) => emptyWeek(w, week));
  block.lastTrained = null;
}

// Re-max attempts of one lift: how many were judged, and the heaviest good one (or null).
function attemptsOf(block, sessions, liftId, state) {
  let judged = 0;
  let best = null;
  for (const s of sessions) {
    if (s.lift !== liftId || s.kind !== 'max' || s.skipped) continue;
    s.reps.forEach((r, i) => {
      if (r === null) return;
      judged += 1;
      const weight = setWeight(block, s, FINISH_WEEK, i, state);
      if (r === 1 && (best === null || weight > best)) best = weight;
    });
  }
  return { judged, best };
}

// Sets the next block's max, in order of evidence:
// 1. A good re-max single. If it's more than 5% under the week 6 estimate, call it an off day and
//    meet in the middle. A re-max with no good lift takes 95% of the estimate, to retest next block.
// 2. The week 6 test set, moving the second-wave max by its estimate.
// 3. With no test at all, weeks 4-6: clean adds the low step, one day with missed reps holds, two or more lower 5%.
// Skipped or untouched days are left out instead of counting as misses.
export function evaluateLift(block, liftId, state) {
  const misses = [];
  let performed = 0;
  let skipped = 0;
  block.log.forEach((week, w) => {
    if (w === FINISH_WEEK) return;
    for (const s of week) {
      if (s.lift !== liftId) continue;
      const target = prescription(s.kind, w).reps;
      const logged = s.reps.filter((r) => r !== null);
      if (s.skipped || logged.length === 0) {
        skipped += 1;
        continue;
      }
      performed += 1;
      const short = logged.filter((r) => r < target).length;
      const unlogged = s.reps.length - logged.length;
      if (short || unlogged) misses.push({ week: w, day: s.day, short, unlogged });
    }
  });
  const first = testResult(block, liftId, FIRST_TEST, state);
  const second = testResult(block, liftId, SECOND_TEST, state);
  const waveMax = weekMax(block, liftId, WAVE_TWO, state);
  const { judged, best } = attemptsOf(block, block.log[FINISH_WEEK], liftId, state);
  const result = { performed, skipped, misses, first, second, waveMax, judged, best };
  const done = (basis, suggested) => ({ ...result, basis, suggested, change: tidy(suggested - block.max[liftId]) });
  if (best !== null) {
    if (second && best < second.estimate * 0.95) return done('remax-off-day', roundTo((best + second.estimate) / 2, state.round));
    return done('remax', best);
  }
  if (judged) return done('remax-missed', roundTo((second?.estimate ?? waveMax) * 0.95, state.round));
  if (second) {
    const { change, value } = adjustMax(waveMax, second.estimate, liftId, state);
    return done(`test-${change}`, value);
  }
  const late = misses.filter((m) => m.week >= WAVE_TWO && m.week <= SECOND_TEST).length;
  const trained = block.log.slice(WAVE_TWO, SECOND_TEST + 1).flat()
    .some((s) => s.lift === liftId && !s.skipped && s.reps.some((r) => r !== null));
  if (late >= 2) return done('missed', roundTo(waveMax * 0.95, state.round));
  if (late === 1 || !trained) return done('hold', waveMax);
  return done('clean', tidy(waveMax + BUMPS[state.unit][liftId][0]));
}

// Week by week for one lift across every block: the max trained from, weight × reps lifted, and any
// tested result (an estimate from a test set, or a re-max single).
export function liftHistory(state, liftId) {
  return state.blocks.flatMap((b, block) => b.log.map((sessions, week) => {
    let volume = 0;
    let reps = 0;
    const tests = [];
    for (const s of sessions) {
      if (s.lift !== liftId || s.skipped) continue;
      s.reps.forEach((r, i) => {
        if (r === null) return;
        const weight = setWeight(b, s, week, i, state);
        // A re-max attempt logs 1 for a good lift and 0 for a miss, so a miss adds nothing.
        volume += weight * r;
        reps += r;
        if (isTestSet(s, week, i)) tests.push({ value: estimateMax(weight, r), weight, reps: r, kind: 'estimate' });
      });
    }
    const { best } = attemptsOf(b, sessions, liftId, state);
    if (best !== null) tests.push({ value: best, weight: best, reps: 1, kind: 'remax' });
    return { block, week, max: weekMax(b, liftId, week, state), volume: tidy(volume), reps, tests };
  }));
}

export function convertState(state, to) {
  if (state.unit === to) return state;
  const factor = to === 'kg' ? 1 / LB_PER_KG : LB_PER_KG;
  // Full precision so switching back and forth returns the original numbers; the screen rounds for display.
  const conv = (n) => (n === null ? null : n * factor);
  const extras = (list) => list.map((x) => ({ ...x, sets: x.sets.map((s) => s && { ...s, weight: conv(s.weight) }) }));
  const blocks = state.blocks.map((b) => ({
    ...b,
    max: Object.fromEntries(Object.entries(b.max).map(([k, v]) => [k, conv(v)])),
    log: b.log.map((week) => week.map((s) => ({
      ...s, weight: conv(s.weight), ...(s.weights && { weights: s.weights.map(conv) }), ...(s.extras && { extras: extras(s.extras) }),
    }))),
  }));
  return {
    ...state, unit: to, round: ROUNDING[to][0], blocks,
    ...(state.exercises && { exercises: state.exercises.map((e) => ({ ...e, step: conv(e.step) })) }),
    ...(state.bodyweight && { bodyweight: state.bodyweight.map((e) => ({ ...e, weight: conv(e.weight) })) }),
    ...(state.imported && { imported: state.imported.map((w) => ({ ...w, extras: extras(w.extras) })) }),
  };
}

const validReps = (reps, sets) =>
  Array.isArray(reps) && reps.length === sets && reps.every((r) => r === null || (Number.isInteger(r) && r >= 0));

const validWeight = (w) => w === null || w === undefined || (typeof w === 'number' && w > 0);

function validShell(s, version) {
  return Boolean(s) && typeof s === 'object' && s.v === version && s.unit in BAR &&
    ROUNDING[s.unit].includes(s.round) && Array.isArray(s.blocks) &&
    s.blocks.every((b) => LIFTS.every((l) => typeof b.max?.[l.id] === 'number' && b.max[l.id] > 0) && Array.isArray(b.log));
}

const sessionShape = (sess) => LIFTS.some((l) => l.id === sess?.lift) && DAYS.includes(sess.day) &&
  typeof sess.skipped === 'boolean' && validWeight(sess.weight);

function validSession(sess, w) {
  const p = WEEKS[w]?.[sess?.kind];
  if (!p || !sessionShape(sess) || !validReps(sess.reps, p.sets)) return false;
  // Re-max attempts are judged good (1) or not (0), each with its own weight.
  return sess.kind !== 'max' || (sess.reps.every((r) => r === null || r <= 1) &&
    Array.isArray(sess.weights) && sess.weights.length === p.sets && sess.weights.every(validWeight));
}

// Checks the shape of saved or restored data before it replaces the current log.
export function isValidState(s) {
  return validShell(s, 3) && typeof s.trainingMax === 'boolean' && REST_MODES.includes(s.rest) &&
    s.blocks.every((b) => FINISHES.includes(b.finish) && b.log.length === BLOCK_WEEKS &&
      b.log.every((week, w) => Array.isArray(week) && week.length > 0 && week.every((sess) => validSession(sess, w))) &&
      b.log[FINISH_WEEK].every((sess) => (sess.kind === 'max') === (b.finish === 'remax')));
}

// Version 2 blocks were weeks 1-3 of this wave plus an optional deload. Weeks 1-3 carry over as they
// are; the old deload week has no place in the new block. A finished block counts the rest as skipped.
const V2_SETS = { base: [3, 4, 5, 2], heavy: [3, 4, 3, 2] };

const isV2 = (s) => validShell(s, 2) && typeof s.trainingMax === 'boolean' &&
  s.blocks.every((b) => typeof b.deload === 'boolean' && b.log.length === (b.deload ? 4 : 3) &&
    b.log.every((week, w) => Array.isArray(week) && week.every((sess) =>
      sess?.kind in V2_SETS && sessionShape(sess) && validReps(sess.reps, V2_SETS[sess.kind][w]))));

function carryOver(old, firstWeeks, index) {
  const block = newBlock(old.max, old.started, finishFor(index));
  Object.assign(block, { finished: old.finished ?? null, lastTrained: old.lastTrained ?? null, breakSeen: old.breakSeen ?? null });
  firstWeeks.forEach((week, w) => { block.log[w] = week; });
  if (block.finished) {
    for (const week of block.log.slice(firstWeeks.length)) for (const sess of week) sess.skipped = true;
  }
  return block;
}

function fromV2(s) {
  const blocks = s.blocks.map((b, i) => carryOver(b, b.log.slice(0, FIRST_TEST + 1)
    .map((week) => week.map(({ day, lift, kind, reps, weight, skipped }) => ({ day, lift, kind, reps: [...reps], weight: weight ?? null, skipped }))), i));
  // Accessory data has no version of its own; it rides along and is checked by cleanExtras.
  const { exercises, bodyweight, imported } = s;
  return { v: 3, unit: s.unit, round: s.round, trainingMax: s.trainingMax, rest: 'sound', blocks, exercises, bodyweight, imported };
}

// Version 1 (the first release) had one session per lift per week and always a deload.
// Its sets move to that lift's template day; heavy days didn't exist yet, so in weeks already under
// way they count as skipped, not missed.
const V1_SETS = [3, 4, 5, 2];

function fromV1(s) {
  const blocks = s.blocks.map((b, i) => {
    const used = (w) => LIFTS.some((l) => b.log[w][l.id].reps.some((r) => r !== null) || b.log[w][l.id].weight);
    let lastUsed = -1;
    b.log.forEach((_, w) => { if (used(w)) lastUsed = w; });
    const weeks = newBlock(b.max, b.started).log.slice(0, FIRST_TEST + 1).map((week, w) => week.map((sess) => {
      if (sess.kind === 'heavy') return { ...sess, skipped: w <= lastUsed };
      return { ...sess, reps: [...b.log[w][sess.lift].reps], weight: b.log[w][sess.lift].weight ?? null };
    }));
    return carryOver(b, weeks, i);
  });
  return { v: 3, unit: s.unit, round: s.round, trainingMax: false, rest: 'sound', blocks };
}

export function upgrade(s) {
  if (isValidState(s)) return s;
  if (isV2(s)) return fromV2(s);
  const v1 = validShell(s, 1) && s.blocks.every((b) => b.log.length === 4 && b.log.every((week, w) =>
    LIFTS.every((l) => validReps(week?.[l.id]?.reps, V1_SETS[w]) && validWeight(week[l.id].weight))));
  return v1 ? fromV1(s) : null;
}
