// Accessory exercises: the lifter's own list, logged with each training day and progressed by rep range
// (double progression). No DOM access here so it can be tested in Node.
import { LIFTS, BAR, FINISH_WEEK, estimateMax, tidy } from './logic.js';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const EXTRA_DEFAULTS = { sets: 3, low: 8, high: 12, rest: 90 };
export const EXTRA_STEP = { lb: 5, kg: 2.5 };

// What a muscle gets credit for in the weekly set count. Each exercise names one; the main lifts count
// toward the muscle they train most.
export const MUSCLES = ['Chest', 'Shoulders', 'Triceps', 'Back', 'Biceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Other'];
export const LIFT_MUSCLE = { bench: 'Chest', squat: 'Quads', deadlift: 'Back' };

// How an exercise is loaded with plates, and what's on before them: plate math uses it.
export const LOADS = {
  barbell: { name: 'barbell', bar: BAR },
  ez: { name: 'EZ bar', bar: { lb: 25, kg: 10 } },
  machine: { name: 'plate-loaded machine', bar: { lb: 0, kg: 0 } },
};

// Weeks 7 and 8 (the taper, then the re-max or deload) cut accessories to half the sets at the same
// weights and reps, so the main lifts are fresh. They're never "last time" for progressing afterwards.
export const isLightWeek = (week) => week >= FINISH_WEEK - 1;
export const plannedSets = (exercise, week) => (isLightWeek(week) ? Math.ceil(exercise.sets / 2) : exercise.sets);

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

// Creates the day's record for an exercise the first time anything is logged against it, with `count` sets.
export function ensureEntry(session, exercise, variant, count = exercise.sets) {
  let entry = entryOf(session, exercise.id);
  if (!entry) {
    entry = { exercise: exercise.id, variant, skipped: false, sets: Array(count).fill(null) };
    session.extras = [...(session.extras ?? []), entry];
  }
  return entry;
}

const done = (entry) => !entry.skipped && entry.sets.some(Boolean);

// Ends a training day's accessories: one not started is skipped, and one stopped partway keeps just the
// sets logged. Returns how many it changed.
export function finishExtras(state, session) {
  let changed = 0;
  for (const e of dayExtras(state, session)) {
    const entry = entryOf(session, e.id);
    if (entry?.skipped || (entry && entry.sets.every(Boolean))) continue;
    const logged = entry ? entry.sets.filter(Boolean) : [];
    if (logged.length) entry.sets = logged;
    else ensureEntry(session, e, entry?.variant ?? defaultVariant(state, e)).skipped = true;
    changed++;
  }
  return changed;
}

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

// The most recent earlier session with this exercise and variant, or null. `full` passes over the lighter
// weeks, for the session to progress from.
export function lastTime(state, id, variant, here, full = false) {
  const earlier = exerciseHistory(state, id)
    .filter((h) => h.variant === variant && before(h.at, here) && !(full && h.at && isLightWeek(h.at[1])));
  return earlier[earlier.length - 1] ?? null;
}

// Whether a day's sets beat every earlier session of the same variant: a higher estimated max, or more reps
// for body-weight work. A first time isn't a best.
export function isNewBest(state, id, variant, here, sets) {
  const earlier = exerciseHistory(state, id).filter((h) => h.variant === variant && before(h.at, here));
  if (!earlier.length || !sets.length) return false;
  const today = sessionBest(sets);
  return earlier.every((h) => {
    const was = sessionBest(h.sets);
    return was.kind !== today.kind || today.value > was.value;
  }) && earlier.some((h) => sessionBest(h.sets).kind === today.kind);
}

// The variant to show when nothing is logged yet today: whatever was used last, else the first.
export function defaultVariant(state, exercise) {
  if (!exercise.variants.length) return null;
  const last = exerciseHistory(state, exercise.id).pop();
  return last && exercise.variants.includes(last.variant) ? last.variant : exercise.variants[0];
}

// Double progression: keep the weight and add a rep per set until every set reaches the top of the range,
// then add a step of weight and start again from the bottom. Body-weight work (logged as 0) just keeps
// adding reps. In a lighter week it's fewer sets, repeating last time.
export function suggestion(exercise, last, week = 0) {
  const n = plannedSets(exercise, week);
  const light = isLightWeek(week);
  if (!last) return { weights: Array(n).fill(null), reps: Array(n).fill(exercise.low), up: false };
  const sets = last.sets;
  const loaded = sets.some((s) => s.weight > 0);
  const up = !light && loaded && sets.length >= exercise.sets && sets.every((s) => s.reps >= exercise.high);
  if (up) {
    const weight = tidy(Math.max(...sets.map((s) => s.weight)) + exercise.step);
    return { weights: Array(n).fill(weight), reps: Array(n).fill(exercise.low), up };
  }
  const at = (i) => sets[Math.min(i, sets.length - 1)];
  const top = loaded ? exercise.high : 100;
  return {
    weights: Array.from({ length: n }, (_, i) => at(i).weight),
    reps: Array.from({ length: n }, (_, i) => Math.min(top, Math.max(exercise.low, light ? at(i).reps : (sets[i]?.reps ?? exercise.low - 1) + 1))),
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

// Hard sets per muscle in one training week: the main lift's logged sets and every accessory set logged.
// An exercise with no muscle counts under null.
export function muscleSets(state, sessions) {
  const count = new Map();
  const add = (muscle, n) => n && count.set(muscle, (count.get(muscle) ?? 0) + n);
  for (const s of sessions) {
    if (!s.skipped) add(LIFT_MUSCLE[s.lift], s.reps.filter((r) => r !== null).length);
    for (const x of s.extras ?? []) {
      if (!x.skipped) add(state.exercises.find((e) => e.id === x.exercise)?.muscle ?? null, x.sets.filter(Boolean).length);
    }
  }
  return count;
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

// A muscle or plate setting that isn't one of the choices is dropped, keeping the exercise.
function cleanChoices(e) {
  if (e && e.muscle !== undefined && e.muscle !== null && !MUSCLES.includes(e.muscle)) delete e.muscle;
  if (e && e.plates !== undefined && e.plates !== null && !(typeof e.plates === 'string' && Object.hasOwn(LOADS, e.plates))) delete e.plates;
  return e;
}

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

const LIFT_IDS = LIFTS.map((l) => l.id);
const validMax = (n) => typeof n === 'number' && n > 0 && n < 5000;

// Drops anything malformed in the optional data (accessories, body weight, earlier maxes and the days maxes
// were set) instead of rejecting the whole log, and fills in the fields older logs don't have.
export function cleanExtras(state) {
  state.exercises = Array.isArray(state.exercises) ? state.exercises.map(cleanChoices).filter(validExercise) : [];
  state.bodyweight = Array.isArray(state.bodyweight)
    ? state.bodyweight.filter((e) => e && isDate(e.date) && typeof e.weight === 'number' && e.weight > 0) : [];
  if (state.imported !== undefined) {
    state.imported = Array.isArray(state.imported)
      ? state.imported.filter((w) => w && isDate(w.date) && Array.isArray(w.extras)).map((w) => ({ ...w, extras: w.extras.filter(validEntry) })) : [];
  }
  if (state.pastMaxes !== undefined) {
    state.pastMaxes = Array.isArray(state.pastMaxes)
      ? state.pastMaxes.filter((p) => p && isDate(p.date) && LIFT_IDS.includes(p.lift) && validMax(p.value)) : [];
  }
  for (const b of state.blocks) {
    if (b.maxDates !== undefined) {
      const dates = b.maxDates && typeof b.maxDates === 'object'
        ? Object.fromEntries(LIFT_IDS.filter((id) => isDate(b.maxDates[id])).map((id) => [id, b.maxDates[id]])) : {};
      if (Object.keys(dates).length) b.maxDates = dates;
      else delete b.maxDates;
    }
    for (const week of b.log) {
      for (const s of week) {
        if (s.extras !== undefined) s.extras = Array.isArray(s.extras) ? s.extras.filter(validEntry) : [];
        if (s.date !== undefined && !isDate(s.date)) delete s.date;
      }
    }
  }
  return state;
}
