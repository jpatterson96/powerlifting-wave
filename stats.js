// The numbers behind History → Stats: strength for body weight, how fast each lift's record climbs, whether the
// max matches the test sets, which days get trained or skipped, everything lifted, and which accessories are
// moving or stuck; and behind the card a finished week gets on Train and the block review. No DOM access here so it
// can be tested in Node.
import {
  LIFTS, WAVE_TWO, FIRST_TEST, SECOND_TEST, FINISH_WEEK, LB_PER_KG, tidy, estimateMax, adjustMax, weekMax, setWeight, testResult, maxLifts,
  liftRecord, prescription,
} from './logic.js';
import {
  WEEKDAYS, isLightWeek, weightOf, loadOf, exerciseHistory, sessionBest, workoutTime, dayExtras, isNewBest,
} from './extras.js';

const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const yearsBetween = (from, to) => (dayNumber(to) - dayNumber(from)) / 365.25;
const yearBefore = (iso) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;

// ---------- Strength for body weight ----------

// DOTS, the score meets use to compare lifters of different body weights: the total in kg × 500 over a
// polynomial in body weight (in kg, held to the range each set of coefficients was fitted on). Coefficients
// lowest power first, as published for men and for women.
export const DOTS = {
  men: { coef: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093], range: [40, 210] },
  women: { coef: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706], range: [40, 150] },
};

export function dots(totalKg, bodyKg, formula) {
  const { coef, range } = DOTS[formula];
  const x = Math.min(range[1], Math.max(range[0], bodyKg));
  return (totalKg * 500) / coef.reduce((sum, c, i) => sum + c * x ** i, 0);
}

// The total of the three records (as on the PRs page) against the latest body weight: as a multiple of it,
// each lift's too, and as a DOTS score once a formula is picked, with what one plate step more on the total,
// or that much less body weight at the same total, would add to the score.
export function strength(state) {
  const lifts = LIFTS.map((l) => ({ lift: l.id, value: liftRecord(state, l.id)?.value ?? null }));
  if (lifts.some((l) => l.value === null)) return null;
  const total = tidy(lifts.reduce((sum, l) => sum + l.value, 0));
  const body = state.bodyweight?.[state.bodyweight.length - 1] ?? null;
  if (!body) return { total, body: null, ratio: null, lifts, formula: null, score: null };
  const kg = (n) => (state.unit === 'kg' ? n : n / LB_PER_KG);
  const formula = Object.hasOwn(DOTS, state.dots ?? '') ? state.dots : null;
  const step = state.unit === 'kg' ? 5 : 10;
  const score = formula && dots(kg(total), kg(body.weight), formula);
  return {
    total, body, ratio: total / body.weight,
    lifts: lifts.map((l) => ({ ...l, ratio: l.value / body.weight })),
    formula, score, step,
    perTotal: formula && dots(kg(total + step), kg(body.weight), formula) - score,
    perBody: formula && dots(kg(total), kg(body.weight - step), formula) - score,
  };
}

// ---------- Gains over the years ----------

// How fast a lift's record has climbed: from its first lift on record, per year to today (so a long wait for
// the next record slows it), and how much it rose in the last 12 months. `steps` are each new record, oldest
// first. Under half a year of history, a yearly rate would be noise, so it's null.
export function gains(state, liftId, today) {
  const lifts = maxLifts(state, liftId);
  if (!lifts.length) return null;
  const steps = [];
  for (const l of lifts) {
    const last = steps[steps.length - 1];
    if (!last || l.value > last.value) steps.push({ date: l.date, value: l.value });
  }
  const first = steps[0];
  const best = steps[steps.length - 1];
  const years = yearsBetween(first.date, today);
  const yearAgo = steps.filter((s) => s.date <= yearBefore(today)).pop();
  return {
    first, best, steps, years,
    perYear: years >= 0.5 ? (best.value - first.value) / years : null,
    lastYear: yearAgo ? tidy(best.value - yearAgo.value) : null,
  };
}

// ---------- Is the max right? ----------

// Every test set of one lift (the 2+ sets of weeks 3 and 6), oldest first: its estimate against the max that
// week trained from, and what the program does with a result like it. Under 93% of the max it comes down,
// 93–99% holds and past that it goes up.
export function maxChecks(state, liftId) {
  const out = [];
  state.blocks.forEach((b, block) => {
    for (const week of [FIRST_TEST, SECOND_TEST]) {
      const test = testResult(b, liftId, week, state);
      if (!test) continue;
      const max = weekMax(b, liftId, week, state);
      const { change, value } = adjustMax(max, test.estimate, liftId, state);
      out.push({ block, week, ...test, max, ratio: test.estimate / max, change, by: tidy(value - max) });
    }
  });
  return out;
}

// What each count of reps on one lift's test set in a block's `week` would say: runs of rep counts that lower,
// hold or raise the max (and by how much), the last run open-ended.
export function testBands(b, liftId, week, state) {
  const s = b.log[week].find((x) => x.lift === liftId && x.kind === 'base');
  const weight = setWeight(b, s, week, s.reps.length - 1, state);
  const max = weekMax(b, liftId, week, state);
  const bands = [];
  for (let reps = 1; reps <= 12; reps++) {
    const { change, value } = adjustMax(max, estimateMax(weight, reps), liftId, state);
    const by = tidy(value - max);
    const last = bands[bands.length - 1];
    if (last && last.change === change && last.by === by) last.to = reps;
    else bands.push({ from: reps, to: reps, change, by });
  }
  bands[bands.length - 1].to = null;
  return { weight, max, bands };
}

// The current block's next test set of one lift that's still to come, with its bands (see testBands).
export function nextTest(state, liftId) {
  const b = state.blocks[state.blocks.length - 1];
  for (const week of [FIRST_TEST, SECOND_TEST]) {
    const s = b.log[week].find((x) => x.lift === liftId && x.kind === 'base');
    if (!s || s.skipped || s.reps[s.reps.length - 1] !== null) continue;
    return { week, ...testBands(b, liftId, week, state) };
  }
  return null;
}

// ---------- Showing up ----------

// A day counts as trained once any of its main sets is logged.
const dayState = (s) => (s.skipped ? 'skipped' : s.reps.some((r) => r !== null) ? 'trained' : 'todo');

// The current block as a grid, a row per weekday and a column per week, each day trained, skipped, next (the
// first one not touched yet) or to come (null where a week has no such day, as a re-max week has no Thursday or
// Friday); this block's tally; every block's days by weekday; and the days trained in a row, counting back from
// the latest one settled.
export function consistency(state) {
  const b = state.blocks[state.blocks.length - 1];
  const nextDay = b.log.flat().find((s) => dayState(s) === 'todo');
  const grid = WEEKDAYS.map((day) => b.log.map((week) => {
    const s = week.find((x) => x.day === day);
    if (!s) return null;
    return s === nextDay ? 'next' : dayState(s);
  }));
  const states = b.log.flat().map(dayState);
  const count = (list, k) => list.filter((x) => x === k).length;
  const all = state.blocks.flatMap((x) => x.log.flat());
  const byDay = WEEKDAYS.map((day) => {
    const of = all.filter((s) => s.day === day).map(dayState);
    return { day, trained: count(of, 'trained'), skipped: count(of, 'skipped') };
  });
  const settled = all.map(dayState).filter((x) => x !== 'todo');
  const lastSkip = settled.lastIndexOf('skipped');
  // The day skipped most, by share of its days settled; null with nothing skipped.
  const slips = byDay.filter((d) => d.skipped)
    .sort((x, y) => y.skipped / (y.trained + y.skipped) - x.skipped / (x.trained + x.skipped))[0] ?? null;
  return {
    grid, trained: count(states, 'trained'), skipped: count(states, 'skipped'), toGo: states.length - count(states, 'trained') - count(states, 'skipped'),
    byDay, run: settled.length - lastSkip - 1, slips,
  };
}

// ---------- Everything lifted ----------

const blank = () => ({ days: 0, sets: 0, reps: 0, volume: 0, ms: 0, timed: 0 });

function addSets(t, sets) {
  for (const { weight, reps } of sets) {
    t.sets += 1;
    t.reps += reps;
    t.volume += weight * reps;
  }
  return sets.length > 0;
}

// The accessory sets of one day's record, each with what its load weighs (plates a side count on both sides).
const extraSets = (state, list) => (list ?? []).filter((x) => !x.skipped).flatMap((x) => {
  const e = state.exercises.find((ex) => ex.id === x.exercise);
  return x.sets.filter(Boolean).map((s) => ({ weight: loadOf(e, s.weight, state.unit), reps: s.reps }));
});

// Days, sets, reps and weight × reps for each block and in all: the main lifts' work sets (warm-ups aren't
// logged) and every accessory set, plus imported workouts in the overall count. `ms` adds up the days timed
// from Start to End workout, `timed` of them.
export function totals(state) {
  const blocks = state.blocks.map((b) => {
    const t = blank();
    b.log.forEach((week, w) => week.forEach((s) => {
      if (s.skipped) return;
      const main = s.reps.map((r, i) => (r === null ? null : { weight: setWeight(b, s, w, i, state), reps: r })).filter(Boolean);
      const lifted = addSets(t, main);
      if (addSets(t, extraSets(state, s.extras)) || lifted) t.days += 1;
      const time = workoutTime(s);
      if (time?.ended) {
        t.ms += time.total;
        t.timed += 1;
      }
    }));
    return t;
  });
  const all = blank();
  for (const t of blocks) for (const k of Object.keys(all)) all[k] += t[k];
  for (const w of state.imported ?? []) if (addSets(all, extraSets(state, w.extras))) all.days += 1;
  all.volume = tidy(all.volume);
  return { all, blocks };
}

// ---------- A week ----------

// One week of a block, for its card on Train: each day's top set (the heaviest weight, with the most reps done at
// it) and reps past and short of the prescription; the days trained and skipped; the week's
// sets, weight × reps and time as totals counts them; how many accessories made a new best; and the accessories done
// of those due on the days trained (the day's list now, plus any done or skipped that have since left it).
export function weekSummary(state, blockIndex, week) {
  const b = state.blocks[blockIndex];
  const t = blank();
  const dates = b.log[week].map((s) => s.date).filter(Boolean).sort();
  const out = { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, days: [], trained: 0, skipped: 0, bests: 0, extrasDone: 0, extrasDue: 0 };
  b.log[week].forEach((s, index) => {
    if (s.skipped) {
      out.skipped += 1;
      out.days.push({ day: s.day, lift: s.lift, skipped: true });
      return;
    }
    const target = prescription(s.kind, week).reps;
    const main = s.reps.map((r, i) => (r === null ? null : { weight: setWeight(b, s, week, i, state), reps: r })).filter(Boolean);
    const lifted = addSets(t, main);
    if (addSets(t, extraSets(state, s.extras)) || lifted) out.trained += 1;
    const time = workoutTime(s);
    if (time?.ended) {
      t.ms += time.total;
      t.timed += 1;
    }
    const done = (s.extras ?? []).filter((x) => !x.skipped && x.sets.some(Boolean));
    out.extrasDone += done.length;
    out.extrasDue += new Set([...dayExtras(state, s).map((e) => e.id), ...(s.extras ?? []).map((x) => x.exercise)]).size;
    out.bests += done.filter((x) => isNewBest(state, x.exercise, x.variant, [blockIndex, week, index], x.sets.filter(Boolean))).length;
    const weight = main.length ? Math.max(...main.map((m) => m.weight)) : null;
    out.days.push({
      day: s.day,
      lift: s.lift,
      skipped: false,
      top: weight === null ? null : { weight, reps: Math.max(...main.filter((m) => m.weight === weight).map((m) => m.reps)) },
      over: main.reduce((sum, m) => sum + Math.max(0, m.reps - target), 0),
      short: main.reduce((sum, m) => sum + Math.max(0, target - m.reps), 0),
    });
  });
  return { ...out, sets: t.sets, volume: tidy(t.volume), ms: t.ms, timed: t.timed };
}

// ---------- A block ----------

// A whole block for its review: each week as weekSummary has it, added up, and the first and last days trained.
export function blockSummary(state, blockIndex) {
  const weeks = state.blocks[blockIndex].log.map((_, w) => weekSummary(state, blockIndex, w));
  const sum = (k) => weeks.reduce((n, w) => n + w[k], 0);
  const dates = weeks.flatMap((w) => [w.from, w.to]).filter(Boolean).sort();
  return {
    from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, weeks,
    sets: sum('sets'), volume: tidy(sum('volume')), ms: sum('ms'), timed: sum('timed'), bests: sum('bests'),
    extrasDone: sum('extrasDone'), extrasDue: sum('extrasDue'),
  };
}

// How one lift's max moved through a block: the max weeks 1–3 trained from, the one week 3's test set left for
// weeks 4–8, each test set logged, and the re-max attempts judged good or missed.
export function maxPath(state, blockIndex, liftId) {
  const b = state.blocks[blockIndex];
  const tests = [FIRST_TEST, SECOND_TEST].map((week) => ({ week, test: testResult(b, liftId, week, state) }))
    .filter((t) => t.test).map(({ week, test }) => ({ week, ...test }));
  const remax = b.log[FINISH_WEEK].find((s) => s.lift === liftId && s.kind === 'max' && !s.skipped);
  const attempts = (remax?.reps ?? []).map((rep, attempt) => (rep === null ? null
    : { attempt, weight: setWeight(b, remax, FINISH_WEEK, attempt, state), good: rep === 1 })).filter(Boolean);
  return { start: b.max[liftId], wave: weekMax(b, liftId, WAVE_TWO, state), tests, attempts };
}

// ---------- Accessories ----------

// Sessions in a row without progress before an accessory counts as stuck.
export const STUCK_AFTER = 3;

// A session's top set by weight (one side's plates for an exercise counted in plates), with the average reps
// of its sets at that weight.
function topSet(sets, e, unit) {
  const weight = Math.max(...sets.map((s) => weightOf(e, s.weight, unit)));
  const at = sets.filter((s) => weightOf(e, s.weight, unit) === weight);
  return { weight, reps: at.reduce((sum, s) => sum + s.reps, 0) / at.length };
}

// Double progression moves when a session's top weight is heavier, or the same for more reps a set.
function moved(before, after, e, unit) {
  const a = topSet(before, e, unit);
  const b = topSet(after, e, unit);
  return b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps);
}

// How each accessory is going, by variant, once it's been done twice: its best set's change from the first
// session to the latest (estimated max, or reps for body-weight work), and `flat`, the latest sessions in a
// row without progress counting the one they're measured from. The lighter weeks 7 and 8 repeat on purpose,
// so they're left out. With `blockIndex`, only that block's sessions count.
export function accessoryTrends(state, blockIndex = null) {
  const out = [];
  for (const e of state.exercises) {
    const history = exerciseHistory(state, e.id)
      .filter((h) => !(h.at && isLightWeek(h.at[1])) && (blockIndex === null || h.at?.[0] === blockIndex));
    for (const variant of [...new Set(history.map((h) => h.variant))]) {
      const of = history.filter((h) => h.variant === variant);
      if (of.length < 2) continue;
      const first = sessionBest(of[0].sets, e, state.unit);
      const last = sessionBest(of[of.length - 1].sets, e, state.unit);
      const change = first.kind === last.kind && first.value > 0 ? last.value / first.value - 1 : null;
      let flat = 1;
      for (let i = of.length - 1; i > 0 && !moved(of[i - 1].sets, of[i].sets, e, state.unit); i--) flat += 1;
      out.push({ exercise: e, variant, sessions: of.length, first, last, change, flat, latest: of[of.length - 1] });
    }
  }
  return out;
}
