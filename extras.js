// Accessory exercises: the lifter's own list, logged with each training day and progressed by rep range
// (double progression). No DOM access here so it can be tested in Node.
import { LIFTS, SCHEDULE, BAR, PLATES, FEELS, FINISH_WEEK, estimateMax, tidy, roundTo } from './logic.js';
import { picKeys } from './pics.js';
import { MUSCLES, LIFT_MUSCLES, isOldMuscle, fillMuscles, creditsOf } from './muscles.js';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// The week's three kinds of day, named for their lift: Monday and Thursday share their accessories (bench),
// as do Tuesday and Friday (squat), and Wednesday (deadlift) is on its own.
export const DAY_KINDS = SCHEDULE.reduce((kinds, s) => {
  const kind = kinds.find((k) => k.lift === s.lift);
  if (kind) kind.days.push(s.day);
  else kinds.push({ lift: s.lift, days: [s.day] });
  return kinds;
}, []);
export const EXTRA_DEFAULTS = { sets: 3, low: 8, high: 12, rest: 90 };
export const EXTRA_STEP = { lb: 5, kg: 2.5 };

// How an exercise is loaded with plates, and what's on before them: plate math uses it.
export const LOADS = {
  barbell: { name: 'barbell', bar: BAR },
  ez: { name: 'EZ bar', bar: { lb: 25, kg: 10 } },
  machine: { name: 'plate-loaded machine', bar: { lb: 0, kg: 0 } },
};
// An exercise counted in plates (`counted`) is logged as the plates on each side, not a weight. The whole
// number is big plates and the tenth is small ones on top: .5 is a half plate and each .1 a small one, so
// in lb 2.5 is 45 + 45 + 25, 2.2 is 45 + 45 + 10 + 10 and 2.7 is 45 + 45 + 25 + 10 + 10.
// It's a field of its own so older versions of the app pass it through untouched.
export const PLATE = { lb: 45, kg: 20 };
export const SMALL_PLATES = { lb: { half: 25, tenth: 10 }, kg: { half: 10, tenth: 5 } };
export const isCounted = (exercise) => exercise?.counted === true;

// The plates on one side for a count, heaviest first.
export function countedPlates(count, unit) {
  const tenths = Math.round(count * 10);
  const small = tenths % 10;
  const { half, tenth } = SMALL_PLATES[unit];
  return [...Array(Math.floor(tenths / 10)).fill(PLATE[unit]), ...(small >= 5 ? [half] : []), ...Array(small % 5).fill(tenth)];
}

// What a logged number weighs, to compare and estimate with: one side's plates for an exercise counted in
// plates (the count alone doesn't order, as 2.3 is heavier than 2.5), else the weight.
export const weightOf = (exercise, weight, unit) => (isCounted(exercise) ? countedPlates(weight, unit).reduce((a, p) => a + p, 0) : weight);
// The weight a logged number stands for, for volume: plates a side count on both sides.
export const loadOf = (exercise, weight, unit) => (isCounted(exercise) ? 2 * weightOf(exercise, weight, unit) : weight);

// The lifter loads nothing of 10 lb or less, so a number that small is plates a side typed as a count
// (3 is 45 + 45 + 45, 2.5 is 45 + 45 + 25), never a weight; 0 stays body weight. Only in lb: in kg, 2.5 and
// 7.5 are everyday weights.
export const PLATES_UP_TO = 10;
export const looksCounted = (state, exercise, weight) =>
  !isCounted(exercise) && state.unit === 'lb' && typeof weight === 'number' && weight > 0 && weight <= PLATES_UP_TO;

// Switches an exercise to plates a side. Logged numbers stay as they are, so switching back in the editor
// reads them as weights again. Someone typing counts uses the small plates, so it goes up half a plate at a time.
export const GUESSED_STEP = 0.5;
export function countInPlates(exercise) {
  Object.assign(exercise, { counted: true, plates: null, step: GUESSED_STEP });
}

// Weeks 7 and 8 (the taper, then the re-max or deload) cut accessories to half the sets at the same
// weights and reps, so the main lifts are fresh. They're never "last time" for progressing afterwards.
export const isLightWeek = (week) => week >= FINISH_WEEK - 1;
export const plannedSets = (exercise, week) => (isLightWeek(week) ? Math.ceil(exercise.sets / 2) : exercise.sets);

let counter = 0;
const makeId = () => `x${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newExercise(fields) {
  return { id: makeId(), ...fields };
}

// An exercise on a break (`paused`) keeps its days, settings and log but is on no day's list until it's brought
// back. It's a field of its own so its days are still there to come back to, and older versions of the app pass
// it through untouched.
export const isPaused = (exercise) => exercise?.paused === true;
// Whether an exercise is on a day's list.
export const onDay = (exercise, day) => !isPaused(exercise) && exercise.days.includes(day);
// The exercises on a break that would otherwise be on a day's list.
export const pausedOn = (state, day) => state.exercises.filter((e) => isPaused(e) && e.days.includes(day));

// The accessories shown on a training day: the day's list in order, then anything else logged with it (so one
// on a break still shows on the days it was logged).
export function dayExtras(state, session) {
  const listed = state.exercises.filter((e) => onDay(e, session.day));
  const added = (session.extras ?? [])
    .map((x) => state.exercises.find((e) => e.id === x.exercise))
    .filter((e) => e && !listed.includes(e));
  return [...listed, ...added];
}

// The exercise list split by kind of day, for Settings: each kind lists, in list order, every exercise on
// one of its days, and anything with no days comes last under a null lift. An exercise on two kinds of
// day is listed under both.
export function exercisesByDay(state) {
  const kinds = DAY_KINDS.map((k) => ({ ...k, exercises: state.exercises.filter((e) => e.days.some((d) => k.days.includes(d))) }));
  const unset = state.exercises.filter((e) => !e.days.length);
  return unset.length ? [...kinds, { lift: null, days: [], exercises: unset }] : kinds;
}

// Moves an exercise one place up (by -1) or down (by 1) among `among`, some of the list in list order, by
// putting it just past the neighbour it steps over. The one list orders every day, so it may pass exercises
// of other days on the way. Returns false at the end of `among`.
export function moveExercise(state, exercise, by, among = state.exercises) {
  const k = among.indexOf(exercise);
  const over = k < 0 ? null : among[k + by];
  if (!over) return false;
  const rest = state.exercises.filter((e) => e !== exercise);
  rest.splice(rest.indexOf(over) + (by > 0 ? 1 : 0), 0, exercise);
  state.exercises = rest;
  return true;
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

// Remembers the order the lifter works in. Once a day's accessories are done or skipped, the ones done (a
// superset as one) take the places in the day's list that done ones held, in the order each was started, so the
// next day of that kind lists them that way. Anything skipped or left keeps its place, as a skip says nothing
// about order. The list's places held by other days' exercises don't change. A day with a later one of its kind
// already logged is old news and teaches nothing. True when the day's order changed.
export function learnOrder(state, session) {
  if (!session.date) return false;
  const kind = DAY_KINDS.find((k) => k.days.includes(session.day));
  const logged = (s) => s.extras?.some((x) => !x.skipped && x.sets.some(Boolean));
  const newer = state.blocks.some((b) => b.log.flat().some((s) => s !== session && s.date > session.date && kind?.days.includes(s.day) && logged(s)));
  if (!kind || newer) return false;
  const groups = dayGroups(state, { day: session.day });
  const started = (g) => g.flatMap((e) => entryOf(session, e.id)?.sets.filter(Boolean).map((s) => s.at) ?? []).filter(Boolean).sort()[0];
  const done = groups.map((g, k) => ({ g, k, at: started(g) })).filter((x) => x.at);
  const order = [...done].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.k - b.k));
  if (order.every((x, n) => x === done[n])) return false;
  const next = [...groups];
  done.forEach((x, n) => { next[x.k] = order[n].g; });
  const places = groups.flat().map((e) => state.exercises.indexOf(e)).sort((a, b) => a - b);
  const list = [...state.exercises];
  next.flat().forEach((e, n) => { list[places[n]] = e; });
  state.exercises = list;
  return true;
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

// Every earlier session with this exercise and variant, oldest first. `full` passes over the lighter weeks, for
// the sessions to progress from.
export function earlierTimes(state, id, variant, here, full = false) {
  return exerciseHistory(state, id)
    .filter((h) => h.variant === variant && before(h.at, here) && !(full && h.at && isLightWeek(h.at[1])));
}

// The most recent earlier session with this exercise and variant, or null.
export function lastTime(state, id, variant, here, full = false) {
  return earlierTimes(state, id, variant, here, full).pop() ?? null;
}

// Whether a day's sets beat every earlier session of the same variant: a higher estimated max, or more reps
// for body-weight work. A first time isn't a best.
export function isNewBest(state, id, variant, here, sets) {
  const earlier = exerciseHistory(state, id).filter((h) => h.variant === variant && before(h.at, here));
  if (!earlier.length || !sets.length) return false;
  const exercise = state.exercises.find((e) => e.id === id);
  const best = (list) => sessionBest(list, exercise, state.unit);
  const today = best(sets);
  return earlier.every((h) => {
    const was = best(h.sets);
    return was.kind !== today.kind || today.value > was.value;
  }) && earlier.some((h) => best(h.sets).kind === today.kind);
}

// The variant to show when nothing is logged yet today: whatever was used last, else the first.
export function defaultVariant(state, exercise) {
  if (!exercise.variants.length) return null;
  const last = exerciseHistory(state, exercise.id).pop();
  return last && exercise.variants.includes(last.variant) ? last.variant : exercise.variants[0];
}

// Two sessions in a row at one weight that average under the bottom of the range take it down about this much.
export const DROP = 0.1;

const heaviestSet = (sets, exercise, unit) =>
  sets.reduce((a, s) => (weightOf(exercise, s.weight, unit) > weightOf(exercise, a.weight, unit) ? s : a));
const fellShort = (sets, exercise) => sets.reduce((sum, s) => sum + s.reps, 0) < exercise.low * sets.length;

// A logged number less `drop`, or null when that's body weight or less, or in lb a number only typed as plates a
// side (see looksCounted).
function lowered(exercise, weight, drop, unit) {
  const floor = isCounted(exercise) || unit !== 'lb' ? 0 : PLATES_UP_TO;
  return weight - drop > floor ? tidy(weight - drop) : null;
}

// The first weight added to body-weight work: the exercise's jump, but in lb never a number only typed as plates a
// side, so at least the smallest plate over 10 lb the lifter has (a belt or vest takes plates).
export function addedWeight(exercise, unit, sizes = PLATES[unit]) {
  if (isCounted(exercise) || unit !== 'lb' || exercise.step > PLATES_UP_TO) return exercise.step;
  const over = (list) => list.filter((p) => p > PLATES_UP_TO).pop();
  return over(sizes) ?? over(PLATES.lb);
}

// Double progression: keep the weight and add a rep per set until every set reaches the top of the range,
// then add a step of weight and start again from the bottom (`change` 'up'). Body-weight work (logged as 0)
// climbs the range the same way, then takes its first weight ('add'). When last time and the time before
// (`prior`) were at the same weight and both averaged under the bottom of the range, the weight comes down
// about DROP, in steps, and starts again from the bottom ('down'). In a lighter week it's fewer sets,
// repeating last time. `sizes` are the plates the lifter has (logic.js plateSizes).
export function suggestion(exercise, last, week = 0, unit = 'lb', { prior = null, sizes = PLATES[unit] } = {}) {
  const n = plannedSets(exercise, week);
  const light = isLightWeek(week);
  const restart = (weights, change) => ({ weights, reps: Array(n).fill(exercise.low), change });
  if (!last) return restart(Array(n).fill(null), null);
  const sets = last.sets;
  const loaded = sets.some((s) => s.weight > 0);
  const at = (i) => sets[Math.min(i, sets.length - 1)];
  if (!light && sets.length >= exercise.sets && sets.every((s) => s.reps >= exercise.high)) {
    if (!loaded) return restart(Array(n).fill(addedWeight(exercise, unit, sizes)), 'add');
    return restart(Array(n).fill(tidy(heaviestSet(sets, exercise, unit).weight + exercise.step)), 'up');
  }
  const heaviest = heaviestSet(sets, exercise, unit);
  const same = prior && weightOf(exercise, heaviestSet(prior.sets, exercise, unit).weight, unit) === weightOf(exercise, heaviest.weight, unit);
  if (!light && loaded && same && fellShort(sets, exercise) && fellShort(prior.sets, exercise)) {
    // Each set comes down by the same amount, so a drop set keeps its steps; a set that can't stays.
    const drop = Math.max(exercise.step, roundTo(heaviest.weight * DROP, exercise.step));
    if (lowered(exercise, heaviest.weight, drop, unit) !== null) {
      return restart(Array.from({ length: n }, (_, i) => lowered(exercise, at(i).weight, drop, unit) ?? at(i).weight), 'down');
    }
  }
  return {
    weights: Array.from({ length: n }, (_, i) => at(i).weight),
    reps: Array.from({ length: n }, (_, i) => Math.min(exercise.high, Math.max(exercise.low, light ? at(i).reps : (sets[i]?.reps ?? exercise.low - 1) + 1))),
    change: null,
  };
}

// The best of one session: estimated max for loaded sets, or most reps when it's all body weight. For an
// exercise counted in plates, the estimate is of one side's weight.
export function sessionBest(sets, exercise = null, unit = 'lb') {
  const loaded = sets.filter((s) => s.weight > 0 && s.reps > 0);
  if (!loaded.length) return { value: Math.max(0, ...sets.map((s) => s.reps)), kind: 'reps' };
  return { value: Math.max(...loaded.map((s) => estimateMax(weightOf(exercise, s.weight, unit), s.reps))), kind: 'estimate' };
}

// Personal records for one variant: heaviest set, best estimated max (of one side's weight for plates a
// side), and the session with the most volume, in weight.
export function records(history, exercise = null, unit = 'lb') {
  const weigh = (w) => weightOf(exercise, w, unit);
  let heaviest = null;
  let best = null;
  let volume = 0;
  for (const h of history) {
    for (const s of h.sets) {
      if (!heaviest || weigh(s.weight) > weigh(heaviest.weight) || (s.weight === heaviest.weight && s.reps > heaviest.reps)) heaviest = s;
      if (s.weight > 0 && s.reps > 0) {
        const e = estimateMax(weigh(s.weight), s.reps);
        if (!best || e > best.value) best = { value: e, ...s };
      }
    }
    volume = Math.max(volume, h.sets.reduce((sum, s) => sum + loadOf(exercise, s.weight, unit) * s.reps, 0));
  }
  return { heaviest, best, volume: tidy(volume) };
}

// Hard sets per muscle in one training week: the main lift's logged sets and every accessory set logged. A set
// counts in full for the exercise's main muscle and as half for each one it also works (muscles.js creditsOf).
// An exercise with no muscle counts under null.
export function muscleSets(state, sessions) {
  const count = new Map();
  const add = (of, n) => {
    if (n) for (const [muscle, share] of creditsOf(of)) count.set(muscle, (count.get(muscle) ?? 0) + n * share);
  };
  for (const s of sessions) {
    if (!s.skipped) add(LIFT_MUSCLES[s.lift], s.reps.filter((r) => r !== null).length);
    for (const x of s.extras ?? []) {
      if (!x.skipped) add(state.exercises.find((e) => e.id === x.exercise), x.sets.filter(Boolean).length);
    }
  }
  return count;
}

// ---------- Skips that leave a muscle short ----------

// A muscle's week falls short under 10 sets, the low end of a common weekly target for growth (History → Muscles
// shades 10–20), or under what the plan gives it when that's less: two 3-set exercises make 6.
export const MUSCLE_TARGET = 10;
// Skipped this many times running while its muscle stays on target, an exercise is offered off its days.
export const SKIPS_TO_DROP = 3;

// The sets an accessory still has to come on a day: its unlogged sets, or the week's planned number when nothing
// is recorded yet. None once it's skipped, or the day is skipped or ended.
function setsToCome(session, exercise, week) {
  if (session.skipped || session.ended) return 0;
  const entry = entryOf(session, exercise.id);
  if (!entry) return plannedSets(exercise, week);
  return entry.skipped ? 0 : entry.sets.filter((s) => s === null).length;
}

// How each muscle's training week is going, as { sets, target }: `sets` is what's logged on every day plus the
// sets still to come from day `from` on (earlier days are over), and `target` is MUSCLE_TARGET, or the plan's sets
// for the muscle when fewer. Sets count as in muscleSets: half for a muscle an exercise also works. A muscle not
// set, or Other, isn't counted, and neither is the plan of an exercise on a break.
export function muscleOutlook(state, sessions, week, from) {
  const out = new Map();
  const tally = (muscle, key, n) => {
    if (!muscle || muscle === 'Other' || !n) return;
    const m = out.get(muscle) ?? { sets: 0, plan: 0 };
    m[key] += n;
    out.set(muscle, m);
  };
  const add = (of, key, n) => {
    for (const [muscle, share] of creditsOf(of)) tally(muscle, key, n * share);
  };
  for (const [muscle, n] of muscleSets(state, sessions)) tally(muscle, 'sets', n);
  sessions.forEach((s, i) => {
    const lift = LIFT_MUSCLES[s.lift];
    add(lift, 'plan', s.reps.length);
    for (const e of state.exercises) if (onDay(e, s.day)) add(e, 'plan', plannedSets(e, week));
    if (i < from) return;
    if (!s.skipped && !s.ended) add(lift, 'sets', s.reps.filter((r) => r === null).length);
    for (const e of dayExtras(state, s)) add(e, 'sets', setsToCome(s, e, week));
  });
  return new Map([...out].map(([muscle, { sets, plan }]) => [muscle, { sets, target: Math.min(MUSCLE_TARGET, plan) }]));
}

// How many times running an exercise was skipped before day `here`, over the days trained that had it.
export function skipStreak(state, id, here) {
  let streak = 0;
  state.blocks.forEach((b, bi) => b.log.forEach((week, wi) => week.forEach((s, si) => {
    const x = !s.skipped && before([bi, wi, si], here) ? entryOf(s, id) : null;
    if (x?.skipped) streak++;
    else if (x && done(x)) streak = 0;
  })));
  return streak;
}

// What skipping an accessory on day `here` ([block, week, day]) does to its muscle's week, or null when the week
// stays on target without it, or it's a lighter week (7 and 8 are light on purpose). `from` is the week's first day
// still to come. It gives the sets the muscle ends the week on without it, how many of them are done already, the
// day's other exercises for the muscle still to come, the times running it was skipped before, and last week's
// sets when they fell short too.
export function skipConcern(state, here, exercise, from = here[2]) {
  const [bi, week, index] = here;
  const muscle = exercise.muscle;
  if (isLightWeek(week) || !muscle || muscle === 'Other') return null;
  const sessions = state.blocks[bi].log[week];
  const session = sessions[index];
  const { sets, target } = muscleOutlook(state, sessions, week, Math.min(from, index)).get(muscle) ?? { sets: 0, target: 0 };
  const without = sets - setsToCome(session, exercise, week);
  if (without >= target) return null;
  const others = dayExtras(state, session).filter((e) => e !== exercise && e.muscle === muscle && setsToCome(session, e, week) > 0);
  const prev = week > 0 && !isLightWeek(week - 1) ? muscleSets(state, state.blocks[bi].log[week - 1]).get(muscle) ?? 0 : null;
  return {
    muscle, sets: without, target, done: muscleSets(state, sessions).get(muscle) ?? 0, others,
    streak: skipStreak(state, exercise.id, here), lastWeek: prev !== null && prev < target ? prev : null,
  };
}

// The exercises on day `here`'s list skipped there for at least the SKIPS_TO_DROP-th time running while their
// muscle's week stays on target, each with the times running, to offer taking them off that kind of day. None in
// a lighter week.
export function dropOffers(state, here, from = here[2]) {
  const [bi, week, index] = here;
  if (isLightWeek(week)) return [];
  const sessions = state.blocks[bi].log[week];
  const session = sessions[index];
  const outlook = muscleOutlook(state, sessions, week, Math.min(from, index));
  const short = (muscle) => Boolean(outlook.get(muscle)) && outlook.get(muscle).sets < outlook.get(muscle).target;
  return state.exercises
    .filter((e) => onDay(e, session.day) && entryOf(session, e.id)?.skipped && !short(e.muscle))
    .map((exercise) => ({ exercise, times: skipStreak(state, exercise.id, here) + 1 }))
    .filter((d) => d.times >= SKIPS_TO_DROP);
}

// ---------- Workout timing ----------

const byTime = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

// The moments a training day's sets were logged, in order: the main lift's (`part` 'lift') and each
// accessory's (`part` its id). Anything logged after the workout was ended is left out.
function setTimes(session) {
  const events = [];
  (session.times ?? []).forEach((t, i) => { if (t && session.reps[i] !== null) events.push({ at: t, part: 'lift' }); });
  for (const x of session.extras ?? []) {
    if (x.skipped) continue;
    for (const s of x.sets) if (s?.at) events.push({ at: s.at, part: x.exercise });
  }
  return events.filter((e) => !session.ended || e.at <= session.ended).sort(byTime);
}

// How long a training day took and where the time went, in milliseconds. A set's time runs from
// whatever came before it (the start, or the last set logged, of any exercise) to when it was logged,
// so rest and setting up count toward the exercise that followed them, and the lift's first set
// includes the warm-up. Without a start, the first set has nothing before it and isn't counted.
// `parts` are in the order first done, each with its sets counted. Null when nothing was timed.
export function workoutTime(session) {
  const events = setTimes(session);
  if (!session.started && !events.length) return null;
  const start = session.started ?? events[0].at;
  const last = events.length ? events[events.length - 1].at : start;
  const end = session.ended ?? (last > start ? last : start);
  const parts = new Map();
  let prev = session.started ?? null;
  for (const e of events) {
    if (prev !== null) {
      const part = parts.get(e.part) ?? { part: e.part, ms: 0, sets: 0, first: e.at };
      part.ms += Math.max(0, Date.parse(e.at) - Date.parse(prev));
      part.sets += 1;
      parts.set(e.part, part);
    }
    prev = e.at;
  }
  return { start, end, ended: Boolean(session.ended), total: Math.max(0, Date.parse(end) - Date.parse(start)), parts: [...parts.values()] };
}

// Every timed training day across the blocks, oldest first, with its day and lift.
export function timedSessions(state) {
  const out = [];
  for (const b of state.blocks) {
    for (const week of b.log) {
      for (const s of week) {
        const time = workoutTime(s);
        if (time) out.push({ session: s, time });
      }
    }
  }
  return out;
}

// Each exercise's time over every timed set, rest included: the lifts by name ('lift:squat'), accessories by id,
// with the number of sets and days it's spread over.
export function partTimes(state) {
  const totals = new Map();
  for (const { session, time } of timedSessions(state)) {
    for (const p of time.parts) {
      const key = p.part === 'lift' ? `lift:${session.lift}` : p.part;
      const t = totals.get(key) ?? { ms: 0, sets: 0, days: 0 };
      totals.set(key, { ms: t.ms + p.ms, sets: t.sets + p.sets, days: t.days + 1 });
    }
  }
  return totals;
}

// Body weight entries stay one per day, oldest first.
export function logBodyweight(state, date, weight) {
  state.bodyweight = [...state.bodyweight.filter((e) => e.date !== date), { date, weight }]
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- Checks on saved data ----------

const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
// A moment as the app writes it: an ISO time in UTC, so the order holds whatever time zone it's read in.
const isTime = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(t) && !Number.isNaN(Date.parse(t));
const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

// A muscle, plate, counted, break or picture setting that isn't one of the choices is dropped, keeping the
// exercise. Its muscles are then filled in, or brought up to date, from its name (muscles.js fillMuscles).
function cleanChoices(e) {
  if (e && e.muscle !== undefined && e.muscle !== null && !MUSCLES.includes(e.muscle) && !isOldMuscle(e.muscle)) delete e.muscle;
  if (e && e.also !== undefined && !Array.isArray(e.also)) delete e.also;
  if (e && e.paused !== undefined && typeof e.paused !== 'boolean') delete e.paused;
  if (e && typeof e === 'object' && typeof e.name === 'string') fillMuscles(e);
  if (e && e.pic !== undefined && e.pic !== null && !(typeof e.pic === 'string' && picKeys.has(e.pic))) delete e.pic;
  if (e && e.plates !== undefined && e.plates !== null && !(typeof e.plates === 'string' && Object.hasOwn(LOADS, e.plates))) delete e.plates;
  if (e && e.counted !== undefined && typeof e.counted !== 'boolean') delete e.counted;
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

// A set keeps the moment it was logged only when that reads as a time.
const cleanSet = (s) => (s && s.at !== undefined && !isTime(s.at) ? { weight: s.weight, reps: s.reps } : s);

const validEntry = (x) => Boolean(x) && typeof x.exercise === 'string' && (x.variant === null || text(x.variant, 40)) &&
  typeof x.skipped === 'boolean' && Array.isArray(x.sets) && x.sets.length <= 20 && x.sets.every(validSet);

const cleanEntries = (list) => list.filter(validEntry).map((x) => ({ ...x, sets: x.sets.map(cleanSet) }));

// A day's timing: when it started and ended, when each main-lift set was logged (one slot per set), and when each
// warm-up step was ticked off (one slot per step, in order).
function cleanTiming(s) {
  for (const k of ['started', 'ended']) if (s[k] !== undefined && !isTime(s[k])) delete s[k];
  if (s.times !== undefined && !(Array.isArray(s.times) && s.times.length === s.reps.length && s.times.every((t) => t === null || isTime(t)))) delete s.times;
  if (s.warmups !== undefined && !(Array.isArray(s.warmups) && s.warmups.length <= 12 && s.warmups.every((t) => t === null || isTime(t)))) delete s.warmups;
}

const LIFT_IDS = LIFTS.map((l) => l.id);
const validMax = (n) => typeof n === 'number' && n > 0 && n < 5000;

// Drops anything malformed in the optional data (accessories, body weight, earlier maxes, the days maxes
// were set, workout times, warm-ups, how heavy days felt and the plates owned) instead of rejecting the whole log,
// and fills in the fields older logs don't have.
export function cleanExtras(state) {
  // The DOTS formula for History → Stats (stats.js DOTS): men's or women's, else none picked yet.
  if (state.dots !== undefined && !['men', 'women'].includes(state.dots)) delete state.dots;
  // The plate sizes the lifter has (logic.js plateSizes), in the log's unit; without it, every size.
  const owned = state.platesOwned;
  if (owned !== undefined && !(Array.isArray(owned) && owned.length && owned.every((p) => PLATES[state.unit].includes(p)))) delete state.platesOwned;
  state.exercises =Array.isArray(state.exercises) ? state.exercises.map(cleanChoices).filter(validExercise) : [];
  state.bodyweight = Array.isArray(state.bodyweight)
    ? state.bodyweight.filter((e) => e && isDate(e.date) && typeof e.weight === 'number' && e.weight > 0) : [];
  if (state.imported !== undefined) {
    state.imported = Array.isArray(state.imported)
      ? state.imported.filter((w) => w && isDate(w.date) && Array.isArray(w.extras)).map((w) => ({ ...w, extras: cleanEntries(w.extras) })) : [];
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
        if (s.extras !== undefined) s.extras = Array.isArray(s.extras) ? cleanEntries(s.extras) : [];
        if (s.date !== undefined && !isDate(s.date)) delete s.date;
        if (s.feel !== undefined && !FEELS.includes(s.feel)) delete s.feel;
        cleanTiming(s);
      }
    }
  }
  return state;
}
