// Program rules from the 4-week wave template. No DOM access here so it can be tested in Node.

export const LIFTS = [
  { id: 'squat', name: 'Squat', short: 'Squat' },
  { id: 'bench', name: 'Bench press', short: 'Bench' },
  { id: 'deadlift', name: 'Deadlift', short: 'Deadlift' },
];

export const WEEKS = [
  { name: 'Accumulation', note: 'High volume', sets: 3, reps: 6, pct: 0.70 },
  { name: 'Intensification', note: 'Moderate volume and weight', sets: 4, reps: 4, pct: 0.75 },
  { name: 'Realization', note: 'Heavy peak', sets: 5, reps: 2, pct: 0.825 },
  { name: 'Deload', note: 'Recovery', sets: 2, reps: 5, pct: 0.50 },
];

// The last set of week 3 is the test set: extra reps there decide the next block's increase.
export const HEAVY_WEEK = 2;
export const HEAVY_SET = WEEKS[HEAVY_WEEK].sets - 1;

// Increase to the 1RM for 0, 1, or 2+ extra reps on the test set (low, middle, top of the template's range).
export const BUMPS = {
  lb: { squat: [5, 7.5, 10], bench: [2.5, 3.75, 5], deadlift: [5, 7.5, 10] },
  kg: { squat: [2.5, 3.75, 5], bench: [1.25, 2, 2.5], deadlift: [2.5, 3.75, 5] },
};

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

export function targetWeight(max, week, increment) {
  return roundTo(max * WEEKS[week].pct, increment);
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

export function emptyLog() {
  return WEEKS.map((w) =>
    Object.fromEntries(LIFTS.map((l) => [l.id, { reps: Array(w.sets).fill(null), weight: null }])),
  );
}

export function newBlock(max, started) {
  return { started, finished: null, max: { ...max }, log: emptyLog() };
}

export function weekProgress(block, week) {
  let done = 0;
  let total = 0;
  for (const l of LIFTS) {
    for (const r of block.log[week][l.id].reps) {
      total += 1;
      if (r !== null) done += 1;
    }
  }
  return done / total;
}

// The first week that still has an unlogged set, or the deload week once everything is in.
export function currentWeek(block) {
  for (let w = 0; w < WEEKS.length; w++) {
    if (weekProgress(block, w) < 1) return w;
  }
  return WEEKS.length - 1;
}

export function evaluateLift(block, liftId, unit) {
  const misses = [];
  for (let w = 0; w < WEEKS.length - 1; w++) {
    const reps = block.log[w][liftId].reps;
    const short = reps.filter((r) => r !== null && r < WEEKS[w].reps).length;
    const unlogged = reps.filter((r) => r === null).length;
    if (short || unlogged) misses.push({ week: w, short, unlogged });
  }
  const heavy = block.log[HEAVY_WEEK][liftId].reps[HEAVY_SET];
  const extra = heavy === null ? 0 : Math.max(0, heavy - WEEKS[HEAVY_WEEK].reps);
  const passed = misses.length === 0;
  const bump = passed ? BUMPS[unit][liftId][Math.min(extra, 2)] : 0;
  return { passed, misses, extra, bump, suggested: tidy(block.max[liftId] + bump) };
}

export function convertState(state, to) {
  if (state.unit === to) return state;
  const factor = to === 'kg' ? 1 / LB_PER_KG : LB_PER_KG;
  // Full precision so switching back and forth returns the original numbers; the screen rounds for display.
  const conv = (n) => (n === null ? null : n * factor);
  const blocks = state.blocks.map((b) => ({
    ...b,
    max: Object.fromEntries(Object.entries(b.max).map(([k, v]) => [k, conv(v)])),
    log: b.log.map((week) =>
      Object.fromEntries(Object.entries(week).map(([k, v]) => [k, { ...v, weight: conv(v.weight) }])),
    ),
  }));
  return { ...state, unit: to, round: ROUNDING[to][0], blocks };
}

// Checks the shape of a restored backup before it replaces the current data.
export function isValidState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return false;
  if (!(s.unit in BAR) || !ROUNDING[s.unit].includes(s.round)) return false;
  if (!Array.isArray(s.blocks)) return false;
  return s.blocks.every(
    (b) =>
      LIFTS.every((l) => typeof b.max?.[l.id] === 'number' && b.max[l.id] > 0) &&
      Array.isArray(b.log) &&
      b.log.length === WEEKS.length &&
      b.log.every((week, w) =>
        LIFTS.every(
          (l) =>
            Array.isArray(week?.[l.id]?.reps) &&
            week[l.id].reps.length === WEEKS[w].sets &&
            week[l.id].reps.every((r) => r === null || (Number.isInteger(r) && r >= 0)),
        ),
      ),
  );
}
