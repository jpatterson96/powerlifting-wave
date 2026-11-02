// Program rules: the 4-week wave template plus research-based changes. No DOM access here so it can be tested in Node.

export const LIFTS = [
  { id: 'squat', name: 'Squat', short: 'Squat' },
  { id: 'bench', name: 'Bench press', short: 'Bench' },
  { id: 'deadlift', name: 'Deadlift', short: 'Deadlift' },
];

// "base" is the template wave. "heavy" is the second weekly bench and squat session: fewer reps at
// heavier loads, since loads above ~80% build max strength best. Week 4 is the optional deload.
export const PLAN = {
  base: [
    { sets: 3, reps: 6, pct: 0.70 },
    { sets: 4, reps: 4, pct: 0.75 },
    { sets: 5, reps: 2, pct: 0.825 },
  ],
  heavy: [
    { sets: 3, reps: 4, pct: 0.775 },
    { sets: 4, reps: 3, pct: 0.825 },
    { sets: 3, reps: 2, pct: 0.875 },
  ],
};
export const DELOAD = { sets: 2, reps: 5, pct: 0.60 };
export const DELOAD_WEEK = 3;

export const WEEKS = [
  { name: 'Accumulation', note: 'High volume' },
  { name: 'Intensification', note: 'Moderate volume and weight' },
  { name: 'Realization', note: 'Heavy peak' },
  { name: 'Deload', note: 'Recovery' },
];

export const prescription = (kind, week) => (week === DELOAD_WEEK ? DELOAD : PLAN[kind][week]);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The lifter's own week. Thursday and Friday are the heavier repeat sessions of bench and squat.
export const SCHEDULE = [
  { day: 'Monday', lift: 'bench', kind: 'base' },
  { day: 'Tuesday', lift: 'squat', kind: 'base' },
  { day: 'Wednesday', lift: 'deadlift', kind: 'base' },
  { day: 'Thursday', lift: 'bench', kind: 'heavy' },
  { day: 'Friday', lift: 'squat', kind: 'heavy' },
];

// The last set of each template session in week 3 is the test set: as many clean reps as possible.
// Extra reps there decide the next block's increase.
export const TEST_WEEK = 2;
export const isTestSet = (session, week, set) =>
  week === TEST_WEEK && session.kind === 'base' && set === session.reps.length - 1;

// Increase to the 1RM for 1, 2, or 3+ extra reps on the test set (low, middle, top of the template's range).
// Only the target reps there means the max is likely set too high, so it holds instead.
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

// Warm-up ramp as a share of max; only the steps lighter than the day's working weight are used.
const WARMUPS = [[0.5, '5'], [0.625, '3'], [0.75, '1–2'], [0.85, '1']];

export function warmups(max, working, unit, increment) {
  const steps = [];
  // A step must sit at least two plate increments under the working weight to be worth a separate set.
  const ceiling = working - 2 * increment;
  for (const [pct, reps] of WARMUPS) {
    const weight = roundTo(max * pct, increment);
    if (weight > BAR[unit] && weight <= ceiling && !steps.some((s) => s.weight === weight)) steps.push({ weight, reps });
  }
  return steps;
}

export function emptyState(unit = 'lb') {
  return { v: 2, unit, round: ROUNDING[unit][0], trainingMax: false, blocks: [] };
}

// `sessions` only needs day, lift and kind, so a week can be rebuilt from itself.
function emptyWeek(week, sessions = SCHEDULE) {
  return sessions.map(({ day, lift, kind }) => ({
    day, lift, kind, reps: Array(prescription(kind, week).sets).fill(null), weight: null, skipped: false,
  }));
}

export function newBlock(max, started, { deload = false, schedule = SCHEDULE } = {}) {
  const weeks = deload ? 4 : 3;
  return {
    started, finished: null, deload, lastTrained: null, breakSeen: null, max: { ...max },
    log: Array.from({ length: weeks }, (_, w) => emptyWeek(w, schedule)),
  };
}

const touched = (session) => session.skipped || session.reps.some((r) => r !== null) || session.weight !== null;

// Adds or removes the deload week. Removing only works before anything is logged in it.
export function setDeload(block, on) {
  if (on && !block.deload) {
    block.log.push(emptyWeek(DELOAD_WEEK, block.log[0]));
    block.deload = true;
  } else if (!on && block.deload && !block.log[DELOAD_WEEK].some(touched)) {
    block.log.pop();
    block.deload = false;
  }
  return block.deload === on;
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

// Judges weeks 1-3. Skipped or untouched days are left out instead of counting as misses.
export function evaluateLift(block, liftId, unit) {
  const misses = [];
  let performed = 0;
  let skipped = 0;
  let extra = 0;
  let tested = false;
  for (let w = 0; w < Math.min(block.log.length, DELOAD_WEEK); w++) {
    for (const s of block.log[w]) {
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
      const last = s.reps[s.reps.length - 1];
      if (isTestSet(s, w, s.reps.length - 1) && last !== null) {
        tested = true;
        extra = Math.max(extra, last - target);
      }
    }
  }
  const passed = performed > 0 && misses.length === 0;
  // With no test set logged (that day skipped), the template's low step applies.
  const tier = tested ? Math.min(extra, 3) - 1 : 0;
  const bump = passed && tier >= 0 ? BUMPS[unit][liftId][tier] : 0;
  return { passed, performed, skipped, misses, extra, tested, bump, suggested: tidy(block.max[liftId] + bump) };
}

export function convertState(state, to) {
  if (state.unit === to) return state;
  const factor = to === 'kg' ? 1 / LB_PER_KG : LB_PER_KG;
  // Full precision so switching back and forth returns the original numbers; the screen rounds for display.
  const conv = (n) => (n === null ? null : n * factor);
  const blocks = state.blocks.map((b) => ({
    ...b,
    max: Object.fromEntries(Object.entries(b.max).map(([k, v]) => [k, conv(v)])),
    log: b.log.map((week) => week.map((s) => ({ ...s, weight: conv(s.weight) }))),
  }));
  return { ...state, unit: to, round: ROUNDING[to][0], blocks };
}

const validReps = (reps, sets) =>
  Array.isArray(reps) && reps.length === sets && reps.every((r) => r === null || (Number.isInteger(r) && r >= 0));

const validWeight = (w) => w === null || w === undefined || (typeof w === 'number' && w > 0);

function validShell(s, version) {
  return Boolean(s) && typeof s === 'object' && s.v === version && s.unit in BAR &&
    ROUNDING[s.unit].includes(s.round) && Array.isArray(s.blocks) &&
    s.blocks.every((b) => LIFTS.every((l) => typeof b.max?.[l.id] === 'number' && b.max[l.id] > 0) && Array.isArray(b.log));
}

const validSession = (sess, w) =>
  LIFTS.some((l) => l.id === sess?.lift) && DAYS.includes(sess.day) && sess.kind in PLAN &&
  typeof sess.skipped === 'boolean' && validReps(sess.reps, prescription(sess.kind, w).sets) && validWeight(sess.weight);

// Checks the shape of saved or restored data before it replaces the current log.
export function isValidState(s) {
  return validShell(s, 2) && typeof s.trainingMax === 'boolean' && s.blocks.every((b) =>
    typeof b.deload === 'boolean' && b.log.length === (b.deload ? 4 : 3) &&
    b.log.every((week, w) => Array.isArray(week) && week.length > 0 && week.every((sess) => validSession(sess, w))));
}

// Version 1 (the first release) had one session per lift per week and always a deload.
// Its sets move to that lift's template day.
const V1_SETS = [3, 4, 5, 2];

export function upgrade(s) {
  if (isValidState(s)) return s;
  const v1 = validShell(s, 1) && s.blocks.every((b) => b.log.length === 4 && b.log.every((week, w) =>
    LIFTS.every((l) => validReps(week?.[l.id]?.reps, V1_SETS[w]) && validWeight(week[l.id].weight))));
  if (!v1) return null;
  const blocks = s.blocks.map((b) => {
    const block = newBlock(b.max, b.started, { deload: true });
    block.finished = b.finished ?? null;
    // Heavy days didn't exist yet, so in weeks already under way they count as skipped, not missed.
    const used = (w) => LIFTS.some((l) => b.log[w][l.id].reps.some((r) => r !== null) || b.log[w][l.id].weight);
    let lastUsed = -1;
    b.log.forEach((_, w) => { if (used(w)) lastUsed = w; });
    block.log.forEach((week, w) => {
      for (const l of LIFTS) {
        const day = week.find((sess) => sess.lift === l.id && sess.kind === 'base');
        day.reps = [...b.log[w][l.id].reps];
        day.weight = b.log[w][l.id].weight ?? null;
      }
      if (w <= lastUsed) for (const sess of week) if (sess.kind === 'heavy') sess.skipped = true;
    });
    return block;
  });
  return { ...s, v: 2, trainingMax: false, blocks };
}
