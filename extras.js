// Accessory exercises: the lifter's own list, logged with each training day and progressed by rep range
// (double progression). No DOM access here so it can be tested in Node.
import { estimateMax, tidy } from './logic.js';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const EXTRA_DEFAULTS = { sets: 3, low: 8, high: 12, rest: 90 };
export const EXTRA_STEP = { lb: 5, kg: 2.5 };

let counter = 0;
const makeId = () => `x${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newExercise(fields) {
  return { id: makeId(), ...fields };
}

// The accessories shown on a training day: the day's list in order, then anything else logged with it.
export function dayExtras(state, session) {
  const listed = state.exercises.filter((e) => e.days.includes(session.day));
  const added = (session.extras ?? [])
    .map((x) => state.exercises.find((e) => e.id === x.exercise))
    .filter((e) => e && !listed.includes(e));
  return [...listed, ...added];
}

// The day's accessories in the order they're done: single exercises, and supersets as pairs. An exercise's
// `link` names the one it's supersetted with; the pair shows where the first of the two sits in the list.
export function dayGroups(state, session) {
  const list = dayExtras(state, session);
  const used = new Set();
  const groups = [];
  for (const e of list) {
    if (used.has(e.id)) continue;
    used.add(e.id);
    const partner = list.find((x) => !used.has(x.id) && (e.link === x.id || x.link === e.id));
    if (!partner) {
      groups.push([e]);
      continue;
    }
    used.add(partner.id);
    groups.push(e.link === partner.id ? [e, partner] : [partner, e]);
  }
  return groups;
}

// Pairs two exercises as a superset, `first` done before `second`. An exercise is in one superset at most,
// so any earlier pairing of either is undone. A null `second` just clears `first`'s pairing.
export function setLink(state, first, second) {
  for (const e of state.exercises) {
    if (e === first || (second && e === second)) e.link = null;
    else if (e.link === first.id || (second && e.link === second.id)) e.link = null;
  }
  if (second && second !== first) first.link = second.id;
}

// A superset's sets in the order they're done: one of each, round by round. `counts` gives each
// exercise's number of sets (0 when skipped today).
export function supersetOrder(counts) {
  const order = [];
  for (let set = 0; set < Math.max(...counts); set++) {
    counts.forEach((n, which) => { if (set < n) order.push({ which, set }); });
  }
  return order;
}

export const entryOf = (session, id) => session.extras?.find((x) => x.exercise === id) ?? null;

// Creates the day's record for an exercise the first time anything is logged against it.
export function ensureEntry(session, exercise, variant) {
  let entry = entryOf(session, exercise.id);
  if (!entry) {
    entry = { exercise: exercise.id, variant, skipped: false, sets: Array(exercise.sets).fill(null) };
    session.extras = [...(session.extras ?? []), entry];
  }
  return entry;
}

const done = (entry) => !entry.skipped && entry.sets.some(Boolean);

// Every logged appearance of one exercise, oldest first: imported workouts, then the blocks in order.
// `at` is [block, week, session] for logs made in the app, so "last time" can be found from any day.
export function exerciseHistory(state, id) {
  const out = [];
  for (const w of state.imported ?? []) {
    for (const x of w.extras) if (x.exercise === id && done(x)) out.push({ date: w.date, variant: x.variant, sets: x.sets.filter(Boolean), at: null });
  }
  state.blocks.forEach((b, bi) => b.log.forEach((week, wi) => week.forEach((s, si) => {
    for (const x of s.extras ?? []) {
      if (x.exercise === id && done(x)) out.push({ date: s.date ?? null, variant: x.variant, sets: x.sets.filter(Boolean), at: [bi, wi, si] });
    }
  })));
  return out;
}

const before = (at, here) => !at || at[0] < here[0] || (at[0] === here[0] && (at[1] < here[1] || (at[1] === here[1] && at[2] < here[2])));

// The most recent earlier session with this exercise and variant, or null.
export function lastTime(state, id, variant, here) {
  const earlier = exerciseHistory(state, id).filter((h) => h.variant === variant && before(h.at, here));
  return earlier[earlier.length - 1] ?? null;
}

// The variant to show when nothing is logged yet today: whatever was used last, else the first.
export function defaultVariant(state, exercise) {
  if (!exercise.variants.length) return null;
  const last = exerciseHistory(state, exercise.id).pop();
  return last && exercise.variants.includes(last.variant) ? last.variant : exercise.variants[0];
}

// Double progression: keep the weight and add a rep per set until every set reaches the top of the range,
// then add a step of weight and start again from the bottom. Body-weight work (logged as 0) just keeps
// adding reps.
export function suggestion(exercise, last) {
  const n = exercise.sets;
  if (!last) return { weights: Array(n).fill(null), reps: Array(n).fill(exercise.low), up: false };
  const sets = last.sets;
  const loaded = sets.some((s) => s.weight > 0);
  const up = loaded && sets.length >= n && sets.every((s) => s.reps >= exercise.high);
  if (up) {
    const weight = tidy(Math.max(...sets.map((s) => s.weight)) + exercise.step);
    return { weights: Array(n).fill(weight), reps: Array(n).fill(exercise.low), up };
  }
  const at = (i) => sets[Math.min(i, sets.length - 1)];
  const top = loaded ? exercise.high : 100;
  return {
    weights: Array.from({ length: n }, (_, i) => at(i).weight),
    reps: Array.from({ length: n }, (_, i) => Math.min(top, Math.max(exercise.low, (sets[i]?.reps ?? exercise.low - 1) + 1))),
    up,
  };
}

// The best of one session: estimated max for loaded sets, or most reps when it's all body weight.
export function sessionBest(sets) {
  const loaded = sets.filter((s) => s.weight > 0 && s.reps > 0);
  if (!loaded.length) return { value: Math.max(0, ...sets.map((s) => s.reps)), kind: 'reps' };
  return { value: Math.max(...loaded.map((s) => estimateMax(s.weight, s.reps))), kind: 'estimate' };
}

// Personal records for one variant: heaviest set, best estimated max, and the session with the most volume.
export function records(history) {
  let heaviest = null;
  let best = null;
  let volume = 0;
  for (const h of history) {
    for (const s of h.sets) {
      if (!heaviest || s.weight > heaviest.weight || (s.weight === heaviest.weight && s.reps > heaviest.reps)) heaviest = s;
      if (s.weight > 0 && s.reps > 0) {
        const e = estimateMax(s.weight, s.reps);
        if (!best || e > best.value) best = { value: e, ...s };
      }
    }
    volume = Math.max(volume, h.sets.reduce((sum, s) => sum + s.weight * s.reps, 0));
  }
  return { heaviest, best, volume: tidy(volume) };
}

// Body weight entries stay one per day, oldest first.
export function logBodyweight(state, date, weight) {
  state.bodyweight = [...state.bodyweight.filter((e) => e.date !== date), { date, weight }]
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- Checks on saved data ----------

const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

function validExercise(e) {
  return Boolean(e) && typeof e.id === 'string' && /^[a-z0-9]{1,24}$/.test(e.id) && text(e.name, 60) &&
    Array.isArray(e.variants) && e.variants.length <= 8 && e.variants.every((v) => text(v, 40)) &&
    int(e.sets, 1, 10) && int(e.low, 1, 50) && int(e.high, e.low, 50) &&
    typeof e.step === 'number' && e.step > 0 && e.step <= 100 && int(e.rest, 15, 900) &&
    Array.isArray(e.days) && e.days.every((d) => WEEKDAYS.includes(d)) &&
    (e.link === undefined || e.link === null || (typeof e.link === 'string' && /^[a-z0-9]{1,24}$/.test(e.link) && e.link !== e.id));
}

const validSet = (s) => s === null || (Boolean(s) && typeof s.weight === 'number' && s.weight >= 0 && s.weight < 5000 && int(s.reps, 0, 100));

const validEntry = (x) => Boolean(x) && typeof x.exercise === 'string' && (x.variant === null || text(x.variant, 40)) &&
  typeof x.skipped === 'boolean' && Array.isArray(x.sets) && x.sets.length <= 20 && x.sets.every(validSet);

// Drops anything malformed in the accessory data instead of rejecting the whole log, and fills in the
// fields older logs don't have.
export function cleanExtras(state) {
  state.exercises = Array.isArray(state.exercises) ? state.exercises.filter(validExercise) : [];
  state.bodyweight = Array.isArray(state.bodyweight)
    ? state.bodyweight.filter((e) => e && isDate(e.date) && typeof e.weight === 'number' && e.weight > 0) : [];
  if (state.imported !== undefined) {
    state.imported = Array.isArray(state.imported)
      ? state.imported.filter((w) => w && isDate(w.date) && Array.isArray(w.extras)).map((w) => ({ ...w, extras: w.extras.filter(validEntry) })) : [];
  }
  for (const b of state.blocks) {
    for (const week of b.log) {
      for (const s of week) {
        if (s.extras !== undefined) s.extras = Array.isArray(s.extras) ? s.extras.filter(validEntry) : [];
        if (s.date !== undefined && !isDate(s.date)) delete s.date;
      }
    }
  }
  return state;
}
