import {
  LIFTS, WEEKS, BLOCK_WEEKS, WAVE_TWO, FIRST_TEST, SECOND_TEST, FINISH_WEEK, ATTEMPTS, ATTEMPT_NAMES, REMAX_RAMP, BUMPS, isTestSet,
  prescription, ROUNDING, REST_MODES, BAR, tidy, roundTo, workingMax, targetWeight, estimateMax, weekMax, attemptBase, attemptWeight, setWeight,
  singleWeight, restSeconds, platesPerSide, warmups, emptyState, newBlock, finishFor, setFinish, sessionStatus,
  weekProgress, nextSession, currentWeek, weekToRepeat, resetWeek, clearDay, longBreak, restartBlock, evaluateLift, liftHistory,
  maxChanges, liftRecord, convertState, upgrade, PLATES, plateSizes, dueSession, missedSessions, FEELS, GRINDS, heavyFeel,
  touched, testResult, dayPct, heatOf, liftPath, weekHeat,
} from './logic.js';
import {
  WEEKDAYS, EXTRA_DEFAULTS, EXTRA_STEP, MUSCLES, LIFT_MUSCLE, LOADS, PLATE, SMALL_PLATES, isCounted, countedPlates, weightOf, loadOf, PLATES_UP_TO, GUESSED_STEP, looksCounted, countInPlates, isLightWeek, plannedSets, newExercise,
  dayExtras, dayGroups, exercisesByDay, moveExercise, setLink, supersetOrder, entryOf, ensureEntry, finishExtras, exerciseHistory, earlierTimes, isNewBest, defaultVariant,
  suggestion, sessionBest, records, muscleSets, workoutTime, timedSessions, partTimes, logBodyweight, cleanExtras,
  DAY_KINDS, muscleOutlook, skipConcern, dropOffers,
} from './extras.js';
import { mergeLogs } from './merge.js';
import { DECIMALS, press, typed, nudge } from './pad.js';
import { PICS, picFor, picFile } from './pics.js';
import { SHOW, PR_SHOW, showPlan, prShow, stepAt } from './show.js';
import * as sync from './sync.js';
import * as rest from './rest.js';
import { maxChart, volumeChart, progressChart, sparkline } from './charts.js';
import {
  DOTS, STUCK_AFTER, strength, gains, maxChecks, nextTest, testBands, consistency, totals, accessoryTrends, weekSummary,
  blockSummary, maxPath,
} from './stats.js';

const KEY = 'powerlifting-wave';
// The version running: the cache name in sw.js, bumped with it every release (a test checks they match).
const VERSION = 'wave-v26';
const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const toastEl = document.getElementById('toast');
const repsSheet = document.getElementById('reps-sheet');
const repGrid = document.getElementById('rep-grid');
const weightSheet = document.getElementById('weight-sheet');
const pickSheet = document.getElementById('pick-sheet');
const exerciseSheet = document.getElementById('exercise-sheet');
const exerciseForm = document.getElementById('exercise-form');
const pastSheet = document.getElementById('past-sheet');
const pastForm = document.getElementById('past-form');
const restoreInput = document.getElementById('restore-input');
const moment = document.getElementById('pr-moment');

let state = load();
// `open` is the index of the expanded day in the shown week; undefined means "pick the next day to train".
// `history` is the History tab's section; `exercise` an accessory opened there; `editing` the exercise in the editor;
// `past` the earlier max being changed, by its place in state.pastMaxes (null for a new one).
const ui = {
  tab: 'train', reviewing: false, week: null, open: undefined, sheet: null, lift: 'squat',
  history: 'stats', exercise: null, variant: null, editing: null, past: null, muscleWeek: null,
  // The accessory (or superset) opened on the shown day, by its first exercise's id; undefined picks one under way.
  extraOpen: undefined,
  // The missed days whose notice was put off with Not now (see missedKey); it comes back if they change.
  missedLater: null,
  // The kind of day opened in Settings → Accessories, by its lift (or 'none'); null keeps them all closed.
  exerciseKind: null,
  // The weight being typed on the app's keypad in a sheet; see startPad.
  pad: null,
};
// The numbers behind each History chart, by its data-chart name, for the tooltips.
const chartData = {};
// A newer version downloaded and ready, by its cache name (see checkUpdate).
let update = null;

// Colour, height and thickness for one side of the bar, heaviest plates biggest.
const PLATE_STYLE = {
  lb: { 45: ['blue', 56, 12], 35: ['yellow', 50, 11], 25: ['green', 44, 10], 10: ['white', 34, 8], 5: ['black', 28, 7], 2.5: ['chrome', 22, 6], 1.25: ['chrome', 18, 5] },
  kg: { 25: ['red', 56, 12], 20: ['blue', 56, 11], 15: ['yellow', 50, 10], 10: ['green', 44, 9], 5: ['white', 34, 8], 2.5: ['black', 28, 7], 1.25: ['chrome', 22, 5] },
};

// Brings saved data of any version up to date; accessory data that doesn't check out is dropped, not the log.
function upgradeAll(data) {
  const s = upgrade(data);
  return s && cleanExtras(s);
}

function load() {
  try {
    const saved = upgradeAll(JSON.parse(localStorage.getItem(KEY)));
    if (saved) return saved;
  } catch {
    // Unreadable storage falls through to a fresh start.
  }
  return emptyState();
}

function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast("Couldn't save. Free up space on your phone, then log the set again.");
  }
}

function save() {
  writeLocal();
  sync.changed();
}

// Asks iOS not to clear the data when the phone runs low on space.
function requestPersist() {
  navigator.storage?.persist?.().catch(() => {});
}

const block = () => state.blocks[state.blocks.length - 1];
// Two decimals covers 288.75-style maxes and hides the long tails left by unit conversion.
const fmt = (n) => String(Math.round(n * 100) / 100);
const plural = (n, word) => `${n} ${n === 1 ? word : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`}`;
// Exercise and variant names are typed by the lifter, so they're escaped wherever they go into markup.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtLoad = (w) => (w === 0 ? 'BW' : fmt(w));
// An accessory's load as it's logged: plates a side for one counted in plates, else the weight (BW for 0).
const loadText = (e, w) => (isCounted(e) ? `${fmt(w)} ${w === 1 ? 'plate' : 'plates'}` : fmtLoad(w));
const loadUnit = (plates) => (plates ? 'plates a side' : state.unit);
// An estimated max in the exercise's own terms: a whole weight, or for plates a side, one side's weight.
const estText = (e, v) => (isCounted(e) ? `${fmt(Math.round(v))} ${state.unit} a side` : fmt(Math.round(v)));
// One side's plates for a count, as they go on: "45 + 45 + 25", with a long run of one plate as "6 × 45".
function platesText(count) {
  const runs = [];
  for (const plate of countedPlates(count, state.unit)) {
    const run = runs[runs.length - 1];
    if (run?.plate === plate) run.n += 1;
    else runs.push({ plate, n: 1 });
  }
  return runs.flatMap(({ plate, n }) => (n > 3 ? [`${n} × ${fmt(plate)}`] : Array(n).fill(fmt(plate)))).join(' + ');
}
// How plates a side are typed: "45s, then .5 for a 25 and .1 for each 10".
const countRule = () => `${PLATE[state.unit]}s, then .5 for a ${SMALL_PLATES[state.unit].half} and .1 for each ${SMALL_PLATES[state.unit].tenth}`;
const exerciseById = (id) => state.exercises.find((e) => e.id === id);
// The picture beside an accessory, a mask that takes the text colour. With nothing to show, an empty slot keeps rows lined up.
function picHTML(e, variant = null, cls = '') {
  const key = picFor(e, variant);
  const classes = `pic${key ? '' : ' is-none'}${cls ? ` ${cls}` : ''}`;
  return `<i class="${classes}"${key ? ` style="--pic:url('${picFile(key)}')"` : ''} aria-hidden="true"></i>`;
}

// "50 × 12, 12, 10" when the weight holds, "50 × 12, 55 × 10" when it changes.
function setsText(sets, e = null) {
  const parts = [];
  sets.forEach((s, i) => parts.push(i && s.weight === sets[i - 1].weight ? String(s.reps) : `${loadText(e, s.weight)} × ${s.reps}`));
  return parts.join(', ');
}
const restText = (s) => (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s / 60} min`);

const nowISO = () => new Date().toISOString();
const clockTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// "48 min" or "1 h 08 min", to the minute.
function spanText(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => isoDay(new Date());

// The Monday of this week.
function weekStartISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDay(d);
}

const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
};

// Whole days from one date to another.
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// The year shows only when it isn't this one.
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const year = y === new Date().getFullYear() ? {} : { year: 'numeric' };
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...year });
}

// The change that set the max a block's week trains from: the block's start, or its week 3 test set.
const maxSince = (changes, blockIndex, week) => changes.filter((c) => c.block === blockIndex && c.week <= week).pop();

function savedAt(isoTime) {
  const t = new Date(isoTime);
  const time = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (t.toDateString() === new Date().toDateString()) return `at ${time}`;
  return `on ${t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

// Exaggerates the gap between 55% and a max attempt so the wave shape reads at small sizes.
const waveHeight = (pct, min, max) => min + ((pct - 0.55) / 0.47) * (max - min);

const weekName = (b, w) => (w === FINISH_WEEK ? (b.finish === 'remax' ? 'Re-max' : 'Deload') : WEEKS[w].name);
const weekPct = (b, w) => (w === FINISH_WEEK ? (b.finish === 'remax' ? 1 : 0.6) : WEEKS[w].base.pct);

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  // Longer messages stay up longer so they can be read.
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), Math.min(7000, 2200 + message.length * 45));
}

function scrollTop() {
  window.scrollTo(0, 0);
}

// Where Train was left for another tab: the first row still on screen, by its data-key, and how far down the
// screen it sat. Coming back puts that row in the same place, even if something above it changed meanwhile (an
// exercise added in Settings, a notice gone); without it, the same scroll. Block review isn't kept, since leaving
// it goes back to the week.
let trainSpot = null;

function markTrainSpot() {
  const el = [...view.querySelectorAll('[data-key]')].find((x) => x.getBoundingClientRect().bottom > 0);
  trainSpot = ui.reviewing ? null : { key: el?.dataset.key, top: el?.getBoundingClientRect().top, y: window.scrollY };
}

function backToTrainSpot() {
  const el = trainSpot?.key && view.querySelector(`[data-key="${trainSpot.key}"]`);
  if (el) window.scrollBy(0, el.getBoundingClientRect().top - trainSpot.top);
  else window.scrollTo(0, trainSpot?.y ?? 0);
}

// ---------- Views ----------

function render() {
  const focusKey = document.activeElement?.dataset?.key;
  const hasBlock = state.blocks.length > 0;
  tabs.hidden = !hasBlock;
  // The PRs page is the whole screen, with nothing to scroll.
  const showing = hasBlock && ui.tab === 'prs';
  view.classList.toggle('is-show', showing);
  document.body.classList.toggle('is-show', showing);
  if (!hasBlock) {
    view.innerHTML = setupView();
  } else {
    for (const t of tabs.querySelectorAll('.tab')) {
      t.setAttribute('aria-current', t.dataset.tab === ui.tab ? 'page' : 'false');
    }
    if (ui.tab === 'history') view.innerHTML = historyView();
    else if (ui.tab === 'prs') {
      view.innerHTML = prsView();
      runShow();
    }
    else if (ui.tab === 'settings') view.innerHTML = settingsView();
    else view.innerHTML = ui.reviewing ? reviewView() : trainView();
  }
  paintWorkout();
  paintHeat();
  if (focusKey) view.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

// ---------- Block heat ----------

// A glow rises from the bottom of the page with how hard the day on screen is: blue on a light day, then violet,
// magenta and ember, to gold on a re-max, and teal on a deload (styles.css, :root.is-heat). Stops are OKLCH
// [heat, lightness, chroma, hue] with the hue unwrapped so it never doubles back; the graph behind the day's weight
// uses the same colours.
const HEAT = [
  [0, 0.62, 0.09, 215],
  [0.24, 0.56, 0.15, 262],
  [0.45, 0.56, 0.19, 302],
  [0.6, 0.59, 0.21, 345],
  [0.76, 0.64, 0.21, 383],
  [0.89, 0.72, 0.19, 405],
  [1, 0.82, 0.16, 428],
];

function heatColour(t) {
  let i = 1;
  while (i < HEAT.length - 1 && HEAT[i][0] < t) i++;
  const [t0, ...from] = HEAT[i - 1];
  const [t1, ...to] = HEAT[i];
  const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return from.map((v, j) => v + (to[j] - v) * k);
}

const oklch = ([l, c, h]) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${(h % 360).toFixed(1)})`;
// The whole scale, light to heavy, for a legend's key.
const heatScale = () => `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => oklch(heatColour(t))).join(', ')})`;

// A short pulse up the glow when a set is logged: it swells and a band of its light rises and fades.
function pulseGlow() {
  const root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.classList.remove('is-pulse');
  void root.offsetWidth;
  root.classList.add('is-pulse');
}

// The day the colour follows: the one open on Train, else the one due today. The PRs show keeps its own stage.
function paintHeat() {
  const root = document.documentElement;
  const b = state.blocks.length ? block() : null;
  root.classList.toggle('is-heat', Boolean(b) && ui.tab !== 'prs');
  if (!b || ui.tab === 'prs') return;
  const open = ui.tab === 'train' && ui.week !== null && ui.open != null;
  const at = open ? { week: ui.week, index: ui.open } : dueSession(b, todayISO()) ?? { week: b.log.length - 1, index: 0 };
  const session = b.log[at.week]?.[at.index];
  if (!session) return;
  const t = heatOf(dayPct(session, at.week));
  const [l, c, h] = heatColour(t);
  root.style.setProperty('--heat-t', t);
  root.style.setProperty('--heat-l', l.toFixed(3));
  root.style.setProperty('--heat-c', c.toFixed(3));
  root.style.setProperty('--heat-h', h.toFixed(1));
}

// Both waves and the re-max, as one double wave.
function waveMark() {
  const bars = [0.70, 0.75, 0.825, 0.75, 0.80, 0.85, 0.80, 1].map((pct, i) => {
    const h = waveHeight(pct, 30, 96);
    return `<rect x="${i * 14}" y="${100 - h}" width="10" height="${h}"/>`;
  }).join('');
  return `<svg class="wave-mark" viewBox="0 0 108 106" aria-hidden="true">${bars}<rect class="mark-floor" x="0" y="102" width="108" height="4"/></svg>`;
}

function segmented(name, options, current) {
  return `<div class="seg">${options.map((o) => `
    <label class="seg-option">
      <input type="radio" name="${name}" value="${esc(o.value)}"${o.value === current ? ' checked' : ''}>
      <span>${esc(o.label)}</span>
    </label>`).join('')}
  </div>`;
}

function unitOptions() {
  return [{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }];
}

function maxField(lift, value) {
  return `<label class="field">
    <span class="field-label">${lift.name}</span>
    <span class="field-row">
      <input class="num-input" name="${lift.id}" type="number" inputmode="decimal" step="any" min="0" value="${value}">
      <span class="field-unit">${state.unit}</span>
    </span>
  </label>`;
}

function syncStatusLine() {
  const status = sync.getStatus();
  return `<p class="sync-status" id="sync-status" data-state="${status}" role="status">${syncStatusText(status)}</p>`;
}

function setupView() {
  const github = sync.isConnected()
    ? syncStatusLine()
    : `<details class="restore-github">
        <summary class="btn-quiet">Restore from GitHub</summary>
        <p class="hint">Paste your GitHub access key to bring back the log saved in ${sync.REPO}.</p>
        ${syncForm()}
      </details>`;
  return `<section class="setup">
    ${waveMark()}
    <h1 class="display">Powerlifting Wave</h1>
    <p class="lede">Enter your current one-rep max for each lift. Every working weight in the 8-week block comes from these numbers.</p>
    <fieldset class="setting">
      <legend class="setting-title">Units</legend>
      ${segmented('unit', unitOptions(), state.unit)}
    </fieldset>
    <form class="max-form" id="setup-form" novalidate>
      ${LIFTS.map((l) => maxField(l, '')).join('')}
      <button class="btn btn-wide" type="submit">Start block 1</button>
    </form>
    ${github}
    <button class="btn-quiet" data-action="restore">Restore a backup file</button>
  </section>`;
}

// `id` is sync-form to connect, or rekey-form to swap in a new key while connected.
function syncForm(id = 'sync-form') {
  return `<form class="sync-form" id="${id}" novalidate>
    <label class="field">
      <span class="field-label">Access key</span>
      <span class="field-row">
        <input class="text-input" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_">
      </span>
    </label>
    <label class="date-field">
      <span class="field-note">Expires on</span>
      <input class="date-input" name="expires" type="date" min="${todayISO()}">
    </label>
    <button class="btn" type="submit">${id === 'rekey-form' ? 'Use this key' : 'Connect'}</button>
  </form>`;
}

function syncStatusText(status) {
  const when = sync.lastSynced();
  if (status === 'pending' || status === 'saving') return 'Saving to GitHub…';
  if (status === 'offline') return "Not saved yet: can't reach GitHub. It will try again when you're back online.";
  if (status === 'bad-key') return 'GitHub rejected the access key. It may have expired. Disconnect, then connect with a new key.';
  if (status === 'error') return "GitHub didn't accept the last save. It will try again after your next change.";
  return when ? `Saved to GitHub ${savedAt(when)}.` : 'Connected. Your log saves to GitHub after your next change.';
}

function syncSection() {
  if (!sync.isConnected()) {
    return `<section class="setting">
      <h2 class="setting-title">Save to GitHub</h2>
      <p class="hint">Saves your log to your private ${sync.REPO} repository a few seconds after every change. Paste the access key you made on GitHub.</p>
      ${syncForm()}
    </section>`;
  }
  return `<section class="setting" id="sync-setting">
    <h2 class="setting-title">Save to GitHub</h2>
    ${syncStatusLine()}
    <p class="hint">GitHub keeps every saved version, so an older log can always be recovered. Load from GitHub brings in changes made somewhere else, replacing this phone's log.</p>
    <div class="button-row">
      <button class="btn" data-action="sync-now">Save now</button>
      <button class="btn-quiet" data-action="sync-load">Load from GitHub</button>
      <button class="btn-quiet" data-action="sync-disconnect">Disconnect</button>
    </div>
    <label class="date-field key-expires">
      <span class="field-note">Access key expires on</span>
      <input class="date-input" name="keyExpires" type="date" value="${sync.keyExpires() ?? ''}">
    </label>
    <p class="hint">GitHub won't tell the app, so copy it from the key's page: github.com → Settings → Developer settings → Fine-grained tokens. Two weeks before, Train reminds you to make a new one.</p>
    <details class="restore-github">
      <summary class="btn-quiet">Use a new key</summary>
      <p class="hint">Make one the same way as the first (Generate new token on that page, only the powerlifting-wave-data repository, Contents read and write), then paste it here. Your log stays as it is.</p>
      ${syncForm('rekey-form')}
    </details>
  </section>`;
}

const HEAVY_CUE = 'Thursday and Friday are heavier days with fewer reps. They should feel smooth, with 2–4 reps left; harder than that means your max is set too high.';
const TEST_CUE = 'Monday to Wednesday, the last set (marked 2+) is as many clean reps as you can: use a spotter or safety arms.';

function weekNote(b, week) {
  if (week === FINISH_WEEK) {
    return b.finish === 'remax'
      ? 'Test your max: bench Monday, squat Tuesday, deadlift Wednesday, and no Thursday or Friday. Your best good single becomes your next max.'
      : 'Recovery: light weights on all five days so the next block starts fresh. Your next maxes come from your week 6 test sets.';
  }
  if (week === FIRST_TEST) return `Heavy peak. ${TEST_CUE} It sets your max for weeks 4–8.`;
  if (week === FIRST_TEST + 3) {
    const next = b.finish === 'remax' ? 'your re-max attempts in week 8' : 'your next block’s max';
    return `The heaviest week. ${TEST_CUE} It sets ${next}.`;
  }
  if (week === FINISH_WEEK - 1) {
    return 'Less work at the same weights, so you’re fresh for week 8. Monday to Wednesday start with one heavy single, then two easy doubles. Thursday and Friday, move the bar fast.';
  }
  if (week === WAVE_TWO) return `The first wave again, about 5% heavier with a rep fewer, from the max your week 3 test sets settled on. ${HEAVY_CUE}`;
  return `${WEEKS[week].note}. ${HEAVY_CUE} Missed a day? Do it next time you train, or skip it.`;
}

// Opens the day due today if it's in this week, otherwise the week's first unfinished day.
function defaultOpen(b, week) {
  const due = dueSession(b, todayISO());
  if (due?.week === week) return due.index;
  const index = b.log[week].findIndex((s) => ['todo', 'started'].includes(sessionStatus(s)));
  return index === -1 ? null : index;
}

// Days passed over, as "missed" keys, so the notice about them can be put off until they change.
const missedKey = (missed) => missed.map((m) => `${m.week}-${m.index}`).join(' ');

// Guidance for missed training: restart after a long break, skip days passed over, repeat a mostly skipped week.
// A GitHub key about to run out gets its own notice on top.
function notice(b) {
  return `${trainingNotice(b)}${keyNotice()}`;
}

function trainingNotice(b) {
  const today = todayISO();
  const days = longBreak(b, today);
  if (days) {
    return `<aside class="notice">
      <p>It's been ${days} days since you last trained. After two weeks or more off, restart the block at week 1 rather than picking up where you left off.</p>
      <div class="button-row">
        <button class="btn" data-action="restart-block">Restart at week 1</button>
        <button class="btn-quiet" data-action="keep-going">Keep going</button>
      </div>
    </aside>`;
  }
  const missed = missedSessions(b, today);
  if (missed.length && ui.missedLater !== missedKey(missed)) {
    const names = missed.map(({ week, index }) => {
      const s = b.log[week][index];
      return `${s.day}'s ${liftOf(s).name.toLowerCase()}${week === ui.week ? '' : ` in week ${week + 1}`}`;
    });
    const one = missed.length === 1;
    return `<aside class="notice">
      <p>You missed ${listDays(names)}. Skip ${one ? 'it' : 'them'} to move on, or tap ${one ? 'the day' : 'a day'} to do it now. Skipped days don't count for or against your next max.</p>
      <div class="button-row">
        <button class="btn" data-action="skip-missed">${one ? `Skip ${b.log[missed[0].week][missed[0].index].day}` : missed.length === 2 ? 'Skip both' : `Skip all ${missed.length}`}</button>
        <button class="btn-quiet" data-action="missed-later">Not now</button>
      </div>
    </aside>`;
  }
  const repeat = weekToRepeat(b);
  if (repeat !== null) {
    return `<aside class="notice">
      <p>You skipped most of week ${repeat + 1}. Repeat it before moving on, or log a set this week to carry on.</p>
      <div class="button-row">
        <button class="btn" data-action="repeat-week" data-week="${repeat}">Repeat week ${repeat + 1}</button>
      </div>
    </aside>`;
  }
  return '';
}

// Two weeks before the GitHub key runs out (the day entered in Settings), a reminder to make a new one.
const KEY_WARN_DAYS = 14;

function keyNotice() {
  const expires = sync.keyExpires();
  const today = todayISO();
  if (!sync.isConnected() || !expires || sync.keyRemindAfter() >= today) return '';
  const left = daysBetween(today, expires);
  if (left > KEY_WARN_DAYS) return '';
  const when = left > 1 ? `expires in ${left} days, on ${shortDate(expires)}` : left === 1 ? 'expires tomorrow' : left === 0 ? 'expires today' : `expired on ${shortDate(expires)}`;
  return `<aside class="notice">
    <p>Your GitHub access key ${when}. Make a new one and add it in Settings → Save to GitHub, or saving stops.</p>
    <div class="button-row">
      <button class="btn" data-action="tab" data-tab="settings" data-to="sync-setting">Open Settings</button>
      <button class="btn-quiet" data-action="key-later">Not today</button>
    </div>
  </aside>`;
}

function trainView() {
  const b = block();
  const n = state.blocks.length;
  // The day due today: today's day of the week when it's still to do, else the next to train (see dueSession).
  const next = dueSession(b, todayISO());
  if (ui.week === null || ui.week >= b.log.length) ui.week = next?.week ?? currentWeek(b);
  // One day shows at a time: the one picked, else the one due, else the week's first.
  if (ui.open === undefined || ui.open === null || ui.open >= b.log[ui.week].length) ui.open = defaultOpen(b, ui.week) ?? 0;
  const last = ui.week === b.log.length - 1;
  const finish = ui.week === FINISH_WEEK
    ? `<button class="btn-quiet" data-action="switch-finish">${b.finish === 'remax' ? 'Deload this week instead' : 'Re-max this week instead'}</button>`
    : '';
  const session = b.log[ui.week][ui.open];
  const missed = missedSessions(b, todayISO());
  return `<header class="top">
      <h1 class="display">Block ${n}</h1>
      <p class="top-meta">Started ${shortDate(b.started)}</p>
    </header>
    ${notice(b)}
    ${weekCard(b)}
    ${waveNav(b)}
    <p class="week-line"><span class="week-count">Week ${ui.week + 1} of ${BLOCK_WEEKS}</span> <span class="week-title">${weekName(b, ui.week)}</span></p>
    ${dayTabs(b, next, missed)}
    ${dayPanel(b, session, ui.open, next?.week === ui.week && next.index === ui.open, isMissed(missed, ui.week, ui.open))}
    <section class="week-head">
      <h2 class="week-about">About week ${ui.week + 1}</h2>
      <p class="week-note">${weekNote(b, ui.week)}</p>
      ${finish}
    </section>
    ${last ? `<div class="block-end">
      <button class="btn btn-wide" data-action="review" data-key="review">Finish block</button>
      <p class="hint">See how the block went and set your maxes for block ${n + 1}.</p>
    </div>` : ''}`;
}

// ---------- The week's card ----------
// A finished week's numbers at the top of Train: while that week is shown, and on the next week until anything in
// it is done or Hide is tapped (remembered on this phone only). Week 8 has the block review instead.

const WEEK_HIDDEN = 'powerlifting-wave-week-hidden';
const weekId = (b, week) => `${b.started} ${week}`;

function hiddenWeek() {
  try {
    return localStorage.getItem(WEEK_HIDDEN);
  } catch {
    return null;
  }
}

// The week the card is for, and whether it can be hidden; null when there's no card.
function cardWeek(b) {
  const done = (w) => w >= 0 && w < FINISH_WEEK && weekProgress(b, w) === 1;
  if (done(ui.week)) return { week: ui.week, hide: false };
  const prev = ui.week - 1;
  if (!done(prev) || b.log[ui.week].some((s) => touched(s) || s.started) || hiddenWeek() === weekId(b, prev)) return null;
  return { week: prev, hide: true };
}

// "Nov 2 – 6" within a month of this year, else both dates in full.
function dateSpan(from, to) {
  if (from === to) return shortDate(from);
  const compact = from.slice(0, 7) === to.slice(0, 7) && Number(from.slice(0, 4)) === new Date().getFullYear();
  return `${shortDate(from)} – ${compact ? Number(to.slice(8)) : shortDate(to)}`;
}

// "51 min", "2 h 53".
const spanShort = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

const FEEL_CHIP = { easy: 'is-up', smooth: '', grind: 'is-down' };

// A day's mark under its top set: the feel picked on a heavy day, else reps short of or past the prescription.
function dayChip(d) {
  if (d.skipped) return '<span class="recap-chip">Skipped</span>';
  if (d.feel) return `<span class="recap-chip ${FEEL_CHIP[d.feel]}">${FEEL_TEXT[d.feel][0]}</span>`;
  if (d.short) return `<span class="recap-chip is-down" aria-label="${plural(d.short, 'rep')} short">−${d.short}</span>`;
  if (d.over) return `<span class="recap-chip is-up" aria-label="${plural(d.over, 'rep')} extra">+${d.over}</span>`;
  return '';
}

// What a finished week says to keep an eye on: heavy days that were a grind, and what a test week did to the maxes.
function weekWatch(b, week, w) {
  const notes = [];
  const names = (lifts) => listDays(lifts.map((l) => l.short.toLowerCase()));
  // In the week's order: bench before squat.
  const ground = [...new Set(w.days.filter((d) => d.feel === 'grind').map((d) => d.lift))].map((id) => LIFTS.find((l) => l.id === id));
  const many = ground.filter((l) => heavyFeel(b, l.id).grind >= GRINDS);
  const once = ground.filter((l) => !many.includes(l));
  if (many.length) {
    notes.push({
      down: true,
      title: many.length === 1 ? `${plural(heavyFeel(b, many[0].id).grind, 'grind')} on heavy ${names(many)} days` : `${GRINDS} or more grinds each on ${names(many)}`,
      text: state.trainingMax
        ? `Already on a 90% training max, so lower ${many.length === 1 ? 'that max' : 'those maxes'} in Settings → Current maxes.`
        : `That's a max set too high. Use a 90% training max in Settings → Work from, or lower it in Settings → Current maxes.`,
    });
  }
  if (once.length) {
    const next = week + 1 < FINISH_WEEK ? b.log[week + 1].filter((s) => s.kind === 'heavy' && once.some((l) => l.id === s.lift)) : [];
    const ahead = next.map((s) => `${s.day.slice(0, 3)} ${liftOf(s).short.toLowerCase()} ${fmt(setWeight(b, s, week + 1, 0, state))}`);
    notes.push({
      down: true,
      title: `${capital(names(once))} ground once${once.length > 1 ? ' each' : ''}`,
      text: `A second grind this block says that max is set too high.${ahead.length ? ` Next week's heavy days: ${ahead.join(', ')}.` : ''}`,
    });
  }
  const tested = LIFTS.map((l) => ({ l, t: testResult(b, l.id, week, state) })).filter((x) => x.t);
  if (week === FIRST_TEST && tested.length) {
    const said = tested.map(({ l }) => {
      const was = b.max[l.id];
      const next = weekMax(b, l.id, WAVE_TWO, state);
      return `${l.short.toLowerCase()} ${fmt(next)}${next === was ? '' : ` (${signed(next - was)})`}`;
    });
    notes.push({ title: 'Maxes for weeks 4–8', text: `${capital(said.join(', '))}.` });
  } else if (week === SECOND_TEST && tested.length) {
    const said = tested.map(({ l, t }) => `${l.short.toLowerCase()} ${fmt(Math.round(t.estimate))}`);
    notes.push({ title: 'Week 6 estimates', text: `${capital(said.join(', '))}. ${b.finish === 'remax' ? 'Your re-max attempts build from them.' : 'They set next block’s maxes.'}` });
  }
  return notes.map((n) => `<p class="recap-watch${n.down ? ' is-down' : ''}"><strong>${n.title}</strong><span>${n.text}</span></p>`).join('');
}

function weekCard(b) {
  const at = cardWeek(b);
  if (!at) return '';
  const { week, hide } = at;
  const w = weekSummary(state, state.blocks.length - 1, week);
  if (!w.trained) return '';
  const days = w.days.map((d) => `<li class="${d.feel === 'grind' || d.short ? 'is-down' : ''}${d.skipped ? 'is-skipped' : ''}">
      <span class="recap-day">${d.day.slice(0, 3)}</span>
      <span class="recap-top">${d.top ? `${fmt(d.top.weight)}×${d.top.reps}` : '–'}</span>
      <span class="recap-lift">${LIFTS.find((l) => l.id === d.lift).short}</span>
      ${dayChip(d)}
    </li>`).join('');
  return `<section class="recap" style="--card:${oklch(heatColour(weekHeat(b, week)))}" aria-label="Week ${week + 1} summary" data-key="recap">
    <div class="recap-head">
      <h2 class="recap-title">Week ${week + 1} done</h2>
      ${hide ? `<button class="btn-quiet recap-hide" data-action="week-hide" data-week="${week}">Hide</button>` : ''}
    </div>
    <p class="recap-meta">${w.from ? `${dateSpan(w.from, w.to)} · ` : ''}${weekName(b, week)} · ${w.trained} of ${plural(b.log[week].length, 'day')}</p>
    <dl class="stats">
      <div><dt>Sets</dt><dd>${w.sets}</dd></div>
      <div><dt>Volume</dt><dd>${Math.round(w.volume).toLocaleString()}</dd></div>
      ${w.timed ? `<div><dt>Timed</dt><dd>${spanShort(w.ms)}</dd></div>` : ''}
      ${w.bests ? `<div><dt>Bests</dt><dd>${w.bests}</dd></div>` : ''}
    </dl>
    <ul class="recap-days" style="--n:${w.days.length}" aria-label="Top set each day">${days}</ul>
    ${weekWatch(b, week, w)}
    <div class="recap-foot">
      ${w.extrasDue ? `<p class="hint">${w.extrasDone} of ${plural(w.extrasDue, 'accessory')} done.</p>` : ''}
      <button class="btn-line" data-action="week-muscles" data-week="${week}">Sets per muscle</button>
    </div>
  </section>`;
}

function waveNav(b) {
  const weeks = b.log.map((_, i) => {
    const p = weekProgress(b, i);
    return `<button class="wave-week" data-action="week" data-week="${i}" data-key="week-${i}" aria-pressed="${i === ui.week}"
        aria-label="Week ${i + 1}, ${weekName(b, i)}, ${Math.round(p * 100)}% done">
      <span class="wave-bar" style="--h:${waveHeight(weekPct(b, i), 12, 50).toFixed(1)}px;--fill:${p.toFixed(3)}"></span>
      <span class="wave-label">${i + 1}</span>
    </button>`;
  });
  return `<nav class="wave" aria-label="Weeks">${weeks.join('')}</nav>`;
}

const liftOf = (session) => LIFTS.find((l) => l.id === session.lift);
const isHeavyDay = (session) => session.kind === 'heavy' && ui.week !== FINISH_WEEK;

const isMissed = (missed, week, index) => missed.some((m) => m.week === week && m.index === index);

// The week's days as tabs, each with a light: white when done, a ring when started, a dash when skipped.
function dayTabs(b, next, missed) {
  const days = b.log[ui.week];
  return `<nav class="days" aria-label="Days" style="--n:${days.length}">${days.map((s, i) => {
    const status = sessionStatus(s);
    const isNext = next?.week === ui.week && next.index === i;
    const todo = isMissed(missed, ui.week, i) ? 'missed' : isNext ? 'up next' : 'not started';
    const said = { done: 'done', skipped: 'skipped', started: 'started', todo }[status];
    return `<button class="day-tab" data-action="session" data-index="${i}" data-key="day-${i}" data-status="${status}"${isNext ? ' data-next' : ''}
        aria-pressed="${ui.open === i}" aria-label="${s.day}, ${liftOf(s).name}, ${said}">
      <span class="day-tab-day">${s.day.slice(0, 3)}</span>
      <span class="day-tab-lift">${liftOf(s).short}</span>
      <span class="day-tab-light" aria-hidden="true"></span>
    </button>`;
  }).join('')}</nav>`;
}

function dayPanel(b, session, i, isNext, missed) {
  const status = sessionStatus(session);
  const logged = session.reps.filter((r) => r !== null).length;
  const what = session.kind === 'max' ? 'attempt' : 'set';
  const label = {
    skipped: 'Skipped',
    done: 'Done',
    started: `${logged} of ${plural(session.reps.length, what)}`,
    todo: missed ? 'Missed' : isNext ? 'Up next' : '',
  }[status];
  const tag = session.kind === 'max' ? ', re-max' : isHeavyDay(session) ? ', heavy day' : '';
  return `<section class="day-panel" data-status="${status}" aria-label="${session.day}">
    <div class="day-head">
      <span class="session-day">${session.day}${tag}</span>
      <h2 class="session-lift">${liftOf(session).name}</h2>
      <span class="session-state">${label}</span>
    </div>
    ${dayTiming(session, i)}
    ${isNext ? weighIn(session) : ''}
    ${sessionBody(b, session, i)}
    ${daySummary(b, session, i)}
  </section>`;
}

// Start workout before the day begins; once started, the running time, and when ended, how long it took.
function dayTiming(session, i) {
  if (!session.started) {
    if (['done', 'skipped'].includes(sessionStatus(session))) return '';
    return `<button class="btn-line day-start" data-action="workout-start" data-index="${i}" data-key="start-${i}">Start workout</button>`;
  }
  if (!session.ended) {
    return `<p class="day-time">Started ${clockTime(session.started)}, <span class="day-elapsed" data-start="${session.started}">${spanText(Date.now() - Date.parse(session.started))}</span> so far.</p>`;
  }
  const reopen = session.date === todayISO()
    ? ` <button class="btn-quiet day-reopen" data-action="workout-reopen" data-index="${i}" data-key="reopen-${i}">Reopen</button>` : '';
  return `<p class="day-time">${clockTime(session.started)} to ${clockTime(session.ended)}, ${spanText(workoutTime(session).total)}.${reopen}</p>`;
}

// Once a week, on the first day trained, a reminder to log body weight: the strength-for-size numbers in Stats
// use the latest.
function weighIn(session) {
  if (session.skipped) return '';
  const latest = state.bodyweight[state.bodyweight.length - 1];
  if (latest && latest.date >= weekStartISO()) return '';
  return `<button class="btn-quiet day-weigh" data-action="bodyweight-open" data-key="weigh-in">Log body weight${latest
    ? `<span class="day-weigh-last">, last ${fmt(latest.weight)} on ${shortDate(latest.date)}</span>` : ''}</button>`;
}

// Keeps the running time on a started day current without redrawing the page.
function tickElapsed() {
  for (const el of view.querySelectorAll('.day-elapsed')) el.textContent = spanText(Date.now() - Date.parse(el.dataset.start));
}

const skipButton = (session, i) => (sessionStatus(session) === 'done' ? ''
  : `<button class="btn-quiet" data-action="skip" data-index="${i}" data-key="skip-${i}">Skip this day</button>`);

// Anything on a day beyond a skip: a date, the clock, warm-ups, sets, attempts or accessories.
const hasWork = (s) => Boolean(s.date || s.started || s.warmups) || touched({ ...s, skipped: false });

// Clear this day, for one started by mistake: it erases everything done on the day (after asking).
const clearButton = (session, i) => (hasWork(session)
  ? `<button class="btn-quiet" data-action="day-clear" data-index="${i}" data-key="clear-${i}">Clear this day</button>` : '');

function dayEnd(session, i) {
  const buttons = skipButton(session, i) + clearButton(session, i);
  return buttons ? `<div class="day-end">${buttons}</div>` : '';
}

// A day as the start warning and Clear this day name it: "week 8 Monday's bench re-max".
const dayName = (week, s) => `week ${week + 1} ${s.day}'s ${liftOf(s).short.toLowerCase()}${s.kind === 'max' ? ' re-max' : ''}`;

function sessionBody(b, session, i) {
  if (session.skipped) {
    return `<div class="session-body">
      <p class="hint">You skipped this day's ${liftOf(session).name.toLowerCase()}. It doesn't count toward your next max.</p>
      <div class="day-end">
        <button class="btn-quiet" data-action="unskip" data-index="${i}" data-key="unskip-${i}">Undo skip</button>
        ${clearButton(session, i)}
      </div>
      ${extrasSection(session, i)}
    </div>`;
  }
  if (session.kind === 'max') return remaxBody(b, session, i);
  const lift = liftOf(session);
  const p = prescription(session.kind, ui.week);
  const max = weekMax(b, lift.id, ui.week, state);
  const work = workingMax(max, state);
  const target = targetWeight(work, session.kind, ui.week, state.round);
  const shown = session.weight ?? target;
  const single = singleWeight(b, session, ui.week, state);
  const ramp = [...warmups(work, single ?? shown, state.unit, state.round), ...(single ? [{ weight: single, reps: '1', single: true }] : [])];
  const moved = max - b.max[lift.id];
  const tested = moved && ui.week >= WAVE_TWO ? maxSince(maxChanges(state, lift.id), state.blocks.length - 1, ui.week).date : null;
  const movedNote = moved && ui.week >= WAVE_TWO
    ? `<p class="hint">${moved > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(moved))} from ${fmt(b.max[lift.id])} after your week 3 test set${tested ? ` on ${shortDate(tested)}` : ''}.</p>` : '';
  return `<div class="session-body">
    <p class="lift-scheme">${p.sets} × ${p.reps} at ${tidy(p.pct * 100)}% of ${fmt(work)}${state.trainingMax ? ' (training max)' : ''}. Rest ${restText(restSeconds(session, ui.week, 1))} between sets.</p>
    ${movedNote}
    <div class="lift-stage">
      ${liftGraph(b, session, i)}
      <button class="lift-weight" data-action="weight" data-index="${i}" data-key="weight-${i}"
          aria-label="${lift.name}, ${fmt(shown)} ${state.unit}. Change weight">
        <span class="lift-num">${fmt(shown)}</span><span class="lift-unit">${state.unit}</span>
      </button>
      ${session.weight !== null && session.weight !== target ? `<p class="lift-target">Target is ${fmt(target)}</p>` : ''}
      ${barbell(shown)}
    </div>
    ${warmupList(session, i, ramp, single ? `The last is one heavy single at ${tidy(p.single * 100)}%. Rest ${SINGLE_REST / 60} minutes after it, before your sets.` : '')}
    ${isHeavyDay(session) ? '<p class="hint">Heavy day: stop each set with 2–4 reps left in the tank.</p>' : ''}
    <div class="sets" role="group" aria-label="${lift.name} sets">
      ${session.reps.map((r, s) => setLight(session, i, s, r)).join('')}
    </div>
    ${testGuide(session)}
    ${isHeavyDay(session) && sessionStatus(session) === 'done' ? feelCheck(b, session, i) : ''}
    ${dayEnd(session, i)}
    ${extrasSection(session, i)}
  </div>`;
}

// One side's plates for a weight on the barbell, from the plates you have: "45 + 10 + 2.5", with what they make
// when it isn't the weight.
function barPlates(weight) {
  const plates = platesPerSide(weight, state.unit, BAR[state.unit], plateSizes(state));
  if (!plates.length) return 'Empty bar';
  const made = tidy(BAR[state.unit] + 2 * plates.reduce((sum, p) => sum + p, 0));
  return `${plates.map(fmt).join(' + ')}${made === weight ? '' : ` (${fmt(made)})`}`;
}

// The warm-up as steps to tick off, each with the plates a side: the empty bar, then `ramp` ({ weight, reps },
// a taper day's heavy single marked `single`). A tick is kept in session.warmups by step; the first tick of the
// day starts the workout clock, and the last step's starts the rest before the first work set.
function warmupList(session, i, ramp, note) {
  const steps = [{ weight: BAR[state.unit], reps: '5–10' }, ...ramp];
  const rows = steps.map((s, k) => {
    const done = Boolean(session.warmups?.[k]);
    return `<li><button class="warm-step${done ? ' is-done' : ''}" data-action="warmup" data-index="${i}" data-step="${k}"${k === steps.length - 1 ? ' data-last' : ''} data-key="warm-${i}-${k}" aria-pressed="${done}">
      <i class="warm-tick" aria-hidden="true"></i>
      <span class="warm-load">${fmt(s.weight)} × ${s.reps}${s.single ? ' <small>single</small>' : ''}</span>
      <span class="warm-plates">${barPlates(s.weight)}</span>
    </button></li>`;
  }).join('');
  return `<section class="warm" aria-label="Warm-up">
    <h3 class="warm-title">Warm-up</h3>
    <ol class="warm-list">${rows}</ol>
    ${note ? `<p class="warmup">${note}</p>` : ''}
  </section>`;
}

// Rest after the last warm-up: what the first work set or attempt gets, or SINGLE_REST after a taper day's heavy
// single.
const SINGLE_REST = 180;
const warmupRest = (session) => (session.kind !== 'max' && singleWeight(block(), session, ui.week, state)
  ? SINGLE_REST : restSeconds(session, ui.week, 0));

// After the last set of a heavy day: how the sets moved, since heavy days should leave 2–4 reps in the tank. Two
// grinds on a lift in a block say its max is set too high, which a 90% training max fixes.
const FEEL_TEXT = { easy: ['Easy', '5+ left'], smooth: ['Smooth', '2–4 left'], grind: ['Grind', '0–1 left'] };
const FEEL_SAID = {
  easy: 'More in the tank than a heavy day needs. Your week 3 and 6 test sets will move the max if it’s low.',
  smooth: 'Right where a heavy day should be.',
  grind: `One grind can be a bad day. ${GRINDS} in a block says your max is set too high.`,
};

function feelCheck(b, session, i) {
  const lift = liftOf(session);
  const picks = FEELS.map((f) => `<button class="feel-pick" data-action="feel" data-index="${i}" data-feel="${f}" data-key="feel-${i}-${f}" aria-pressed="${session.feel === f}">
      <strong>${FEEL_TEXT[f][0]}</strong><span>${FEEL_TEXT[f][1]}</span>
    </button>`).join('');
  const grinds = heavyFeel(b, lift.id).grind;
  let said = session.feel ? `<p class="hint">${FEEL_SAID[session.feel]}</p>` : '';
  if (session.feel === 'grind' && grinds >= GRINDS) {
    const max = weekMax(b, lift.id, ui.week, state);
    const now = targetWeight(workingMax(max, state), session.kind, ui.week, state.round);
    const tm = targetWeight(max * 0.9, session.kind, ui.week, state.round);
    said = state.trainingMax
      ? `<p class="hint">That's ${grinds} grinds on heavy ${lift.short.toLowerCase()} days this block, already on a 90% training max. Lower your ${lift.short.toLowerCase()} max in Settings → Current maxes.</p>`
      : `<p class="hint">That's ${grinds} grinds on heavy ${lift.short.toLowerCase()} days this block: your max is likely set too high. A 90% training max takes every percentage from 90% of your maxes, all three lifts, so today's ${fmt(now)} would have been ${fmt(tm)}.</p>
        <button class="btn-line feel-tm" data-action="feel-tm" data-key="feel-tm-${i}">Use a 90% training max</button>`;
  }
  return `<section class="feel" aria-label="How the sets moved">
    <h3 class="feel-title">How did they move?</h3>
    <div class="feel-picks">${picks}</div>
    ${said}
  </section>`;
}

// Where a training day sits in the log, for finding the last time an accessory was done before it.
const here = (index) => [state.blocks.length - 1, ui.week, index];

function extraPlan(session, index, exercise) {
  const entry = entryOf(session, exercise.id);
  const variant = entry?.variant ?? defaultVariant(state, exercise);
  // The last two full sessions: two short ones in a row at one weight bring it down.
  const earlier = earlierTimes(state, exercise.id, variant, here(index), true);
  const last = earlier[earlier.length - 1] ?? null;
  const prior = earlier[earlier.length - 2] ?? null;
  return { entry, variant, last, plan: suggestion(exercise, last, ui.week, state.unit, { prior, sizes: plateSizes(state) }) };
}

// The day's record for an exercise, made with the week's number of sets the first time it's needed.
const entryFor = (session, exercise, variant) => ensureEntry(session, exercise, variant, plannedSets(exercise, ui.week));

// The weight and reps a set is prefilled with: the plan from last time, or else today's set before it
// (the first time through, and for sets added past the plan).
function extraTarget(exercise, entry, plan, set) {
  const planned = set < plan.reps.length;
  if (planned && plan.weights[set] !== null) return { weight: plan.weights[set], reps: plan.reps[set] };
  const prev = entry?.sets.slice(0, set).filter(Boolean).pop();
  if (prev) return { ...prev };
  return { weight: null, reps: planned ? plan.reps[set] : exercise.low };
}

// Accessories as a compact list: one line each, with the exercise (or superset) being done opened up.
function extrasSection(session, i) {
  const groups = dayGroups(state, session);
  const open = openGroup(session, groups);
  // A started day ends with End workout, which also skips whatever is left; otherwise Skip the rest does just that.
  const end = session.started && !session.ended
    ? `<button class="btn-line" data-action="workout-end" data-index="${i}" data-key="workout-end-${i}">End workout</button>`
    : groups.flat().some((e) => !isFinished(entryOf(session, e.id)))
      ? `<button class="btn-quiet" data-action="extra-finish" data-index="${i}" data-key="extra-finish-${i}">Skip the rest</button>` : '';
  return `<section class="extras" aria-label="Accessories">
    <h3 class="extras-title">Accessories</h3>
    ${groups.length ? `<ol class="extra-list">${groups.map((g) => groupView(session, i, g, g[0].id === open)).join('')}</ol>`
      : `<p class="hint">Nothing on ${session.day}s yet. Add the exercises you do after your ${liftOf(session).name.toLowerCase()}.</p>`}
    <div class="extras-end">
      <button class="btn-quiet" data-action="extra-add" data-index="${i}" data-key="extra-add-${i}">Add an exercise</button>
      ${end}
    </div>
  </section>`;
}

const isUnderway = (x) => x && !x.skipped && x.sets.some(Boolean) && x.sets.some((s) => s === null);
const isFinished = (x) => Boolean(x) && (x.skipped || (x.sets.length > 0 && x.sets.every(Boolean)));

// The group to show open: the one tapped, else one under way today. Its first exercise's id names it.
function openGroup(session, groups, tapped = ui.extraOpen) {
  if (tapped !== undefined) return tapped;
  return groups.find((g) => g.some((e) => isUnderway(entryOf(session, e.id))))?.[0].id ?? null;
}

// Today's sets once anything is recorded, so sets added or removed today stick; else the week's planned number.
const setCount = (e, entry) => entry?.sets.length ?? plannedSets(e, ui.week);

// ---------- Skips that leave a muscle short ----------

// The first day of the week on view still to come: the day due today when it's in this week, the first day when
// that's in a later week (looking ahead), and none when the week is behind it.
function weekFrom() {
  const due = dueSession(block(), todayISO());
  if (!due || due.week > ui.week) return Infinity;
  return due.week < ui.week ? 0 : due.index;
}

// What skipping an accessory would leave its muscle's week at (extras.js skipConcern), while it can still be
// skipped: nothing logged and not skipped yet.
function concernFor(session, i, e) {
  const entry = entryOf(session, e.id);
  if (entry?.skipped || entry?.sets.some(Boolean)) return null;
  return skipConcern(state, here(i), e, weekFrom());
}

// It says "direct" because each exercise counts toward one muscle: a squat does nothing for glutes here.
function concernText(c) {
  const m = c.muscle.toLowerCase();
  const head = c.sets > c.done ? `Without it: ${m} at ${c.sets} of ${c.target} sets this week.`
    : c.done ? `The last direct work for ${m} this week: ${c.done} of ${c.target} sets without it.`
      : `Your only direct work for ${m} this week.`;
  const streak = c.streak > 1 ? ` Skipped the last ${c.streak} times.` : c.streak ? ' Skipped last time too.' : '';
  const lastWeek = c.lastWeek === null ? '' : ` Short last week too: ${c.lastWeek} of ${c.target}.`;
  const others = c.others.length ? ` ${listDays(c.others.map((e) => e.name))} ${c.others.length > 1 ? 'are' : 'is'} still left today.` : '';
  return `${head}${streak}${lastWeek}${others}`;
}

// A skip that keeps happening, or a muscle short two weeks running, is marked stronger.
const concernHTML = (c, tag = 'span') => (c
  ? `<${tag} class="skip-warn${c.streak > 1 || c.lastWeek !== null ? ' is-strong' : ''}">${esc(concernText(c))}</${tag}>` : '');

// A closed line warns only when the exercise was skipped last time or its muscle was short last week too. Any
// other skip that leaves the week short says so when it's tapped, or in the opened exercise, so a week with a
// 6-set muscle doesn't light up every line of exercises that get done anyway.
const closedConcern = (c) => (c && (c.streak > 0 || c.lastWeek !== null) ? c : null);

// What's left of a day, before Skip the rest or End workout skips it.
const unfinished = (session) => dayExtras(state, session).filter((e) => !isFinished(entryOf(session, e.id)));

// Once those are skipped: the muscles among them that end the week short, as a sentence, or '' when none do.
function shortWeekText(i, skipped) {
  if (isLightWeek(ui.week)) return '';
  const outlook = muscleOutlook(state, block().log[ui.week], ui.week, Math.min(weekFrom(), i));
  const short = [...new Set(skipped.map((e) => e.muscle))].filter((m) => outlook.get(m) && outlook.get(m).sets < outlook.get(m).target);
  if (!short.length) return '';
  return ` Short this week: ${short.map((m) => `${m.toLowerCase()} ${outlook.get(m).sets} of ${outlook.get(m).target}`).join(', ')} sets.`;
}

// One exercise's line in the list: name, a light per set, either today's sets or last time's, and what skipping it
// would do to its muscle's week when that falls short (on a closed line, see closedConcern).
function rowLine(session, i, e, open = false) {
  const { entry, variant, last } = extraPlan(session, i, e);
  const concern = concernFor(session, i, e);
  const range = `${plannedSets(e, ui.week)} × ${e.low}–${e.high}`;
  const done = entry?.sets.filter(Boolean) ?? [];
  const count = setCount(e, entry);
  const summary = entry?.skipped ? 'Skipped today'
    : done.length ? `${done.length === count ? plural(count, 'set') : `${done.length} of ${count} sets`}: ${setsText(done, e)}`
      : last ? `${range}. Last ${setsText(last.sets, e)}` : `${range}. New`;
  const dots = entry?.skipped ? '' : Array.from({ length: count }, (_, s) => `<i class="dot${entry?.sets[s] ? ' is-on' : ''}"></i>`).join('');
  return `${picHTML(e, variant, entry?.skipped ? 'is-dim' : '')}<span class="row-line${entry?.skipped ? ' is-skipped' : ''}">
    <span class="row-name">${esc(e.name)}${variant ? ` <span class="row-variant">${esc(variant)}</span>` : ''}</span>
    <span class="row-dots" aria-hidden="true">${dots}</span>
    <span class="row-sum">${summary}</span>
    ${concernHTML(open ? concern : closedConcern(concern))}
  </span>`;
}

function groupView(session, i, group, open) {
  const pair = group.length === 2;
  const key = group[0].id;
  const all = group.map((e) => entryOf(session, e.id));
  const status = all.every((x) => x?.skipped) ? 'skipped'
    : group.every((e, k) => all[k]?.skipped || (all[k] && all[k].sets.every(Boolean))) ? 'done'
      : all.some((x) => x?.sets.some(Boolean)) ? 'started' : 'todo';
  const rest = Math.max(...group.map((e) => e.rest));
  const toggle = (content, id) => `<button class="extra-row" data-action="extra-open" data-group="${key}" data-key="extra-row-${i}-${id}" aria-expanded="${open}">${content}</button>`;
  // Closed, each exercise's line opens the group and has its own skip. Open, the controls are below, and
  // a superset's heading shows the round instead of its halves.
  let heading = group.map((e) => `<div class="extra-line">${toggle(rowLine(session, i, e), e.id)}${quickSkip(session, i, e)}</div>`).join('');
  if (open && pair) {
    const counts = group.map((e, k) => (all[k]?.skipped ? 0 : setCount(e, all[k])));
    const next = supersetOrder(counts).find(({ which, set }) => !all[which]?.sets[set]);
    heading = toggle(`${picHTML(group[0])}<span class="round-line">${next ? `Round ${next.set + 1} of ${Math.max(...counts)}` : 'Every round done'}: ${group.map((e) => esc(e.name)).join(' + ')}</span>`, key);
  } else if (open) {
    heading = toggle(rowLine(session, i, group[0], true), key);
  }
  return `<li class="extra${pair ? ' is-superset' : ''}${open ? ' is-open' : ''}" data-status="${status}">
    <div class="extra-top">
      ${pair ? '<span class="superset-tag">Superset</span>' : ''}
      ${heading}
    </div>
    ${open ? `<div class="extra-body">
      ${pair ? `<p class="hint">One set of each back to back, then rest ${restText(rest)}.</p>` : ''}
      ${group.map((e) => extraDetail(session, i, e, pair)).join('')}
    </div>` : ''}
  </li>`;
}

const lightWeekName = () => (ui.week === FINISH_WEEK ? (block().finish === 'remax' ? 'Re-max week' : 'Deload week') : 'Taper week');

// Plates per side for the next set of an accessory loaded on a bar or a plate-loaded machine; for one
// counted in plates, the weight those plates make.
function plateNote(e, weight) {
  if (weight === null || !(weight > 0)) return '';
  if (isCounted(e)) {
    const side = weightOf(e, weight, state.unit);
    return `${loadText(e, weight)} a side: ${platesText(weight)}. That's ${fmt(side)} ${state.unit} a side, ${fmt(2 * side)} in all.`;
  }
  const load = LOADS[e.plates];
  const bar = load.bar[state.unit];
  if (weight < bar) return `${fmt(weight)} is lighter than the empty ${load.name}.`;
  const plates = platesPerSide(weight, state.unit, bar, plateSizes(state));
  const made = tidy(bar + 2 * plates.reduce((sum, p) => sum + p, 0));
  const on = bar ? `, on the ${fmt(bar)} ${state.unit} ${load.name}` : '';
  const text = `${fmt(weight)} ${state.unit}: ${plates.length ? `${plates.map(fmt).join(' + ')} each side${on}` : `the empty ${load.name}`}`;
  return `${text}${made !== weight ? `. Plates make ${fmt(made)}` : ''}.`;
}

// Once a day's lift and every accessory are done or skipped: what was lifted, and any new bests.
function daySummary(b, session, i) {
  if (!['done', 'skipped'].includes(sessionStatus(session))) return '';
  const extras = dayExtras(state, session).map((e) => ({ e, entry: entryOf(session, e.id) }));
  if (!extras.every(({ entry }) => isFinished(entry))) return '';
  const main = session.skipped ? [] : session.reps.map((r, s) => ({ weight: setWeight(b, session, ui.week, s, state), reps: r, s }));
  const done = extras.filter(({ entry }) => !entry.skipped).map((x) => ({ ...x, sets: x.entry.sets.filter(Boolean) }));
  if (!main.length && !done.length) return '';
  const lift = liftOf(session);
  let lifted = 'Skipped';
  if (session.kind === 'max') {
    const good = main.filter((x) => x.reps > 0).map((x) => x.weight);
    lifted = good.length ? `Best good lift ${fmt(Math.max(...good))}` : 'No good lift';
  } else if (main.length) {
    const test = main.find((x) => isTestSet(session, ui.week, x.s));
    lifted = `${setsText(main)}${test ? `. Est. max ${fmt(Math.round(estimateMax(test.weight, test.reps)))}` : ''}`;
  }
  const skipped = extras.length - done.length;
  const volume = [...main, ...done.flatMap((x) => x.sets.map((s) => ({ weight: loadOf(x.e, s.weight, state.unit), reps: s.reps })))]
    .reduce((sum, x) => sum + x.weight * x.reps, 0);
  const bests = done.filter((x) => isNewBest(state, x.e.id, x.entry.variant, here(i), x.sets)).map((x) => {
    const top = sessionBest(x.sets, x.e, state.unit);
    return `${esc(x.e.name)}${x.entry.variant ? ` (${esc(x.entry.variant)})` : ''}, ${top.kind === 'reps' ? plural(top.value, 'rep') : `est. max ${estText(x.e, top.value)}`}`;
  });
  // On the day itself: exercises skipped time after time while their muscle's week stays on target, offered off
  // this kind of day.
  const drops = session.date === todayISO() ? dropOffers(state, here(i), weekFrom()) : [];
  const kind = drops.length ? kindName(DAY_KINDS.find((k) => k.days.includes(session.day))).toLowerCase() : '';
  const dropList = drops.map(({ exercise: e, times }) => `<li>
      <span>${esc(e.name)}, skipped ${times} times running.</span>
      <button class="btn-quiet summary-drop" data-action="extra-drop" data-index="${i}" data-exercise="${e.id}" data-key="extra-drop-${e.id}">Take it off ${kind}</button>
    </li>`).join('');
  return `<section class="day-summary" aria-label="Workout summary">
    <h3 class="summary-title">Workout done${session.date ? `, ${shortDate(session.date)}` : ''}</h3>
    <dl class="summary-list">
      <div><dt>${lift.name}</dt><dd>${lifted}</dd></div>
      ${extras.length ? `<div><dt>Accessories</dt><dd>${done.length} done${skipped ? `, ${skipped} skipped` : ''}</dd></div>` : ''}
      <div><dt>Volume</dt><dd>${Math.round(volume).toLocaleString()} ${state.unit}</dd></div>
      ${bests.length ? `<div><dt>New bests</dt><dd>${bests.join('<br>')}</dd></div>` : ''}
      ${session.started ? timeSummary(session) : ''}
      ${drops.length ? `<div><dt>Often skipped</dt><dd><ul class="summary-drops">${dropList}</ul></dd></div>` : ''}
    </dl>
  </section>`;
}

// How long the day took and where the time went, in the order things were done, a superset as one.
function timeSummary(session) {
  const time = workoutTime(session);
  const rows = [];
  const lift = time.parts.find((p) => p.part === 'lift');
  if (lift) rows.push({ name: `${liftOf(session).name}, with warm-up`, ms: lift.ms, first: lift.first });
  for (const g of dayGroups(state, session)) {
    const parts = g.map((e) => time.parts.find((p) => p.part === e.id)).filter(Boolean);
    if (!parts.length) continue;
    const names = g.filter((e) => parts.some((p) => p.part === e.id)).map((e) => esc(e.name));
    rows.push({ name: names.join(' + '), ms: parts.reduce((sum, p) => sum + p.ms, 0), first: parts.map((p) => p.first).sort()[0] });
  }
  rows.sort((a, b) => (a.first < b.first ? -1 : 1));
  return `<div><dt>Time</dt><dd>${spanText(time.total)}, ${clockTime(time.start)} to ${clockTime(time.end)}${time.ended ? '' : ' (your last set)'}</dd></div>
    ${rows.length ? `<div><dt>Where it went</dt><dd><ul class="time-rows">${rows.map((r) => `<li><span>${r.name}</span><span>${spanText(r.ms)}</span></li>`).join('')}</ul></dd></div>` : ''}`;
}

// Skip, or undo a skip, without opening the exercise. Gone once a set is logged, as in the open view.
function quickSkip(session, i, e) {
  const entry = entryOf(session, e.id);
  const ids = `data-index="${i}" data-exercise="${e.id}" data-key="row-skip-${i}-${e.id}"`;
  if (entry?.skipped) return `<button class="row-skip" data-action="extra-unskip" ${ids} aria-label="Undo skipping ${esc(e.name)}">Undo</button>`;
  if (entry?.sets.some(Boolean)) return '';
  return `<button class="row-skip" data-action="extra-skip" ${ids} aria-label="Skip ${esc(e.name)} today">Skip</button>`;
}

// The set lights and controls for one exercise; in a superset each half gets its name above it.
function extraDetail(session, i, e, named) {
  const { entry, variant, last, plan } = extraPlan(session, i, e);
  const ids = `data-index="${i}" data-exercise="${e.id}"`;
  const name = named ? `<span class="extra-name">${esc(e.name)}</span>` : '<span></span>';
  if (entry?.skipped) {
    return `<div class="extra-detail is-skipped">
      <div class="extra-head">${named ? name : '<span class="hint">Skipped today.</span>'}<button class="btn-quiet" data-action="extra-unskip" ${ids} data-key="extra-unskip-${i}-${e.id}">Undo skip</button></div>
    </div>`;
  }
  const count = setCount(e, entry);
  const logged = entry ? entry.sets.filter(Boolean).length : 0;
  const lights = Array.from({ length: count }, (_, s) => {
    const done = entry?.sets[s] ?? null;
    const target = extraTarget(e, entry, plan, s);
    const shown = done ?? target;
    const cls = done ? (done.reps >= e.low ? 'set is-good' : 'set is-short') : 'set';
    const label = done ? `Set ${s + 1}, ${done.reps} reps at ${loadText(e, done.weight)}` : `Set ${s + 1}, ${shown.reps} reps${shown.weight === null ? '' : ` at ${loadText(e, shown.weight)}`}, not logged`;
    return `<span class="extra-set">
      <button class="${cls}" data-action="extra-set" ${ids} data-set="${s}" data-key="extra-${i}-${e.id}-${s}" aria-label="${esc(e.name)}. ${label}">${shown.reps}</button>
      <span class="extra-weight">${shown.weight === null ? '–' : loadText(e, shown.weight)}</span>
    </span>`;
  }).join('');
  const planned = plannedSets(e, ui.week);
  const range = `${planned} × ${e.low}–${e.high}`;
  const fewer = planned < e.sets ? ` instead of ${e.sets}` : '';
  const first = isCounted(e) ? `count the plates on each side you can lift ${e.low}–${e.high} times` : `pick a weight you can lift ${e.low}–${e.high} times`;
  const note = isLightWeek(ui.week)
    ? `${lightWeekName()}: ${plural(planned, 'set')}${fewer}${last ? `, repeating last time's ${setsText(last.sets.slice(0, planned), e)}` : ` of ${e.low}–${e.high}`}, so your main lifts stay fresh.`
    : !last ? `${range}. First time: ${first}.`
      : plan.change === 'up' ? `${range}. Last time ${setsText(last.sets, e)}: every set at the top, so go up to ${loadText(e, plan.weights[0])}.`
        : plan.change === 'add' ? `${range}. Last time ${setsText(last.sets, e)}: every set at the top, so add ${isCounted(e) ? `${loadText(e, plan.weights[0])} a side` : `${fmt(plan.weights[0])} ${state.unit}`} and start again at ${e.low}.`
          : plan.change === 'down' ? `${range}. Last time ${setsText(last.sets, e)}, under ${e.low} a set on average for the second time running: down to ${loadText(e, plan.weights[0])} to build back up.`
            : `${range}. Last time ${setsText(last.sets, e)}: same ${isCounted(e) ? 'plates' : 'weight'}, one more rep a set.`;
  const next = Array.from({ length: count }, (_, k) => k).find((k) => !entry?.sets[k]);
  const plates = (e.plates || isCounted(e)) && next !== undefined ? plateNote(e, extraTarget(e, entry, plan, next).weight) : '';
  const chip = e.variants.length > 1
    ? `<button class="chip" data-action="extra-variant" ${ids} data-key="extra-variant-${i}-${e.id}" aria-label="${esc(e.name)} variant: ${esc(variant)}. Change">${esc(variant)}</button>`
    : e.variants.length ? `<span class="chip is-static">${esc(variant)}</span>` : '';
  // A single exercise's warning is on its line above; a superset's heading is the round, so each half has its own.
  return `<div class="extra-detail">
    ${named || chip ? `<div class="extra-head">${name}${chip}</div>` : ''}
    ${named ? concernHTML(concernFor(session, i, e), 'p') : ''}
    <p class="extra-note">${note}</p>
    <div class="sets extra-sets" role="group" aria-label="${esc(e.name)} sets">${lights}</div>
    ${plates ? `<p class="extra-plates">${plates}</p>` : ''}
    <div class="extra-actions">
      ${count < 20 ? `<button class="btn-quiet" data-action="extra-set-add" ${ids}>Add a set</button>` : ''}
      ${count > 1 ? `<button class="btn-quiet" data-action="extra-set-remove" ${ids}>Remove a set</button>` : ''}
      ${logged ? '' : `<button class="btn-quiet" data-action="extra-skip" ${ids} data-key="extra-skip-${i}-${e.id}">Skip today</button>`}
    </div>
  </div>`;
}

// Re-max day: warm-ups built toward the opener, then three attempts judged like a meet.
function remaxBody(b, session, i) {
  const lift = liftOf(session);
  const base = attemptBase(b, lift.id, state);
  const weights = session.reps.map((_, a) => setWeight(b, session, ui.week, a, state));
  const fromTest = base !== weekMax(b, lift.id, FINISH_WEEK - 1, state);
  const ramp = warmups(base, weights[0], state.unit, state.round, REMAX_RAMP[lift.id === 'deadlift' ? 'deadlift' : 'lift']);
  const next = session.reps.findIndex((r) => r === null);
  const loading = next === -1 ? null : next;
  const good = weights.filter((_, a) => session.reps[a] === 1);
  const best = good.length ? Math.max(...good) : null;
  const slow = roundTo(base, state.round);
  const attempts = weights.map((w, a) => `<li class="attempt">
      <span class="attempt-name">${ATTEMPT_NAMES[a]}<span class="attempt-pct">${tidy(ATTEMPTS[a] * 100)}%</span></span>
      <button class="attempt-weight" data-action="weight" data-index="${i}" data-attempt="${a}" data-key="attempt-${i}-${a}"
        aria-label="${ATTEMPT_NAMES[a]}, ${fmt(w)} ${state.unit}. Change weight">${fmt(w)}<span>${state.unit}</span></button>
      ${attemptLight(session, i, a)}
    </li>`).join('');
  return `<div class="session-body">
    <p class="lift-scheme">Attempts are built from ${fmt(base)}, ${fromTest ? 'the estimate from your week 6 test set' : 'your max'}. Rest ${restText(restSeconds(session, ui.week, 1))} before each attempt.</p>
    ${warmupList(session, i, ramp, 'Rest 2–3 minutes between warm-ups.')}
    <ol class="attempts">${attempts}</ol>
    ${loading !== null ? `<div class="lift-stage">${liftGraph(b, session, i, GRAPH_BAR_H)}${barbell(weights[loading], ATTEMPT_NAMES[loading])}</div>` : ''}
    <p class="hint">Pick the third from how the second moved: fast, go for ${fmt(weights[2])}; slow, take about ${fmt(slow)}; a grind, stop there and mark the third a pass.</p>
    ${best !== null ? `<p class="remax-best">Best good lift <strong>${fmt(best)}</strong> ${state.unit}</p>` : ''}
    ${dayEnd(session, i)}
    ${extrasSection(session, i)}
  </div>`;
}

// The day's lift across the block, behind its weight and bar: each of its days' top weight, coloured by how hard
// the day is, solid up to the day on screen and dotted after it, with the block's last weight at the end. A re-max
// day has no big number, so its graph is shorter and sits behind just the bar.
const GRAPH_H = 210;
const GRAPH_BAR_H = 104;

function smoothPath(points) {
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M${points[0].map((v) => v.toFixed(1)).join(' ')}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${[...c1, ...c2, ...p2].map((v) => v.toFixed(1)).join(' ')}`;
  }
  return d;
}

function liftGraph(b, session, i, H = GRAPH_H) {
  const days = liftPath(b, session.lift, state);
  const at = days.findIndex((d) => d.week === ui.week && d.index === i);
  if (days.length < 2 || at === -1) return '';
  const W = Math.min(window.innerWidth, 560);
  const weights = days.map((d) => d.weight);
  const lo = Math.min(...weights) * 0.97;
  const hi = Math.max(...weights) * 1.012;
  const x = (k) => 24 + (k / (days.length - 1)) * (W - 48);
  const y = (w) => H - 14 - ((w - lo) / (hi - lo || 1)) * (H - 40);
  const points = days.map((d, k) => [x(k), y(d.weight)]);
  const line = smoothPath(points);
  const [tx, ty] = points[at].map((v) => v.toFixed(1));
  const now = oklch(heatColour(heatOf(days[at].pct)));
  const stops = days.map((d, k) => `<stop offset="${(k / (days.length - 1)).toFixed(4)}" stop-color="${oklch(heatColour(heatOf(d.pct)))}"/>`).join('');
  const end = points.at(-1);
  const last = at === days.length - 1 ? ''
    : `<text x="${(end[0] - 10).toFixed(1)}" y="${(end[1] + 4).toFixed(1)}" text-anchor="end">${fmt(weights.at(-1))}</text>`;
  return `<svg class="lift-graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px" aria-hidden="true">
    <defs>
      <linearGradient id="lift-graph-line" gradientUnits="userSpaceOnUse" x1="24" y1="0" x2="${W - 24}" y2="0">${stops}</linearGradient>
      <linearGradient id="lift-graph-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${now}" stop-opacity="0.22"/><stop offset="0.9" stop-color="${now}" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="lift-graph-halo">
        <stop offset="0" stop-color="${now}" stop-opacity="0.6"/><stop offset="1" stop-color="${now}" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="lift-graph-done"><rect width="${tx}" height="${H}"/></clipPath>
      <clipPath id="lift-graph-next"><rect x="${tx}" width="${W}" height="${H}"/></clipPath>
    </defs>
    <path d="${line} L${end[0].toFixed(1)} ${H} L${points[0][0].toFixed(1)} ${H} Z" fill="url(#lift-graph-fill)" clip-path="url(#lift-graph-done)"/>
    <path class="lift-graph-next" d="${line}" stroke="url(#lift-graph-line)" clip-path="url(#lift-graph-next)"/>
    <path class="lift-graph-done" d="${line}" stroke="url(#lift-graph-line)" clip-path="url(#lift-graph-done)"/>
    ${last}
    <line class="lift-graph-stem" x1="${tx}" y1="${ty}" x2="${tx}" y2="${H}" stroke="${now}"/>
    <circle cx="${tx}" cy="${ty}" r="26" fill="url(#lift-graph-halo)"/>
    <circle cx="${tx}" cy="${ty}" r="5" fill="${now}"/>
  </svg>`;
}

function barbell(total, attempt) {
  const plates = platesPerSide(total, state.unit, BAR[state.unit], plateSizes(state));
  const loaded = tidy(BAR[state.unit] + 2 * plates.reduce((sum, p) => sum + p, 0));
  let caption = plates.length ? `${attempt ? `${attempt}, each side` : 'Each side'}: ${plates.map(fmt).join(' + ')}` : 'Empty bar';
  if (total < BAR[state.unit]) caption = 'Lighter than the empty bar';
  else if (loaded !== total) caption += `. Plates make ${fmt(loaded)}, not ${fmt(total)}`;
  const shapes = plates.map((p) => {
    const [colour, h, w] = PLATE_STYLE[state.unit][p];
    return `<span class="plate plate-${colour}" style="height:${h}px;width:${w}px"></span>`;
  }).join('');
  return `<figure class="barbell">
    <div class="bar" aria-hidden="true"><span class="collar"></span>${shapes}</div>
    <figcaption class="bar-caption">${caption}</figcaption>
  </figure>`;
}

// ---------- PRs: the show ----------

const big = (n) => (Math.round(n * 100) / 100).toLocaleString();

// How much sleeve a stack of plates takes: the shoulder, each plate with its gap, and the collar.
const stackWidth = (plates) => 12 + plates.reduce((sum, p) => sum + PLATE_STYLE[state.unit][p][2] + 2, 0) + 5;

// Where each lift starts, which tells the bars apart without a word: the squat bar racked, the bench bar over its
// bench, the deadlift bar on the floor.
const STATION = { squat: 'rack', bench: 'bench', deadlift: 'floor' };

// The shaft between the sleeves, in bar units; the page needs it for the bars' aspect ratio.
const SHAFT = 150;

// Chalk dust off each collar as it locks: how far each speck drifts, and its size.
const DUST = [[14, -12, 1.6], [20, -4, 1.2], [12, 8, 1.4], [8, -18, 1.1], [22, -14, 1.8], [16, 2, 1]];

// A record on its bar, seen from the front. The station fades in, the empty bar drops into it, the plates fly on
// from both ends a pair at a time and the collars lock last, on the delays in `lift` (see show.js); the number
// above it is stepped by runShow on the same clock. `sleeve` is shared by the page's bars so their plates match.
// The PR moment's bar arrives loaded instead (`lift.keep` stays on, `lift.off` flies off, `lift.on` flies on) and
// throws a bigger cloud of chalk (`burst`).
function showBar(lift, id, i, sleeve, burst = false) {
  const H = 100;
  const mid = H / 2;
  const shaft = SHAFT;
  const W = shaft + 2 * sleeve;
  const centre = sleeve + shaft / 2;
  const posts = [sleeve + 26, sleeve + shaft - 32];
  const station = STATION[id];
  const shine = `url(#gleam-${i})`;
  let behind = '';
  let front = '';
  if (station !== 'floor') {
    // Uprights behind the bar, and the J-hooks it sits in over its lower half.
    const top = station === 'rack' ? 12 : mid + 2;
    behind += posts.map((x) => `<rect x="${x}" y="${top}" width="6" height="${H - top}" fill="var(--steel)" opacity="0.55"/>`).join('');
    front += posts.map((x) => `<rect x="${x - 1}" y="${mid - 1}" width="8" height="12" rx="1.5" fill="var(--steel)"/>`).join('');
  }
  if (station === 'bench') {
    behind += `<rect x="${centre - 5}" y="${mid + 30}" width="10" height="${H - mid - 30}" fill="var(--steel)" opacity="0.55"/>
      <rect x="${centre - 22}" y="${mid + 20}" width="44" height="10" rx="3" fill="var(--surface)" stroke="var(--steel)" stroke-width="1.5"/>`;
  }
  if (station === 'floor') behind += `<rect x="0" y="${mid + 28}" width="${W}" height="3" rx="1.5" fill="var(--steel)"/>`;
  const body = (fill) => `<rect x="0" y="${mid - 4.5}" width="${sleeve}" height="9" rx="2" fill="${fill}"/>
    <rect x="${sleeve + shaft}" y="${mid - 4.5}" width="${sleeve}" height="9" rx="2" fill="${fill}"/>
    <rect x="${sleeve}" y="${mid - 3.5}" width="${shaft}" height="7" fill="${fill}"/>`;
  const knurl = `<rect x="${sleeve + 10}" y="${mid - 3.5}" width="${shaft * 0.3}" height="7" fill="rgba(0,0,0,0.18)"/>
    <rect x="${sleeve + shaft * 0.7 - 10}" y="${mid - 3.5}" width="${shaft * 0.3}" height="7" fill="rgba(0,0,0,0.18)"/>`;
  // What the bar arrives with, what comes off it and what flies on. A record on the PRs page flies on whole.
  const keep = lift.keep ?? [];
  const off = lift.off ?? [];
  const on = lift.on ?? lift.plates;
  const onAt = lift.onAt ?? lift.plateAt;
  const plateFill = (p) => (PLATE_STYLE[state.unit][p][0] === 'chrome' ? 'var(--chrome)' : `var(--plate-${PLATE_STYLE[state.unit][p][0]})`);
  // Black plates get a light rim, or they vanish into the dark.
  const rim = (p) => `stroke="${PLATE_STYLE[state.unit][p][0] === 'black' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.3)'}"`;
  // One side's shoulder, plates and collar. `lit` draws the same shapes in the shine gradient, for the finale.
  const side = (dir, lit) => {
    const shoulder = dir < 0 ? sleeve : sleeve + shaft;
    const from = dir * (sleeve + 40);
    const rect = (x, w, h, fill, extra = '') => `<rect x="${x}" y="${mid - h / 2}" width="${w}" height="${h}" rx="1.5" fill="${fill}"${extra && ` ${extra}`}/>`;
    const flyOn = (k) => `class="show-plate" style="--d:${onAt(k)}ms;--from:${from}px;--o:${dir < 0 ? 100 : 0}%"`;
    const flyOff = (at) => `class="show-plate-off" style="--d:${at}ms;--from:${from}px"`;
    const parts = [rect(dir < 0 ? shoulder - 7 : shoulder, 7, 18, lit ? shine : 'var(--chrome)')];
    let x = shoulder + dir * 12;
    // Draws plates outwards from x, each as `piece` says.
    const stack = (plates, piece) => plates.forEach((p, k) => {
      const [, h, w] = PLATE_STYLE[state.unit][p];
      parts.push(piece(p, k, dir < 0 ? x - w : x, w, h));
      x += dir * (w + 2);
    });
    const collar = (fill, extra) => rect(dir < 0 ? x - 5 : x, 5, 22, fill, extra);
    if (lit) {
      stack(lift.plates, (p, k, px, w, h) => rect(px, w, h, shine));
      parts.push(collar(shine));
      return parts.join('');
    }
    stack(keep, (p, k, px, w, h) => rect(px, w, h, plateFill(p), rim(p)));
    const fork = x;
    stack(off, (p, k, px, w, h) => rect(px, w, h, plateFill(p), `${flyOff(lift.offAt(k))} ${rim(p)}`));
    if (lift.unlock !== undefined) parts.push(collar('var(--chrome)', flyOff(lift.unlock)));
    x = fork;
    stack(on, (p, k, px, w, h) => rect(px, w, h, plateFill(p), `${flyOn(k)} ${rim(p)}`));
    parts.push(collar('var(--chrome)', flyOn(on.length)));
    return parts.join('');
  };
  const specks = burst ? [...DUST, ...DUST.map(([dx, dy, r]) => [dx * 1.9, dy * 1.7, r * 0.9])] : DUST;
  const dust = (dir) => {
    const ox = (dir < 0 ? sleeve : sleeve + shaft) + dir * stackWidth(lift.plates);
    return specks.map(([dx, dy, r]) => `<circle class="show-dust" style="--d:${lift.lock}ms;--dx:${dir * dx}px;--dy:${dy}px" cx="${ox}" cy="${mid}" r="${r}" fill="var(--chalk)"/>`).join('');
  };
  // The shine is a band of light that runShow sends across the bar once everything is on.
  return `<svg class="show-bar" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs>
      <linearGradient id="gleam-${i}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="80" y2="0" gradientTransform="translate(-90 0)">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.6"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        <animateTransform class="show-gleam" attributeName="gradientTransform" type="translate" from="-90 0" to="${W + 10} 0" dur="0.8s" begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.55 1"/>
      </linearGradient>
    </defs>
    <g class="show-scene" style="--d:${lift.t0 - 80}ms">${behind}</g>
    <g class="show-rig" style="--d:${lift.t0}ms">${body('url(#bar-steel)')}${knurl}${side(-1)}${side(1)}</g>
    <g>${body(shine)}${side(-1, true)}${side(1, true)}</g>
    <g class="show-scene" style="--d:${lift.t0 - 80}ms">${front}</g>
    ${dust(-1)}${dust(1)}
  </svg>`;
}

// The page: the total, then the three records on their bars, and not a word. It fills the screen; runShow, called
// once it's drawn, runs the show planned here.
let show = null;
function prsView() {
  const records = LIFTS.map((l) => ({ l, r: liftRecord(state, l.id) })).filter(({ r }) => r);
  const plan = showPlan(records.map(({ r }) => r.value), state.unit, SHOW, plateSizes(state));
  const sleeve = Math.max(100, ...plan.lifts.map((lift) => stackWidth(lift.plates) + 18));
  const total = tidy(records.reduce((sum, { r }) => sum + r.value, 0));
  show = plan;
  if (!records.length) return '<section class="show"></section>';
  // Each bar is drawn twice: as itself, and upside down in the floor under it (minus its gradient, whose id must
  // stay unique; the copy shines off the original).
  const rows = records.map(({ l }, i) => {
    const bar = showBar(plan.lifts[i], l.id, i, sleeve);
    return `<li class="show-lift">
      <p class="show-num" style="--d:${plan.lifts[i].landed - 140}ms"><span class="show-digits">${big(plan.lifts[i].value)}</span></p>
      <div class="show-stage" style="aspect-ratio:${SHAFT + 2 * sleeve} / 100">${bar}<div class="show-reflect">${bar.replace(/<defs>[\s\S]*?<\/defs>/, '')}</div></div>
    </li>`;
  }).join('');
  return `<section class="show" aria-label="Records">
    <p class="show-total" style="--d:${plan.lifts[0].landed - 140}ms;--fin:${plan.finale}ms"><span class="show-digits">${big(total)}</span></p>
    <ol class="show-list">${rows}</ol>
  </section>`;
}

// Changes what a number reads, which also knocks its digits up a notch (the tick restarts every time).
function setDigits(p, text) {
  const digits = p.firstElementChild;
  if (digits.textContent === text) return;
  digits.textContent = text;
  digits.classList.remove('is-tick');
  void digits.offsetWidth;
  digits.classList.add('is-tick');
}

// Steps each number up as its plates touch down, and the total with them, then sets off the finale. The clock starts
// when the page is drawn, the same moment the bars' CSS delays count from. The page is drawn with the records on it,
// which is what stays when motion is turned down.
function runShow() {
  const plan = show;
  const nums = [...view.querySelectorAll('.show-num')];
  const totalEl = view.querySelector('.show-total');
  if (!plan || !nums.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now();
  const frame = () => {
    if (!nums[0].isConnected) return;
    const t = performance.now() - t0;
    let sum = 0;
    plan.lifts.forEach((lift, i) => {
      const step = stepAt(lift.steps, t);
      setDigits(nums[i], big((step || lift.steps[0]).value));
      if (step) sum += step.value;
      if (step === lift.steps[lift.steps.length - 1]) nums[i].classList.add('is-set');
    });
    setDigits(totalEl, big(tidy(sum)));
    if (t < plan.finale) {
      requestAnimationFrame(frame);
      return;
    }
    totalEl.classList.add('is-set');
    for (const gleam of view.querySelectorAll('.show-gleam')) gleam.beginElement?.();
  };
  frame();
}

// ---------- The PR moment ----------
// A good re-max lift heavier than any record on the PRs page: the screen goes dark, three white lights come on, and
// the old record's bar is made into the new one (see prShow in show.js). A tap anywhere closes it.

function openMoment(lift, old, value) {
  const plan = prShow(old, value, state.unit, PR_SHOW, plateSizes(state));
  const sleeve = Math.max(100, stackWidth(plan.plates) + 18, stackWidth([...plan.keep, ...plan.off]) + 18);
  const bar = showBar(plan, lift.id, 'pr', sleeve, true);
  moment.firstElementChild.innerHTML = `
    <i class="moment-flare" style="--d:${plan.lock}ms"></i>
    <div class="moment-lights" style="--lock:${plan.lock}ms">${plan.lightsAt.map((d) => `<i class="moment-light" style="--d:${d}ms"></i>`).join('')}</div>
    <div class="moment-lift">
      <p class="show-num moment-num" style="--d:${plan.landed - 140}ms"><span class="show-digits">${big(old)}</span></p>
      <div class="show-stage moment-stage" style="aspect-ratio:${SHAFT + 2 * sleeve} / 100">
        <i class="moment-burst" style="--d:${plan.lock}ms"></i><i class="moment-ring" style="--d:${plan.lock}ms"></i>
        ${bar}<div class="show-reflect">${bar.replace(/<defs>[\s\S]*?<\/defs>/, '')}</div>
      </div>
      <p class="moment-gain" style="--d:${plan.gainAt}ms">+${big(tidy(value - old))}</p>
    </div>`;
  moment.showModal();
  runMoment(plan);
}

// Knocks the group down a touch, as a pair of plates lands.
function thump(el) {
  el.classList.remove('is-thump');
  void el.offsetWidth;
  el.classList.add('is-thump');
}

// Steps the number as the plates change over, pops it when the collars lock, then sends the shine over the bar.
// With motion turned down the moment is drawn finished.
function runMoment(plan) {
  const num = moment.querySelector('.moment-num');
  const group = moment.querySelector('.moment-lift');
  const last = plan.steps[plan.steps.length - 1];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setDigits(num, big(plan.value));
    num.classList.add('is-live', 'is-set');
    return;
  }
  const t0 = performance.now();
  let shown = plan.steps[0];
  const frame = () => {
    if (!moment.open) return;
    const t = performance.now() - t0;
    const step = stepAt(plan.steps, t);
    if (step && step !== shown) {
      shown = step;
      num.classList.toggle('is-live', !step.old);
      setDigits(num, big(step.value));
      thump(group);
    }
    if (step === last) num.classList.add('is-set');
    if (t < plan.finale) {
      requestAnimationFrame(frame);
      return;
    }
    for (const gleam of moment.querySelectorAll('.show-gleam')) gleam.beginElement?.();
  };
  frame();
}

// ---------- Test sets ----------
// The last set of a template day in weeks 3 and 6 goes all out, as many clean reps as you can. testBands says what
// each count of reps does to the max; the fewest that don't lower it are what the set aims for.

const repSpan = (x) => (x.to === null ? `${x.from}+` : x.from === x.to ? String(x.from) : `${x.from}–${x.to}`);
const bandList = (bands) => `<ol class="band-list" aria-label="Reps on the test set, and the change to the max">${bands
  .map((x) => `<li class="band is-${x.change}"><strong>${repSpan(x)}</strong><span>${x.change === 'hold' ? 'hold' : signed(x.by)}</span></li>`).join('')}</ol>`;
// Week 6's test before a re-max moves no max: the attempts build from it.
const toAttempts = (b, week) => week !== FIRST_TEST && b.finish === 'remax';
const testFeeds = (b, week) => (week === FIRST_TEST ? 'Its reps move the max for weeks 4–8:' : b.finish === 'deload' ? "Its reps set next block's max:" : 'What its reps say about the max:');

// A day's test set in the week shown: its bands, the reps that hold and raise the max, and `keep`, the fewest that
// don't lower it (null if no count up to 12 does).
function testAim(session) {
  const b = block();
  const { bands } = testBands(b, session.lift, ui.week, state);
  const hold = bands.find((x) => x.change === 'hold') ?? null;
  const raise = bands.find((x) => x.change === 'raise') ?? null;
  const keeps = toAttempts(b, ui.week) ? 'says your max is right' : 'keeps your max';
  return { b, bands, hold, raise, keep: (hold ?? raise)?.from ?? null, keeps };
}

// Under a day's sets while its test set is still to do: all out, with what each count of reps does.
function testGuide(session) {
  const last = session.reps.length - 1;
  if (!isTestSet(session, ui.week, last) || session.reps[last] !== null) return '';
  const { b, bands } = testAim(session);
  return `<section class="test-guide" aria-label="Test set">
    <p class="hint">Last set all out: as many clean reps as you can.${toAttempts(b, ui.week) ? ' Your re-max attempts build from it.' : ''} ${testFeeds(b, ui.week)}</p>
    ${bandList(bands)}
  </section>`;
}

// The set sheet's note on a test set: "All out: 5–6 holds your max, 7+ raises it."
function testNote(session) {
  const { b, hold, raise, keep } = testAim(session);
  const aim = keep === null ? 'as many as you can'
    : toAttempts(b, ui.week) ? `your re-max attempts build from it, and ${keep}+ says your max is right`
      : hold && raise ? `${repSpan(hold)} holds your max, ${raise.from}+ raises it`
        : hold ? `${repSpan(hold)} holds your max` : `${raise.from}+ raises your max`;
  return `All out: ${aim}. Count every clean rep you got.`;
}

// Logged sets light up like meet judging lights: white for a good set, red for a short one.
function setLight(session, index, i, reps) {
  const test = isTestSet(session, ui.week, i);
  // A test set goes all out, so it aims for the fewest reps that keep the max, not the template's reps.
  const aim = test ? testAim(session) : null;
  const target = aim?.keep ?? prescription(session.kind, ui.week).reps;
  let cls = test ? 'set is-heavy' : 'set';
  let text = test ? `${target}+` : String(target);
  let label = `Set ${i + 1}, ${test ? `all out, ${target} or more ${aim.keeps}` : plural(target, 'rep')}, not logged`;
  if (reps !== null) {
    cls += reps >= target ? ' is-good' : ' is-short';
    text = reps > target ? `${reps}<sup>+${reps - target}</sup>` : String(reps);
    label = `Set ${i + 1}, ${reps} of ${target} reps`;
  }
  return `<button class="${cls}" data-action="set" data-index="${index}" data-set="${i}" data-key="set-${index}-${i}"
    aria-label="${label}">${text}</button>`;
}

function attemptLight(session, index, a) {
  const r = session.reps[a];
  const name = ATTEMPT_NAMES[a];
  const [cls, text, label] = r === null ? ['set is-heavy', a + 1, `${name}, not judged`]
    : r === 1 ? ['set is-good', '✓', `${name}, good lift`] : ['set is-short', '✕', `${name}, no lift`];
  return `<button class="${cls}" data-action="set" data-index="${index}" data-set="${a}" data-key="set-${index}-${a}"
    aria-label="${label}">${text}</button>`;
}

function reviewReason(r, liftId) {
  const u = state.unit;
  const skipped = r.skipped ? ` ${plural(r.skipped, 'day')} skipped, not counted.` : '';
  const set = (t) => `${fmt(t.weight)} × ${t.reps}, an estimated max of ${fmt(Math.round(t.estimate))}`;
  const max = block().max[liftId];
  const wave = r.waveMax !== max ? `Your week 3 test set moved it to ${fmt(r.waveMax)} for weeks 4–8. ` : '';
  switch (r.basis) {
    case 'remax':
      return `Re-max: ${fmt(r.best)} ${u}${r.change > 0 ? `, up ${fmt(r.change)}` : r.change < 0 ? `, ${fmt(-r.change)} under your old max` : ', the same as your old max'}. That's your new max.`;
    case 'remax-off-day':
      return `Your best single, ${fmt(r.best)}, was well under the ${fmt(Math.round(r.second.estimate))} your week 6 test set estimated, so this meets in the middle. Call it an off day.`;
    case 'remax-missed':
      return `No good lift on re-max day, so this is 95% of ${r.second ? 'your week 6 estimate' : `your weeks 4–8 max, ${fmt(r.waveMax)}`}. Retest next block.`;
    case 'test-raise':
      return `${wave}Week 6 test set: ${set(r.second)}. Add ${fmt(tidy(r.suggested - r.waveMax))}.${skipped}`;
    case 'test-hold':
      return `${wave}Week 6 test set: ${set(r.second)}. That's close to your max, so it stays.${skipped}`;
    case 'test-lower':
      return `${wave}Week 6 test set: ${set(r.second)}. That's well under your max, so it drops 5%: training from a max you can hit beats grinding.${skipped}`;
    case 'missed':
      return `${wave}No week 6 test set, and reps came up short on two or more days in weeks 4–6, so it drops 5%.${skipped}`;
    case 'clean':
      return `${wave}No week 6 test set, but every rep in weeks 4–6 was hit. Add ${fmt(BUMPS[u][liftId][0])}.${skipped}`;
    default:
      if (r.performed === 0) return 'Nothing logged this block. Repeat at the same max.';
      return `${wave}No week 6 test set${r.misses.some((m) => m.week >= WAVE_TWO) ? ', and one day in weeks 4–6 came up short' : ''}, so it stays.${skipped}`;
  }
}

// ---------- The block review ----------
// Finish block: how the block went, then the maxes to start the next one from.

function reviewView() {
  const b = block();
  const n = state.blocks.length;
  const results = LIFTS.map((l) => ({ l, r: evaluateLift(b, l.id, state) }));
  const total = {
    was: tidy(results.reduce((sum, { l }) => sum + b.max[l.id], 0)),
    now: tidy(results.reduce((sum, { r }) => sum + r.suggested, 0)),
  };
  const sum = blockSummary(state, n - 1);
  const c = consistency(state);
  const meta = [sum.from && dateSpan(sum.from, sum.to), plural(BLOCK_WEEKS, 'week'), `${c.trained} of ${plural(c.trained + c.skipped + c.toGo, 'day')}`];
  return `<header class="top">
      <button class="btn-quiet back" data-action="review-back">Back to week ${b.log.length}</button>
      <h1 class="display">${weekProgress(b, FINISH_WEEK) === 1 ? `Block ${n} done` : `Finish block ${n}`}</h1>
      <p class="top-meta">${meta.filter(Boolean).join(' · ')}</p>
    </header>
    ${reviewTotal(results, total, n)}
    ${reviewMaxes(b, results)}
    ${reviewHeavy(b, n)}
    ${reviewWork(sum)}
    ${reviewShowingUp(b, c, sum)}
    ${reviewExtras(n, sum)}
    ${reviewBody(b, total, n)}
    <form class="review" id="review-form" novalidate>
      <h2 class="chart-title">Block ${n + 1}</h2>
      <p class="hint">Your new maxes. Change any number before you start.</p>
      ${results.map(({ l, r }) => maxField({ ...l, name: `${l.name}, was ${fmt(b.max[l.id])}` }, fmt(r.suggested))).join('')}
      <fieldset class="review-lift">
        <legend class="setting-title">Week 8 of block ${n + 1}</legend>
        ${segmented('finish', [{ value: 'remax', label: 'Re-max' }, { value: 'deload', label: 'Deload' }], finishFor(n))}
        <p class="hint">Re-max every second block. Deload sooner if your lifts stall, joints ache or sleep slips.</p>
      </fieldset>
      <button class="btn btn-wide" type="submit">Start block ${n + 1}</button>
    </form>`;
}

const changeClass = (n) => (n > 0 ? 'is-up' : n < 0 ? 'is-down' : '');
const changeText = (n) => (n ? signed(n) : 'Same');

// The total the next block starts from, against this one's, and each lift's new max.
function reviewTotal(results, total, n) {
  const tiles = results.map(({ l, r }) => `<li class="stat-tile">
      <span class="stat-tile-label">${l.short}</span>
      <span class="stat-tile-num">${fmt(r.suggested)}</span>
      <span class="review-change ${changeClass(r.change)}">${changeText(r.change)}</span>
    </li>`).join('');
  const by = tidy(total.now - total.was);
  return `<section class="review-hero" aria-label="Your maxes for block ${n + 1}">
    <p class="review-hero-label">Total for block ${n + 1}</p>
    <p class="review-total"><span class="show-digits">${big(total.now)}</span>
      <span class="review-total-change"><span class="review-change ${changeClass(by)}">${changeText(by)}</span><span class="review-was">from ${big(total.was)}</span></span></p>
    <ul class="stat-tiles">${tiles}</ul>
  </section>`;
}

// Each lift through the block: the max trained from, the test sets' estimates, the re-max attempts and the new max,
// with why the new max is what it is.
function reviewMaxes(b, results) {
  const paths = results.map(({ l, r }) => ({ l, r, path: maxPath(state, state.blocks.length - 1, l.id) }));
  const attempt = (a) => `<li class="${a.good ? '' : 'is-miss'}">${ATTEMPT_NAMES[a.attempt]} <b>${fmt(a.weight)}</b>
    <span aria-hidden="true">${a.good ? '✓' : '✕'}</span><span class="sr-only">${a.good ? 'good lift' : 'no lift'}</span></li>`;
  const lifts = paths.map(({ l, r, path }) => `<li class="review-path">
      <p class="review-path-head"><span class="review-path-name">${l.name}</span>
        <span class="review-path-new">${fmt(b.max[l.id])} → ${fmt(r.suggested)}${r.change ? `<small class="review-change ${changeClass(r.change)}">${signed(r.change)}</small>` : ''}</span></p>
      ${pathChart(l, path, r)}
      ${path.attempts.length ? `<ul class="review-attempts">${path.attempts.map(attempt).join('')}</ul>` : ''}
      <p class="review-why${r.change > 0 ? '' : ' is-held'}">${reviewReason(r, l.id)}</p>
    </li>`).join('');
  const all = paths.map((p) => p.path);
  const legend = [
    '<span><i class="is-from"></i>Max trained from</span>',
    all.some((p) => p.tests.length) && '<span><i class="is-test"></i>Test set estimate</span>',
    all.some((p) => p.attempts.some((a) => a.good)) && '<span><i class="is-good"></i>Good lift</span>',
    all.some((p) => p.attempts.some((a) => !a.good)) && '<span><i class="is-miss"></i>No lift</span>',
  ].filter(Boolean).join('');
  return `<section class="chart-block">
    <h2 class="chart-title">How each max moved</h2>
    <ul class="review-paths">${lifts}</ul>
    <p class="review-legend" aria-hidden="true">${legend}</p>
  </section>`;
}

// One lift's max across the weeks: a step line for the max trained from (week 3's test set moves it from week 4 on),
// a dot for each test set's estimate, the re-max attempts in week 8, and the new max at the right.
function pathChart(l, path, r) {
  const W = 350;
  const H = 112;
  const left = 6;
  const right = 50;
  const top = 14;
  const bottom = 22;
  const slot = (W - left - right) / BLOCK_WEEKS;
  const edge = (w) => left + slot * w;
  const mid = (w) => edge(w + 0.5);
  const values = [path.start, path.wave, ...path.tests.map((t) => t.estimate), ...path.attempts.map((a) => a.weight), r.suggested];
  const lo = Math.min(...values) - 8;
  const hi = Math.max(...values) + 8;
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  const tone = r.change > 0 ? 'var(--gain)' : r.change < 0 ? 'var(--red-text)' : 'var(--chalk)';
  const tests = path.tests.map((t) => `<circle cx="${mid(t.week)}" cy="${y(t.estimate)}" r="5" fill="var(--series-1)"/>
      <text class="review-chart-v" x="${mid(t.week)}" y="${y(t.estimate) - 9}" text-anchor="middle">${fmt(Math.round(t.estimate))}</text>`).join('');
  const attempts = path.attempts.map((a) => {
    const cx = mid(FINISH_WEEK) + (a.attempt - 1) * 11;
    return a.good ? `<circle cx="${cx}" cy="${y(a.weight)}" r="4.5" fill="var(--chalk)"/>`
      : `<circle cx="${cx}" cy="${y(a.weight)}" r="4" fill="none" stroke="var(--red)" stroke-width="2"/>`;
  }).join('');
  const weeks = Array.from({ length: BLOCK_WEEKS }, (_, w) => `<text x="${mid(w)}" y="${H - 4}" text-anchor="middle">${w + 1}</text>`).join('');
  const said = [
    `trained from ${fmt(path.start)}${path.wave === path.start ? '' : `, then ${fmt(path.wave)} from week ${WAVE_TWO + 1}`}`,
    path.tests.length && `test sets estimated ${listDays(path.tests.map((t) => fmt(Math.round(t.estimate))))}`,
    `new max ${fmt(r.suggested)}`,
  ].filter(Boolean).join('; ');
  return `<svg class="review-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${l.name}: ${said}.">
      <rect x="${edge(FINISH_WEEK)}" y="${top - 6}" width="${slot}" height="${H - top - bottom + 12}" rx="6" fill="var(--surface)"/>
      <path d="M${edge(0)},${y(path.start)} H${edge(WAVE_TWO)} V${y(path.wave)} H${edge(BLOCK_WEEKS)}" fill="none" stroke="var(--steel)" stroke-width="2.5"/>
      <text x="${edge(0) + 2}" y="${y(path.start) - 6}">${fmt(path.start)}</text>
      ${path.wave === path.start ? '' : `<text x="${edge(WAVE_TWO) + 4}" y="${y(path.wave) - 6}">${fmt(path.wave)}</text>`}
      ${tests}${attempts}
      <line x1="${mid(FINISH_WEEK) + 16}" x2="${W - right + 4}" y1="${y(r.suggested)}" y2="${y(r.suggested)}" stroke="${tone}" stroke-width="1.5" stroke-dasharray="3 3"/>
      <text class="review-chart-v is-new" x="${W - right + 8}" y="${y(r.suggested) + 5}" style="fill:${tone}">${fmt(r.suggested)}</text>
      ${weeks}
    </svg>`;
}

const FEEL_LETTER = { easy: 'E', smooth: 'S', grind: 'G' };

// Every heavy day of the block, weeks 1–7, by how its sets moved.
function reviewHeavy(b, n) {
  const rows = LIFTS.map((l) => ({ l, feel: heavyFeel(b, l.id) })).filter((x) => x.feel.days);
  if (!rows.length) return '';
  const list = rows.map(({ l, feel }) => {
    const days = b.log.slice(0, FINISH_WEEK).map((week) => {
      const s = week.find((x) => x.lift === l.id && x.kind === 'heavy');
      const f = s && !s.skipped && FEELS.includes(s.feel) ? s.feel : null;
      return f ? `<i class="is-${f}">${FEEL_LETTER[f]}</i>` : '<i class="is-none">–</i>';
    }).join('');
    const counts = FEELS.filter((f) => feel[f]).map((f) => (f === 'grind' ? plural(feel[f], 'grind') : `${feel[f]} ${FEEL_TEXT[f][0].toLowerCase()}`));
    return `<li>
      <span class="review-feel-name">${l.short}</span>
      <span class="review-feel-days" aria-hidden="true">${days}</span>
      <span class="review-feel-said">${listDays(counts)}</span>
    </li>`;
  }).join('');
  const ground = capital(listDays(rows.filter((x) => x.feel.grind >= GRINDS).map((x) => x.l.short.toLowerCase())));
  const advice = !ground ? ''
    : state.trainingMax ? ` ${ground} ground ${GRINDS} or more times even on a 90% training max: start block ${n + 1} lower.`
      : ` ${ground} ground ${GRINDS} or more times, a sign the heavy days ran too close to the max: switch to a 90% training max in Settings → Work from, or start block ${n + 1} lower.`;
  return `<section class="chart-block">
    <h2 class="chart-title">Heavy days</h2>
    <ul class="review-feel">${list}</ul>
    <p class="hint">Each heavy day in weeks 1 to 7: easy, smooth or a grind.${advice}</p>
  </section>`;
}

// Everything lifted in the block, and each week's weight × reps.
function reviewWork(sum) {
  if (!sum.sets) return '';
  const most = Math.max(...sum.weeks.map((w) => w.volume));
  const weeks = sum.weeks.map((w, i) => `<li class="review-week">
      <span class="review-week-v" aria-hidden="true">${w.volume ? `${Math.round(w.volume / 1000)}k` : '–'}</span>
      <span class="review-week-bar${isLightWeek(i) ? ' is-light' : ''}" style="height:${Math.max(4, (w.volume / most) * 100).toFixed(1)}px"></span>
      <span class="review-week-num" aria-hidden="true">${i + 1}</span>
      <span class="sr-only">Week ${i + 1}: ${Math.round(w.volume).toLocaleString()}</span>
    </li>`).join('');
  return `<section class="chart-block">
    <h2 class="chart-title">The work</h2>
    <dl class="stats">
      <div><dt>Sets</dt><dd>${sum.sets.toLocaleString()}</dd></div>
      <div><dt>Volume</dt><dd>${Math.round(sum.volume).toLocaleString()}</dd></div>
      ${sum.timed ? `<div><dt>A day</dt><dd>${spanShort(sum.ms / sum.timed)}</dd></div>` : ''}
    </dl>
    <ol class="review-weeks" aria-label="Weight × reps each week">${weeks}</ol>
    <p class="hint">Weight × reps each week in ${state.unit}, main lifts and accessories. Weeks 7 and 8 are lighter on purpose.${sum.timed ? ` A day is the average of the ${plural(sum.timed, 'day')} timed from Start to End workout.` : ''}</p>
  </section>`;
}

// The block's days trained and skipped, and the share of accessories done on the days trained.
function reviewShowingUp(b, c, sum) {
  const extras = sum.extrasDue ? `${sum.extrasDone} of ${plural(sum.extrasDue, 'accessory')} done on the days trained.` : '';
  const remax = b.finish === 'remax' ? ' Week 8’s re-max has no Thursday or Friday.' : '';
  return `<section class="chart-block">
    <h2 class="chart-title">Showing up</h2>
    <dl class="stats">
      <div><dt>Trained</dt><dd>${c.trained}</dd></div>
      <div><dt>Skipped</dt><dd>${c.skipped}</dd></div>
      ${sum.extrasDue ? `<div><dt>Accessories</dt><dd>${pct(sum.extrasDone / sum.extrasDue)}</dd></div>` : ''}
    </dl>
    ${dayGrid(c, false)}
    ${extras || remax ? `<p class="hint">${(extras + remax).trim()}</p>` : ''}
  </section>`;
}

// This block's accessories that went up the most, and any that stalled.
function reviewExtras(n, sum) {
  const trends = accessoryTrends(state, n - 1);
  if (!trends.length) return '';
  const shown = 3;
  const up = trends.filter((t) => t.change > 0).sort((a, b) => b.change - a.change);
  const stuck = trends.filter((t) => t.flat >= STUCK_AFTER).sort((a, b) => b.flat - a.flat);
  const upRows = up.slice(0, shown).map((t) => trendRow(t, `+${Math.round(t.change * 100)}%`, trendUp(t), false)).join('');
  const stuckRows = stuck.slice(0, shown).map((t) => trendRow(t, '', trendStuck(t), false)).join('');
  return `<section class="chart-block">
    <h2 class="chart-title">Accessories</h2>
    <p class="hint">${up.length} of ${trends.length} went up this block${sum.bests ? `, with ${plural(sum.bests, 'new best')}` : ''}.</p>
    ${upRows ? `<h3 class="stat-sub">Most improved</h3><ul class="index-list">${upRows}</ul>` : ''}
    ${stuckRows ? `<h3 class="stat-sub">Stuck</h3><ul class="index-list">${stuckRows}</ul>
      <p class="hint">${stuck.length > shown ? `And ${stuck.length - shown} more, in History → Stats. ` : ''}Drop the weight about 10% in block ${n + 1} and build back up, or switch variants.</p>` : ''}
  </section>`;
}

// Body weight from the block's first weigh-in to its last, against the total.
function reviewBody(b, total, n) {
  const days = (state.bodyweight ?? []).filter((x) => x.date >= b.started).sort((x, y) => (x.date < y.date ? -1 : 1));
  if (days.length < 2) return '';
  const first = days[0];
  const last = days[days.length - 1];
  return `<section class="chart-block">
    <h2 class="chart-title">Body weight</h2>
    <dl class="stats">
      <div><dt>${shortDate(first.date)}</dt><dd>${fmt(first.weight)}</dd></div>
      <div><dt>${shortDate(last.date)}</dt><dd>${fmt(last.weight)}</dd></div>
      <div><dt>Change</dt><dd>${changeText(tidy(last.weight - first.weight))}</dd></div>
    </dl>
    <p class="hint">The total for block ${n + 1} is ${(total.now / last.weight).toFixed(2)}× your body weight, from ${(total.was / first.weight).toFixed(2)}× at the start of block ${n}.</p>
  </section>`;
}

function chartWidth() {
  const style = getComputedStyle(view);
  return Math.floor(view.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
}

const HISTORY_VIEWS = [
  { value: 'stats', label: 'Stats' }, { value: 'lifts', label: 'Lifts' }, { value: 'extras', label: 'Accessories' }, { value: 'muscles', label: 'Muscles' }, { value: 'time', label: 'Time' },
  { value: 'body', label: 'Body' },
];

function historyView() {
  const section = { stats: statsHistory, extras: extrasHistory, muscles: musclesHistory, time: timeHistory, body: bodyHistory }[ui.history]?.() ?? liftsHistory();
  return `<header class="top"><h1 class="display">History</h1></header>
    <fieldset class="history-pick" aria-label="Show">${segmented('historyView', HISTORY_VIEWS, ui.history)}</fieldset>
    ${section}`;
}

// ---------- Stats ----------

const DOTS_OPTIONS = [{ value: 'men', label: "Men's" }, { value: 'women', label: "Women's" }];
const pct = (r) => `${Math.round(r * 100)}%`;
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
// Long spans read in hours alone: "51 min", "6 h 40 min", "41 h".
const hoursText = (ms) => (ms < 10 * 3600000 ? spanText(ms) : `${Math.round(ms / 3600000)} h`);

// History → Stats: the log as a whole, from strength for body weight to everything lifted.
function statsHistory() {
  return [strengthStats(), gainStats(), maxStats(), showingUp(), accessoryStats(), totalStats()].join('');
}

// The records total against body weight, and as a DOTS score once a formula is picked.
function strengthStats() {
  const s = strength(state);
  if (!s) return '';
  const title = '<h2 class="chart-title">Strength for your size</h2>';
  if (!s.body) {
    return `<section class="chart-block">${title}
      <p class="chart-empty">Log your body weight to see your total against it, and your DOTS score.</p>
      <button class="btn-quiet past-add" data-action="history-view" data-view="body">Log body weight</button>
    </section>`;
  }
  const hero = s.score === null
    ? `<fieldset class="dots-pick"><legend class="hint">Your DOTS score, the one meets use to compare lifters of every size, has a men's and a women's formula. Score with:</legend>${segmented('dots', DOTS_OPTIONS, null)}</fieldset>`
    : `<p class="stat-hero"><span class="show-digits">${s.score.toFixed(1)}</span><span class="stat-hero-label">DOTS</span></p>`;
  const tiles = s.lifts.map((l) => `<li class="stat-tile">
      <span class="stat-tile-label">${LIFTS.find((x) => x.id === l.lift).short}</span>
      <span class="stat-tile-num">${l.ratio.toFixed(2)}×</span>
      <span class="stat-tile-meta">${fmt(l.value)}</span>
    </li>`).join('');
  const per = s.score === null ? ''
    : ` Each ${s.step} ${state.unit} on the total adds ${s.perTotal.toFixed(1)} points; the same total at ${s.step} ${state.unit} lighter adds ${s.perBody.toFixed(1)}.`;
  return `<section class="chart-block">${title}
    ${hero}
    <dl class="stats">
      <div><dt>Total</dt><dd>${big(s.total)}</dd></div>
      <div><dt>Body weight</dt><dd>${fmt(s.body.weight)}</dd></div>
      <div><dt>Times body weight</dt><dd>${s.ratio.toFixed(2)}×</dd></div>
    </dl>
    <ul class="stat-tiles" aria-label="Each record as a multiple of body weight">${tiles}</ul>
    <p class="hint">Your records, as on the PRs page, against your body weight on ${shortDate(s.body.date)}.${per}</p>
  </section>`;
}

// How fast each lift's record climbs, with its record line drawn on a time scale the three share.
function gainStats() {
  const today = todayISO();
  const rows = LIFTS.map((l) => ({ l, g: gains(state, l.id, today) })).filter((r) => r.g);
  if (!rows.length) return '';
  const from = rows.map((r) => r.g.first.date).sort()[0];
  const list = rows.map(({ l, g }) => {
    const year = g.lastYear === null ? '' : g.lastYear > 0 ? ` Up ${fmt(g.lastYear)} in the last 12 months.` : ' Nothing new in the last 12 months.';
    const meta = g.steps.length > 1
      ? `${fmt(g.first.value)} on ${shortDate(g.first.date)} to ${fmt(g.best.value)} on ${shortDate(g.best.date)}.${year}`
      : `${fmt(g.best.value)} on ${shortDate(g.best.date)}, your only record so far.`;
    return `<li class="gain-row">
      <span class="gain-name">${l.short}</span>
      <span class="gain-num">${g.perYear === null ? '–' : `+${fmt(Math.round(g.perYear))}<span class="gain-unit"> ${state.unit} a year</span>`}</span>
      ${g.steps.length > 1 ? sparkline(g.steps, from, today) : '<span class="spark"></span>'}
      <span class="gain-meta">${meta}</span>
    </li>`;
  }).join('');
  return `<section class="chart-block">
    <h2 class="chart-title">How fast you're gaining</h2>
    <ul class="gain-list">${list}</ul>
    <p class="hint">Each lift's record from the first on file to today, so a long wait for the next one slows the rate. The blue end of each line is the last 12 months. Earlier maxes added under Lifts reach further back.</p>
  </section>`;
}

// Where each test set's estimate landed against the max, on a scale from 86% to 110% of it.
const CHECK_SCALE = [0.86, 1.1];
const checkAt = (r) => {
  const [lo, hi] = CHECK_SCALE;
  return `${((Math.min(hi, Math.max(lo, r)) - lo) / (hi - lo)) * 100}%`;
};

// Whether each lift's max matches its test sets, and what the reps on the next one would say.
function maxStats() {
  const b = block();
  let tested = 0;
  const rows = LIFTS.map((l) => {
    const checks = maxChecks(state, l.id);
    tested += checks.length;
    const latest = checks[checks.length - 1];
    const next = nextTest(state, l.id);
    const track = checks.length ? `<span class="check-track" aria-hidden="true">
        <span class="check-band" style="left:${checkAt(0.93)};width:calc(${checkAt(0.99)} - ${checkAt(0.93)})"></span>
        ${checks.map((c, i) => `<i class="check-dot${i === checks.length - 1 ? ' is-latest' : ''}" style="left:${checkAt(c.ratio)}"></i>`).join('')}
      </span>
      <span class="check-zones" aria-hidden="true"><span style="left:${checkAt(0.895)}">Lower</span><span style="left:${checkAt(0.96)}">Hold</span><span style="left:${checkAt(1.045)}">Raise</span></span>` : '';
    const said = (c) => {
      const what = c.week === FIRST_TEST
        ? { raise: `raised ${fmt(c.by)} for weeks 4–8`, hold: 'held for weeks 4–8', lower: `lowered ${fmt(-c.by)} for weeks 4–8` }[c.change]
        : { raise: 'you’re ahead of it', hold: 'about right', lower: 'it’s ahead of you' }[c.change];
      return `Week ${c.week + 1}${state.blocks.length > 1 ? ` of block ${c.block + 1}` : ''}: ${fmt(c.weight)} × ${c.reps} estimates ${fmt(Math.round(c.estimate))}, ${pct(c.ratio)} of the ${fmt(c.max)} max: ${what}.`;
    };
    const ahead = next && testFeeds(b, next.week);
    return `<li class="check-row">
      <span class="check-name">${l.short}</span><span class="check-max">${fmt(weekMax(b, l.id, currentWeek(b), state))}</span>
      ${track}
      ${latest ? `<p class="check-said">${said(latest)}</p>` : ''}
      ${next ? `<p class="check-next">Week ${next.week + 1} test set, ${fmt(next.weight)} × ${WEEKS[next.week].base.reps}+. ${ahead}</p>
        ${bandList(next.bands)}` : ''}
    </li>`;
  }).join('');
  return `<section class="chart-block">
    <h2 class="chart-title">Is your max right?</h2>
    <ul class="check-list">${rows}</ul>
    <p class="hint">${tested
    ? 'Each dot is a test set’s estimate against the max that week trained from, the latest in white. Between 93% and 99% the max holds.'
    : 'Your 2+ sets in weeks 3 and 6 test the max. Until the first, here’s what the reps on each would do.'}</p>
  </section>`;
}

const DAY_STATES = { trained: 'Trained', skipped: 'Skipped', next: 'Next', todo: 'To come' };

// This block's days as a grid of weekdays by weeks, with each weekday's share trained over every block.
// The current block's days, a row per weekday and a column per week, with each weekday's share trained over every
// block when `rates`. Without them, the legend leaves out states the grid doesn't have.
function dayGrid(c, rates) {
  const head = block().log.map((_, w) => `<th scope="col">${w + 1}</th>`).join('');
  const rows = WEEKDAYS.map((day, d) => {
    const cells = c.grid[d].map((st) => (st
      ? `<td><i class="day-cell is-${st}" aria-hidden="true"></i><span class="sr-only">${DAY_STATES[st]}</span></td>` : '<td></td>')).join('');
    const { trained, skipped } = c.byDay[d];
    const rate = rates ? `<td class="day-rate">${trained + skipped ? pct(trained / (trained + skipped)) : '–'}</td>` : '';
    return `<tr><th scope="row">${shortDay(day)}</th>${cells}${rate}</tr>`;
  }).join('');
  const shown = new Set(c.grid.flat());
  const legend = Object.entries(DAY_STATES).filter(([k]) => rates || shown.has(k))
    .map(([k, label]) => `<span><i class="day-cell is-${k}"></i>${label}</span>`).join('');
  return `<table class="day-grid">
      <caption class="sr-only">Block ${state.blocks.length}, each training day by week</caption>
      <thead><tr><th scope="col"><span class="sr-only">Day</span></th>${head}${rates ? '<th scope="col" class="day-rate">All</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="chart-legend day-legend">${legend}</p>`;
}

function showingUp() {
  const c = consistency(state);
  const slips = c.slips
    ? `${c.slips.day}s slip the most: ${c.slips.skipped} of ${c.slips.trained + c.slips.skipped} skipped.`
    : 'Nothing skipped yet.';
  return `<section class="chart-block">
    <h2 class="chart-title">Showing up</h2>
    <dl class="stats">
      <div><dt>Trained</dt><dd>${c.trained}</dd></div>
      <div><dt>Skipped</dt><dd>${c.skipped}</dd></div>
      <div><dt>In a row</dt><dd>${c.run}</dd></div>
    </dl>
    ${dayGrid(c, true)}
    <p class="hint">${slips} Trained and skipped count this block's days; in a row is days trained since the last one skipped. The weeks are block ${state.blocks.length}'s, and All is each weekday trained over every block.</p>
  </section>`;
}

// One accessory's trend as a row: a button to its history in History, or plain where that isn't open.
function trendRow(t, num, meta, open = true) {
  const inside = `${picHTML(t.exercise, t.variant)}<span class="index-text">
      <span class="index-name">${esc(t.exercise.name)}${t.variant ? ` (${esc(t.variant)})` : ''}</span><span class="index-meta">${meta}</span>
    </span><span class="stat-row-num">${num}</span>`;
  return open
    ? `<li><button class="index-row stat-row" data-action="exercise-open" data-exercise="${t.exercise.id}"${t.variant ? ` data-variant="${esc(t.variant)}"` : ''}>${inside}</button></li>`
    : `<li><div class="index-row stat-row">${inside}</div></li>`;
}

// How a trend went up: "Est. max 120 to 135, over 6 sessions", or most reps for body-weight work.
function trendUp(t) {
  const best = (v) => (v.kind === 'reps' ? plural(v.value, 'rep') : estText(t.exercise, v.value));
  return `${t.first.kind === 'reps' ? 'Most reps' : 'Est. max'} ${best(t.first)} to ${best(t.last)}, over ${plural(t.sessions, 'session')}`;
}

const trendStuck = (t) => `Level for ${t.flat} sessions. Last: ${setsText(t.latest.sets, t.exercise)}`;

// Which accessories are going up since they were first logged, and which have stalled.
function accessoryStats() {
  const trends = accessoryTrends(state);
  const title = '<h2 class="chart-title">Accessories moving and stuck</h2>';
  if (!trends.length) {
    return `<section class="chart-block">${title}
      <p class="chart-empty">Shows once you've done an accessory twice: which ones are going up, and any that have stopped.</p>
    </section>`;
  }
  const up = trends.filter((t) => t.change > 0).sort((a, b) => b.change - a.change);
  const stuck = trends.filter((t) => t.flat >= STUCK_AFTER).sort((a, b) => b.flat - a.flat);
  const upRows = up.slice(0, 5).map((t) => trendRow(t, `+${Math.round(t.change * 100)}%`, trendUp(t))).join('');
  const stuckRows = stuck.map((t) => trendRow(t, '', trendStuck(t))).join('');
  return `<section class="chart-block">${title}
    <p class="hint">${up.length} of ${trends.length} going up since you first logged them, each variant on its own.</p>
    ${upRows ? `<h3 class="stat-sub">Going up</h3><ul class="index-list">${upRows}</ul>` : ''}
    ${stuckRows ? `<h3 class="stat-sub">Stuck</h3><ul class="index-list">${stuckRows}</ul>
      <p class="hint">Double progression adds a rep or some weight each session. After ${STUCK_AFTER} without either, drop the weight about 10% and build back up, or switch variants.</p>`
    : `<p class="hint">Nothing stuck: each one added weight or reps in its last ${STUCK_AFTER - 1} sessions.</p>`}
  </section>`;
}

// The odometer: everything lifted in all, and this block against the last a day at a time.
function totalStats() {
  const { all, blocks } = totals(state);
  const n = (x) => Math.round(x).toLocaleString();
  const perDay = (t, k) => (t.days ? t[k] / t.days : 0);
  let compare = '';
  if (blocks.length > 1) {
    const [now, last] = blocks.slice(-2).reverse();
    const row = (label, f) => `<tr><th scope="row"><span class="h-date">${label}</span></th><td>${f(now)}</td><td>${f(last)}</td></tr>`;
    compare = `<table class="history weeks stat-compare">
      <thead><tr><th scope="col"><span class="sr-only">Measure</span></th><th scope="col">This block</th><th scope="col">Last block</th></tr></thead>
      <tbody>
        ${row('Days trained', (t) => t.days)}
        ${row(`${state.unit} a day`, (t) => n(perDay(t, 'volume')))}
        ${row('Sets a day', (t) => fmt(Math.round(perDay(t, 'sets') * 10) / 10))}
        ${row('Time a day', (t) => (t.timed ? spanText(t.ms / t.timed) : '–'))}
      </tbody>
    </table>`;
  }
  return `<section class="chart-block">
    <h2 class="chart-title">Everything you've lifted</h2>
    <p class="stat-hero"><span class="show-digits">${n(all.volume)}</span><span class="stat-hero-label">${state.unit}</span></p>
    <dl class="stats">
      <div><dt>Days</dt><dd>${n(all.days)}</dd></div>
      <div><dt>Sets</dt><dd>${n(all.sets)}</dd></div>
      <div><dt>Reps</dt><dd>${n(all.reps)}</dd></div>
      <div><dt>Timed</dt><dd>${all.timed ? hoursText(all.ms) : '–'}</dd></div>
    </dl>
    ${compare}
    <p class="hint">Weight × reps of every main-lift work set and accessory set (warm-ups aren't logged), with plates a side counted on both sides. Timed adds up the ${plural(all.timed, 'day')} timed from Start to End workout.${blocks.length > 1 ? '' : ' This block against the last shows once block 2 starts.'}</p>
  </section>`;
}

// Hard sets per muscle in one week of the current block, against the 10–20 a week that's a common target
// for growth, with the week before for comparison.
const SET_TARGET = [10, 20];

function musclesHistory() {
  const b = block();
  const now = currentWeek(b);
  const week = Math.min(ui.muscleWeek ?? now, now);
  const prevBlock = state.blocks[state.blocks.length - 2];
  const counts = muscleSets(state, b.log[week]);
  const before = week ? muscleSets(state, b.log[week - 1]) : prevBlock ? muscleSets(state, prevBlock.log[BLOCK_WEEKS - 1]) : null;
  const assigned = new Set([...Object.values(LIFT_MUSCLE), ...state.exercises.map((e) => e.muscle ?? null)]);
  const shown = [...MUSCLES, null].filter((m) => counts.has(m) || before?.has(m) || (m !== null && assigned.has(m)));
  const scale = Math.max(SET_TARGET[1] + 4, ...counts.values());
  const pct = (n) => `${(n / scale) * 100}%`;
  const rows = shown.map((m) => {
    const n = counts.get(m) ?? 0;
    const was = before && (before.get(m) ?? 0);
    return `<li class="muscle-row${n ? '' : ' is-empty'}">
      <span class="muscle-name">${m ?? 'Muscle not set'}</span>
      <span class="muscle-count"><strong>${n}</strong> ${n === 1 ? 'set' : 'sets'}${before ? `<span class="muscle-was">, ${was} the week before</span>` : ''}</span>
      <span class="muscle-track" aria-hidden="true">
        <span class="muscle-band" style="left:${pct(SET_TARGET[0])};width:${pct(SET_TARGET[1] - SET_TARGET[0])}"></span>
        <span class="muscle-fill" style="width:${pct(n)}"></span>
      </span>
    </li>`;
  }).join('');
  const unset = state.exercises.filter((e) => !e.muscle).length;
  return `<div class="week-step">
      <button class="icon-btn" data-action="muscle-week" data-by="-1" data-key="muscle-prev" aria-label="Week before"${week === 0 ? ' disabled' : ''}>‹</button>
      <h2 class="week-step-label">Week ${week + 1}${week === now ? ', this week' : ''}</h2>
      <button class="icon-btn" data-action="muscle-week" data-by="1" data-key="muscle-next" aria-label="Week after"${week >= now ? ' disabled' : ''}>›</button>
    </div>
    <p class="hint">Sets logged for each muscle in this training week. The shaded part of each bar is ${SET_TARGET[0]}–${SET_TARGET[1]} sets, a common weekly target for growth.${isLightWeek(week) ? ' Weeks 7 and 8 are lighter on purpose.' : ''}</p>
    <ul class="muscle-list">${rows}</ul>
    <p class="hint">Main lift sets count too: bench for chest, squat for quads, deadlift for back.${unset ? ` ${plural(unset, 'accessory')} ${unset === 1 ? 'has' : 'have'} no muscle yet; set it in Settings → Accessories.` : ''}</p>`;
}

function chartFigure(kind, label, svg) {
  return `<figure class="chart" data-chart="${kind}" data-key="chart-${kind}" tabindex="0" aria-label="${label}. Use the arrow keys to read each point.">
    ${svg}
    <div class="chart-tip" hidden></div>
  </figure>`;
}

const minutes = (ms) => `${Math.round(ms / 6000) / 10} min`;

// How long training days take and where the time goes, from the days timed with Start and End workout.
// A day still running isn't a day's length yet, so only ended days make the averages.
function timeHistory() {
  const all = timedSessions(state);
  const timed = all.filter(({ time }) => time.ended);
  if (!timed.length) {
    return `<p class="chart-empty">Nothing timed yet. Tap Start workout on a training day, log your sets as you go, and End workout when you're done. How long each day took, and where the time went, shows up here.</p>`;
  }
  // A typical day of each kind, averaged over the days timed.
  const days = WEEKDAYS.map((day) => {
    const of = timed.filter(({ session }) => session.day === day);
    if (!of.length) return '';
    const avg = of.reduce((sum, { time }) => sum + time.total, 0) / of.length;
    return `<li class="time-row">
      <span class="time-name">${day}, ${liftOf(of[0].session).name.toLowerCase()}</span>
      <span class="time-num">${spanText(avg)}</span>
      <span class="time-meta">${of.length === 1 ? 'One day timed' : `Average of ${of.length} days`}</span>
    </li>`;
  }).join('');
  const recent = timed.slice(-12).reverse().map(({ session, time }) => {
    const lift = time.parts.find((p) => p.part === 'lift');
    const extras = time.parts.filter((p) => p.part !== 'lift').reduce((sum, p) => sum + p.ms, 0);
    return `<tr>
      <th scope="row"><span class="h-date">${session.date ? shortDate(session.date) : '–'}, ${session.day.slice(0, 3)} ${liftOf(session).short.toLowerCase()}</span></th>
      <td>${spanText(time.total)}</td>
      <td>${lift ? spanText(lift.ms) : '–'}</td>
      <td>${extras ? spanText(extras) : '–'}</td>
    </tr>`;
  }).join('');
  // Each exercise over every timed set: the lifts by name, accessories by id, a deleted one left out.
  const rows = [...partTimes(state)].map(([key, t]) => {
    const name = key.startsWith('lift:') ? `${LIFTS.find((l) => l.id === key.slice(5)).name}, with warm-up` : exerciseById(key)?.name;
    return name && { name: esc(name), perDay: t.ms / t.days, perSet: t.ms / t.sets, days: t.days };
  }).filter(Boolean).sort((a, b) => b.perDay - a.perDay).map((r) => `<li class="time-row">
      <span class="time-name">${r.name}</span>
      <span class="time-num">${spanText(r.perDay)}</span>
      <span class="time-meta">${minutes(r.perSet)} a set, rest included, over ${plural(r.days, 'day')}</span>
    </li>`).join('');
  return `<section class="chart-block">
      <h2 class="chart-title">How long your days take</h2>
      <p class="hint">From Start workout to End workout. The lift's time includes its warm-up, and the rest and setting up before a set count toward the exercise that followed.</p>
      <ul class="time-list">${days}</ul>
      <h3 class="chart-title history-title">Recent days</h3>
      <table class="history weeks time-table">
        <thead><tr><th scope="col">Day</th><th scope="col">Length</th><th scope="col">Lift</th><th scope="col">Accessories</th></tr></thead>
        <tbody>${recent}</tbody>
      </table>
    </section>
    <section class="chart-block">
      <h2 class="chart-title">Where the time goes</h2>
      <p class="hint">What each exercise takes on a day you do it, the slowest first. To make a day shorter, shorten the rests here, superset two, or drop one.</p>
      <ul class="time-list">${rows}</ul>
    </section>`;
}

function extrasHistory() {
  if (ui.exercise && exerciseById(ui.exercise)) return exerciseDetail(exerciseById(ui.exercise));
  if (!state.exercises.length) {
    return `<p class="chart-empty">No accessories yet. Add them from a training day, or in Settings.</p>`;
  }
  const rows = state.exercises.map((e) => {
    const h = exerciseHistory(state, e.id);
    const last = h[h.length - 1];
    const best = records(h, e, state.unit).best;
    const meta = last
      ? `Last ${last.date ? shortDate(last.date) : 'logged'}: ${setsText(last.sets, e)}${best ? `. Est. max ${estText(e, best.value)}` : ''}`
      : 'Not logged yet';
    return `<li><button class="index-row" data-action="exercise-open" data-exercise="${e.id}">${picHTML(e)}<span class="index-text">
      <span class="index-name">${esc(e.name)}</span><span class="index-meta">${meta}</span>
    </span></button></li>`;
  }).join('');
  return `<ul class="index-list">${rows}</ul>`;
}

function exerciseDetail(e) {
  const all = exerciseHistory(state, e.id);
  const used = [...new Set(all.map((h) => h.variant))];
  if (!used.includes(ui.variant)) ui.variant = used[used.length - 1] ?? null;
  const history = all.filter((h) => h.variant === ui.variant);
  const back = '<button class="btn-quiet back" data-action="exercise-close">All accessories</button>';
  const title = `<h2 class="chart-title detail-title">${esc(e.name)}</h2>`;
  if (!history.length) return `${back}${title}<p class="chart-empty">Not logged yet. It fills in after the first session.</p>`;
  const variants = used.length > 1
    ? `<fieldset class="variant-pick" aria-label="Variant">${segmented('variant', used.map((v) => ({ value: v ?? '', label: v ?? 'Other' })), ui.variant ?? '')}</fieldset>` : '';
  const { heaviest, best, volume } = records(history, e, state.unit);
  const points = history.map((h, i) => {
    const top = sessionBest(h.sets, e, state.unit);
    const date = h.date ? shortDate(h.date) : `Session ${i + 1}`;
    return { value: Math.round(top.value * 10) / 10, label: date, title: date, note: top.kind === 'reps' ? 'reps, best set' : `est. max, from ${setsText(h.sets, e)}` };
  });
  chartData.progress = points;
  const reps = points.every((p, i) => sessionBest(history[i].sets).kind === 'reps');
  const recent = history.slice(-8).reverse().map((h) => `<tr>
      <th scope="row"><span class="h-date">${h.date ? shortDate(h.date) : '–'}</span></th>
      <td class="sets-cell">${setsText(h.sets, e)}</td>
    </tr>`).join('');
  return `${back}${title}${variants}
    <dl class="stats">
      <div><dt>Heaviest set</dt><dd>${loadText(e, heaviest.weight)} × ${heaviest.reps}</dd></div>
      ${best ? `<div><dt>Estimated max</dt><dd>${estText(e, best.value)}</dd></div>` : ''}
      <div><dt>Best session</dt><dd>${Math.round(volume).toLocaleString()}</dd></div>
    </dl>
    <p class="hint">Best session is weight × reps added up, in ${state.unit}.${isCounted(e) ? ' Plates count at what they weigh, on both sides.' : ''}</p>
    <section class="chart-block">
      <h3 class="chart-title">${reps ? 'Most reps in a set' : `Estimated max${isCounted(e) ? `, ${state.unit} a side` : ''}, by session`}</h3>
      ${points.length > 1 ? chartFigure('progress', `${esc(e.name)} by session`, progressChart(points, chartWidth()))
        : '<p class="chart-empty">Log it again to see a chart.</p>'}
    </section>
    <h3 class="chart-title history-title">Recent sessions</h3>
    <table class="history weeks"><tbody>${recent}</tbody></table>`;
}

function bodyHistory() {
  const entries = state.bodyweight;
  const latest = entries[entries.length - 1];
  const points = entries.map((e) => ({ value: e.weight, label: shortDate(e.date), title: shortDate(e.date), note: state.unit }));
  chartData.body = points;
  const recent = entries.slice(-10).reverse().map((e) => `<tr>
      <th scope="row"><span class="h-date">${shortDate(e.date)}</span></th><td>${fmt(e.weight)} ${state.unit}</td>
    </tr>`).join('');
  return `<form class="body-form" id="bodyweight-form" novalidate>
      <label class="field">
        <span class="field-label">Today's body weight</span>
        <span class="field-row">
          <input class="num-input" name="weight" type="number" inputmode="decimal" step="any" min="0" placeholder="${latest ? fmt(latest.weight) : ''}">
          <span class="field-unit">${state.unit}</span>
        </span>
      </label>
      <button class="btn" type="submit">Log</button>
    </form>
    ${latest ? `<p class="hint">Last logged ${fmt(latest.weight)} ${state.unit} on ${shortDate(latest.date)}. Logging again today replaces today's number.</p>` : ''}
    <section class="chart-block">
      <h2 class="chart-title">Body weight</h2>
      ${points.length > 1 ? chartFigure('body', 'Body weight by day', progressChart(points, chartWidth()))
        : `<p class="chart-empty">${points.length ? 'Log it on another day to see a chart.' : 'Log your weight to start the chart.'}</p>`}
    </section>
    ${recent ? `<table class="history weeks"><tbody>${recent}</tbody></table>` : ''}`;
}

function liftsHistory() {
  const lift = LIFTS.find((l) => l.id === ui.lift);
  const name = lift.short.toLowerCase();
  const changes = maxChanges(state, lift.id);
  const weeks = liftHistory(state, lift.id).map((w) => ({ ...w, since: maxSince(changes, w.block, w.week).date }));
  chartData.max = weeks;
  chartData.volume = weeks;
  const width = chartWidth();
  // Each week in that lift's heat colour, the same as the graph behind the day's weight on Train.
  const heat = weeks.map((w) => oklch(heatColour(weekHeat(state.blocks[w.block], w.week, lift.id))));
  const tested = weeks.filter((w) => w.tests.length);
  const lifted = weeks.filter((w) => w.volume > 0);
  const latest = weeks[weeks.length - 1].max;
  const total = (b) => tidy(LIFTS.reduce((sum, l) => sum + b.max[l.id], 0));
  const cell = (value, prev) => {
    const delta = prev === undefined || value === prev ? '' : `<span class="h-delta">${value > prev ? '+' : ''}${fmt(value - prev)}</span>`;
    return `<td><span class="h-num">${fmt(value)}</span>${delta}</td>`;
  };
  const rows = state.blocks.map((b, i) => {
    const prev = state.blocks[i - 1];
    return `<tr>
      <th scope="row"><span class="h-block">${i + 1}</span><span class="h-date">${shortDate(b.started)}</span></th>
      ${LIFTS.map((l) => cell(b.max[l.id], prev?.max[l.id])).join('')}
      ${cell(total(b), prev && total(prev))}
    </tr>`;
  }).reverse().join('');
  const why = (c) => (c.past ? 'Entered by hand' : c.test ? `Week 3 test set, ${fmt(c.test.weight)} × ${c.test.reps}`
    : c.block ? `Block ${c.block + 1} started` : 'Your starting max');
  const when = (c) => (c.date ? shortDate(c.date) : 'Week 3');
  // Maxes from before the app open to be changed; the rest come from the blocks.
  const changeRows = changes.map((c, k) => {
    const label = `<span class="h-when">${when(c)}</span><span class="h-date">${why(c)}</span>`;
    return `<tr>
      <th scope="row">${c.past ? `<button class="h-edit" data-action="past-edit" data-past="${state.pastMaxes.indexOf(c.past)}" aria-label="Change your ${when(c)} max">${label}</button>` : label}</th>
      <td><span class="h-num">${fmt(c.value)}</span>${k && c.change ? `<span class="h-delta">${c.change > 0 ? '+' : ''}${fmt(c.change)}</span>` : ''}</td>
    </tr>`;
  }).reverse().join('');
  const yearsData = changes.map((c) => ({ value: c.value, label: when(c), title: c.date ? shortDate(c.date) : 'Week 3', note: why(c) }));
  chartData.years = yearsData;
  const years = changes.some((c) => c.past) && changes.length > 1
    ? chartFigure('years', `${lift.short} max by date, ${changes.length} maxes`, progressChart(yearsData, width)) : '';
  const weekRows = weeks.filter((w) => w.volume > 0 || w.tests.length).map((w) => `<tr>
      <th scope="row"><span class="h-date">Block ${w.block + 1}, week ${w.week + 1}</span></th>
      <td>${fmt(w.max)}</td>
      <td>${Math.round(w.volume).toLocaleString()}</td>
      <td>${w.tests.map((t) => fmt(Math.round(t.value))).join(', ') || '–'}</td>
    </tr>`).reverse().join('');
  return `<fieldset class="lift-pick" aria-label="Lift">${segmented('lift', LIFTS.map((l) => ({ value: l.id, label: l.short })), lift.id)}</fieldset>
    <section class="chart-block">
      <h2 class="chart-title">${lift.short} max</h2>
      <p class="chart-legend"><span><i class="key-line" style="background:${heatScale()}"></i>Max you trained from</span><span><i class="key-dot"></i>Tested</span></p>
      <figure class="chart" data-chart="max" data-key="chart-max" tabindex="0"
          aria-label="${lift.short} max by week, now ${fmt(latest)} ${state.unit}${tested.length ? `, ${plural(tested.length, 'tested result')}` : ''}. Use the arrow keys to read each week.">
        ${maxChart(weeks, width, undefined, heat)}
        <div class="chart-tip" hidden></div>
      </figure>
      <p class="hint">${tested.length ? 'Dots are estimates from your test sets (the 2+ sets) and re-max singles. Tap a week for its numbers.' : 'Dots appear here after your week 3 test sets: the max each one estimates.'}</p>
      <h3 class="chart-title history-title">${lift.short} max by date</h3>
      ${years}
      <table class="history max-dates">
        <thead><tr><th scope="col">Set on</th><th scope="col">Max</th></tr></thead>
        <tbody>${changeRows}</tbody>
      </table>
      ${changes.some((c) => c.past) ? '' : '<p class="hint">Add maxes from before you used the app to see your progress over the years.</p>'}
      <button class="btn-quiet past-add" data-action="past-new" data-key="past-new">Add an earlier max</button>
    </section>
    <section class="chart-block">
      <h2 class="chart-title">Weekly volume</h2>
      <p class="chart-legend">Weight × reps for every ${name} set you logged, in ${state.unit}.</p>
      ${lifted.length ? `<figure class="chart" data-chart="volume" data-key="chart-volume" tabindex="0"
          aria-label="Weekly ${name} volume, ${plural(lifted.length, 'week')} logged. Use the arrow keys to read each week.">
        ${volumeChart(weeks, width, undefined, heat)}
        <div class="chart-tip" hidden></div>
      </figure>` : `<p class="chart-empty">Log a ${name} set to see your weekly volume.</p>`}
    </section>
    ${weekRows ? `<details class="chart-table">
      <summary class="btn-quiet">Show ${name} week by week</summary>
      <table class="history weeks">
        <thead><tr><th scope="col">Week</th><th scope="col">Max</th><th scope="col">Volume</th><th scope="col">Tested</th></tr></thead>
        <tbody>${weekRows}</tbody>
      </table>
    </details>` : ''}
    <h2 class="chart-title history-title">Maxes by block</h2>
    <p class="hint">The maxes each block started from. Total is squat, bench and deadlift added together.</p>
    <table class="history">
      <thead><tr><th scope="col">Block</th>${LIFTS.map((l) => `<th scope="col">${l.short}</th>`).join('')}<th scope="col">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function settingsView() {
  const b = block();
  const maxRow = (l) => {
    const moved = maxChanges(state, l.id).find((c) => c.block === state.blocks.length - 1 && c.test);
    const when = moved?.date ? ` on ${shortDate(moved.date)}` : '';
    return `<div class="max-row">
      ${maxField(l, fmt(b.max[l.id]))}
      <label class="date-field">
        <span class="field-note">Set on</span>
        <input class="date-input" name="${l.id}Date" type="date" max="${todayISO()}" value="${b.maxDates?.[l.id] ?? b.started}">
      </label>
      ${moved ? `<p class="field-note">Your week 3 test set moved it to ${fmt(moved.value)}${when} for weeks 4–8.</p>` : ''}
    </div>`;
  };
  const roundOptions = ROUNDING[state.unit].map((r) => ({ value: String(r), label: `${fmt(r)} ${state.unit}` }));
  const maxOptions = [{ value: 'false', label: 'Full max' }, { value: 'true', label: '90% training max' }];
  const restOptions = [{ value: 'sound', label: 'Sound' }, { value: 'silent', label: 'Silent' }, { value: 'off', label: 'Off' }];
  return `<header class="top"><h1 class="display">Settings</h1></header>
    <fieldset class="setting">
      <legend class="setting-title">Units</legend>
      ${segmented('unit', unitOptions(), state.unit)}
      <p class="hint">Switching converts your maxes and any weights you changed.</p>
    </fieldset>
    <fieldset class="setting">
      <legend class="setting-title">Round weights to the nearest</legend>
      ${segmented('round', roundOptions, String(state.round))}
      <p class="hint">2.5 ${state.unit} rounding needs a pair of 1.25 ${state.unit} plates.</p>
    </fieldset>
    <fieldset class="setting">
      <legend class="setting-title">Plates you have</legend>
      <div class="day-boxes plate-boxes">${PLATES[state.unit].map((p) => `<label class="day-box"><input type="checkbox" name="plate" value="${p}"${plateSizes(state).includes(p) ? ' checked' : ''}><span>${fmt(p)}</span></label>`).join('')}</div>
      <p class="hint">Plates a side on the bar, in the warm-ups, for accessories and on the PRs page use only these.</p>
    </fieldset>
    <fieldset class="setting">
      <legend class="setting-title">Work from</legend>
      ${segmented('trainingMax', maxOptions, String(state.trainingMax))}
      <p class="hint">Switch to a 90% training max if your max was a grind, or your 2+ sets start coming up short.</p>
    </fieldset>
    <fieldset class="setting">
      <legend class="setting-title">Rest timer</legend>
      ${segmented('rest', restOptions, state.rest)}
      <p class="hint">Starts when you log a set, timed for the lift and the weight: longer for heavier sets and deadlifts. The screen stays on while it runs, and the bar turns white when rest is over. Beeps only play with the app open and the ring switch off silent.</p>
    </fieldset>
    <fieldset class="setting">
      <legend class="setting-title">DOTS score</legend>
      ${segmented('dots', DOTS_OPTIONS, state.dots ?? null)}
      <p class="hint">The formula History → Stats scores your total with, to compare it across body weights.</p>
    </fieldset>
    ${exercisesSection()}
    <section class="setting">
      <h2 class="setting-title">Current maxes</h2>
      <p class="hint">Fix a typo, or set the day you hit each max. Changes apply to block ${state.blocks.length} right away. Maxes from before you started go in History → Lifts.</p>
      <form class="max-form" id="max-form" novalidate>
        ${LIFTS.map(maxRow).join('')}
        <button class="btn" type="submit">Save maxes</button>
      </form>
    </section>
    ${syncSection()}
    <section class="setting">
      <h2 class="setting-title">Backup file</h2>
      <p class="hint">${sync.isConnected()
        ? 'A second copy you keep yourself, for example in Files or iCloud Drive.'
        : "Your log lives only on this phone. Every few weeks, save a backup to Files so a lost or reset phone doesn't take it with it."}</p>
      <div class="button-row">
        <button class="btn" data-action="backup">Save backup</button>
        <button class="btn-quiet" data-action="restore">Restore backup</button>
      </div>
    </section>
    <section class="setting">
      <h2 class="setting-title">Erase all data</h2>
      <p class="hint">${sync.isConnected()
        ? 'Deletes every block on this phone and disconnects GitHub. The log saved on GitHub stays there, so you can restore it later.'
        : 'Deletes every block on this phone. Save a backup first if you might want it back.'}</p>
      <button class="btn-danger" data-action="erase">Erase all data</button>
    </section>
    ${versionLine()}`;
}

// The version running, and a newer one once it has downloaded (see watchUpdates).
function versionLine() {
  const number = (v) => v.replace(/^wave-v/, '');
  return `<p class="version" id="version">Version ${number(VERSION)}${update
    ? `. Version ${number(update)} is ready. <button class="btn-quiet version-load" data-action="update-load">Load it now</button>` : ''}</p>`;
}

const shortDay = (d) => d.slice(0, 3);
const listDays = (days) => (days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}` : days.join(''));
const capital = (text) => text.replace(/^./, (c) => c.toUpperCase());
// A kind of day (extras.js DAY_KINDS) by its lift: "Bench days", "Deadlift day".
const kindName = (k) => `${LIFTS.find((l) => l.id === k.lift).short} day${k.days.length > 1 ? 's' : ''}`;

// The exercises by kind of day (bench days, squat days, deadlift day), each day's in the order it does them.
// Each kind is one closed line until it's tapped, and one is open at a time, so the list doesn't run on.
function exercisesSection() {
  const groups = exercisesByDay(state).map((k) => {
    const key = k.lift ?? 'none';
    const lift = LIFTS.find((l) => l.id === k.lift);
    const open = ui.exerciseKind === key;
    const head = `<h3 class="index-group-head"><button class="index-group" data-action="exercise-kind" data-kind="${key}" data-key="exercise-kind-${key}" aria-expanded="${open}">
        <span class="index-group-name">${lift ? kindName(k) : 'No set days'}</span>
        <span class="index-group-days">${lift ? listDays(k.days) : 'Only when added to a day'}. ${k.exercises.length ? plural(k.exercises.length, 'exercise') : 'None yet'}</span>
      </button></h3>`;
    if (!open) return head;
    const ownDays = (e) => e.days.length === k.days.length && e.days.every((d) => k.days.includes(d));
    const last = k.exercises.length - 1;
    const rows = k.exercises.map((e, i) => {
      // The days show only when they aren't just the kind's own: one of them, or another kind's day too.
      const days = ownDays(e) ? '' : `, ${e.days.map(shortDay).join(', ')}`;
      const partner = exerciseById(e.link) ?? state.exercises.find((x) => x.link === e.id);
      const variants = `${e.variants.length ? `. ${e.variants.map(esc).join(' or ')}` : ''}${partner ? `. Superset with ${esc(partner.name)}` : ''}`;
      return `<li class="exercise-row">
        <button class="index-row" data-action="exercise-edit" data-exercise="${e.id}" data-key="exercise-edit-${key}-${e.id}">${picHTML(e)}<span class="index-text">
          <span class="index-name">${esc(e.name)}</span>
          <span class="index-meta">${e.sets} × ${e.low}–${e.high}${days}${e.muscle ? `. ${e.muscle}` : ''}${isCounted(e) ? '. In plates a side' : ''}${variants}</span>
        </span></button>
        <button class="icon-btn" data-action="exercise-move" data-exercise="${e.id}" data-kind="${key}" data-by="-1" data-key="exercise-up-${key}-${e.id}"
          aria-label="Move ${esc(e.name)} up"${i === 0 ? ' disabled' : ''}>↑</button>
        <button class="icon-btn" data-action="exercise-move" data-exercise="${e.id}" data-kind="${key}" data-by="1" data-key="exercise-down-${key}-${e.id}"
          aria-label="Move ${esc(e.name)} down"${i === last ? ' disabled' : ''}>↓</button>
      </li>`;
    }).join('');
    return `${head}
      ${rows ? `<ol class="index-list">${rows}</ol>` : '<p class="hint">None yet.</p>'}`;
  }).join('');
  return `<section class="setting">
    <h2 class="setting-title">Accessories</h2>
    <p class="hint">Your exercises by the days they show up on. Tap a day to see its exercises with their rep ranges, in the order you do them, then tap one to edit it; the arrows move one within its days.</p>
    <div class="index-groups">${groups}</div>
    <button class="btn" data-action="exercise-new">Add an exercise</button>
    <p class="hint credit">Exercise drawings from <a href="https://github.com/AlexMollard/Open-Exercise-Art" target="_blank" rel="noopener">Open Exercise Art</a> by Alex Mollard, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>, with their lines thickened.</p>
  </section>`;
}

// ---------- Chart taps ----------

function tipContent(kind, w) {
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text === undefined ? {} : { textContent: text });
  const row = (key, value, label) => {
    const r = el('div', 'tip-row');
    r.append(el('i', key), el('strong', '', value), el('span', '', label));
    return r;
  };
  if (kind === 'progress' || kind === 'body' || kind === 'years') return [el('div', 'tip-title', w.title), row('key-line', fmt(w.value), w.note)];
  const title = el('div', 'tip-title', `Block ${w.block + 1}, week ${w.week + 1}`);
  if (kind === 'volume') return [title, row('key-line', Math.round(w.volume).toLocaleString(), `${state.unit}, ${plural(w.reps, 'rep')}`)];
  return [title, row('key-line', fmt(w.max), w.since ? `max, set ${shortDate(w.since)}` : 'max'),
    ...w.tests.map((t) => row('key-dot', fmt(Math.round(t.value)), t.kind === 'remax' ? 're-max' : `from ${fmt(t.weight)} × ${t.reps}`))];
}

function showTip(figure, index) {
  const hit = figure.querySelector('.chart-hit');
  const x = Number(hit.dataset.left) + Number(hit.dataset.slot) * (index + 0.5);
  const cross = figure.querySelector('.chart-cross');
  cross.setAttribute('x1', x);
  cross.setAttribute('x2', x);
  cross.setAttribute('visibility', 'visible');
  const tip = figure.querySelector('.chart-tip');
  tip.replaceChildren(...tipContent(figure.dataset.chart, chartData[figure.dataset.chart][index]));
  tip.hidden = false;
  // Beside the crosshair, on whichever side has room.
  const left = x > figure.clientWidth / 2 ? x - tip.offsetWidth - 12 : x + 12;
  tip.style.left = `${Math.max(0, Math.min(left, figure.clientWidth - tip.offsetWidth))}px`;
  figure.dataset.index = index;
}

function hideTip(figure) {
  figure.querySelector('.chart-tip').hidden = true;
  figure.querySelector('.chart-cross').setAttribute('visibility', 'hidden');
  delete figure.dataset.index;
}

function chartPointer(e) {
  const figure = e.target.closest?.('.chart');
  for (const f of view.querySelectorAll('.chart')) if (f !== figure && f.dataset.index !== undefined) hideTip(f);
  if (!figure) return;
  const hit = figure.querySelector('.chart-hit');
  const x = e.clientX - figure.querySelector('svg').getBoundingClientRect().left;
  const index = Math.floor((x - Number(hit.dataset.left)) / Number(hit.dataset.slot));
  showTip(figure, Math.min(Number(hit.dataset.n) - 1, Math.max(0, index)));
}

// The latest point with anything logged, so keyboard reading starts where the lifter is.
function latestIndex(kind) {
  const data = chartData[kind];
  if (kind !== 'max' && kind !== 'volume') return data.length - 1;
  for (let i = data.length - 1; i >= 0; i--) if (data[i].volume || data[i].tests.length) return i;
  return 0;
}

// ---------- Workout pane ----------

// While a day is under way the rest timer's bar stays up between rests: how long the workout has run, the sets
// done, about how long is left and what's next. A rest takes the bar back while it runs, with the workout's time
// beside what's next. Tapping it goes to the day, at what's next.
const workoutPane = document.getElementById('workout');
const restClock = document.getElementById('rest-clock');
let workoutStart = null;
let workoutTicking = null;

// Today's training day while it runs: started, or with a set logged, and neither ended nor skipped.
function liveDay() {
  const b = block();
  if (!b) return null;
  for (const [week, days] of b.log.entries()) {
    for (const [index, session] of days.entries()) {
      if (session.date !== todayISO() || session.ended || session.skipped) continue;
      const time = workoutTime(session);
      if (time) return { week, index, session, start: time.start };
    }
  }
  return null;
}

// The Train helpers read the week shown; the pane works its day out in that day's own week.
function inWeek(week, fn) {
  const shown = ui.week;
  ui.week = week;
  try {
    return fn();
  } finally {
    ui.week = shown;
  }
}

// A set's time before a timed day gives it one: its rest, then this for the set and setting up.
const SET_MS = 45000;

// The day's sets, done and in all, about how long the rest take (each at its pace on the days timed, rest
// included), and the next one: the lift's, else the accessory open or under way, else the first left in the list.
function dayStatus({ week, index, session }) {
  const tapped = ui.week === week && ui.open === index ? ui.extraOpen : undefined;
  return inWeek(week, () => {
    const paces = partTimes(state);
    const pace = (key, seconds) => (paces.has(key) ? paces.get(key).ms / paces.get(key).sets : seconds * 1000 + SET_MS);
    let done = 0;
    let total = session.reps.length;
    let left = 0;
    session.reps.forEach((r, s) => {
      if (r !== null) done += 1;
      else left += pace(`lift:${session.lift}`, restSeconds(session, week, s));
    });
    const groups = dayGroups(state, session);
    for (const e of groups.flat()) {
      const entry = entryOf(session, e.id);
      if (entry?.skipped) continue;
      const count = setCount(e, entry);
      const logged = entry?.sets.filter(Boolean).length ?? 0;
      total += count;
      done += logged;
      left += (count - logged) * pace(e.id, e.rest);
    }
    const lift = session.reps.indexOf(null);
    if (lift !== -1) return { done, total, left, next: nextLabel(session, lift, true) };
    const open = openGroup(session, groups, tapped);
    for (const group of [groups.find((g) => g[0].id === open), ...groups].filter(Boolean)) {
      const next = groupNext(session, index, group);
      if (next) return { done, total, left, next: extraNextLabel(next), group: group[0].id };
    }
    return { done, total, left, next: null };
  });
}

// "42:10", or "1:02:45" past the hour.
function stopwatch(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n) => String(n).padStart(2, '0');
  return s < 3600 ? `${Math.floor(s / 60)}:${two(s % 60)}` : `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

function paintWorkout() {
  const live = liveDay();
  const status = live && dayStatus(live);
  // With every set done, a started day waits for End workout; one never started is simply over.
  const on = Boolean(status) && (status.next !== null || Boolean(live.session.started));
  workoutPane.hidden = !on;
  restClock.hidden = !on;
  document.body.classList.toggle('is-working', on);
  clearInterval(workoutTicking);
  workoutStart = on ? Date.parse(live.start) : null;
  if (!on) return;
  workoutTicking = setInterval(tickWorkout, 1000);
  tickWorkout();
  const finished = status.next === null;
  document.getElementById('workout-sets').textContent = finished ? 'Every set done' : `${status.done} of ${plural(status.total, 'set')}`;
  document.getElementById('workout-left').textContent = finished ? ''
    : `About ${spanText(Math.max(1, Math.round(status.left / 300000)) * 300000)} to go`;
  document.getElementById('workout-fill').style.transform = `scaleX(${status.total ? status.done / status.total : 1})`;
  document.getElementById('workout-end').hidden = !finished;
  document.getElementById('workout-next').textContent = finished ? 'End it so the day counts in History → Time.' : status.next;
}

function tickWorkout() {
  const text = stopwatch(Date.now() - workoutStart);
  document.getElementById('workout-time').textContent = text;
  restClock.textContent = text;
}

// ---------- Sheets ----------

const sessionAt = (index) => block().log[ui.week][index];

// "Next: set 2 of 3, 245 lb"; `named` puts the lift first, for the workout pane.
function nextLabel(session, next, named = false) {
  const weight = `${fmt(setWeight(block(), session, ui.week, next, state))} ${state.unit}`;
  const head = `Next: ${named ? `${liftOf(session).name}, ` : ''}`;
  if (session.kind === 'max') return `${head}${ATTEMPT_NAMES[next].toLowerCase()} attempt, ${weight}`;
  const aim = isTestSet(session, ui.week, next) ? testAim(session) : null;
  const test = !aim ? '' : aim.keep === null ? ', as many reps as you can' : `, all out, ${aim.keep}+ holds`;
  return `${head}set ${next + 1} of ${session.reps.length}, ${weight}${test}`;
}

// A newly logged set starts the rest before the next one; the day's last set ends any rest under way.
function logSet(session, set, reps) {
  const fresh = session.reps[set] === null && reps !== null;
  if (reps !== null) {
    // Records the weight lifted, so a later change to settings or maxes never rewrites what was done.
    const lifted = setWeight(block(), session, ui.week, set, state);
    if (session.kind === 'max') session.weights[set] ??= lifted;
    else session.weight ??= lifted;
    markTrained(session);
  }
  session.reps[set] = reps;
  // When each set was logged, for the day's timing. A set changed later keeps its time.
  if (fresh || reps === null) {
    session.times ??= session.reps.map(() => null);
    session.times[set] = fresh ? nowISO() : null;
    if (session.times.every((t) => t === null)) delete session.times;
  }
  save();
  if (!fresh) return;
  pulseGlow();
  const next = session.reps.findIndex((r) => r === null);
  if (next === -1) rest.stop();
  else rest.start(restSeconds(session, ui.week, next), nextLabel(session, next));
}

// What a test set just told you about your max.
function testNews(session) {
  const b = block();
  const lift = liftOf(session);
  if (ui.week === FIRST_TEST) {
    const was = b.max[lift.id];
    const next = weekMax(b, lift.id, WAVE_TWO, state);
    if (next === was) return `${lift.short} max stays at ${fmt(was)} for weeks 4–8.`;
    return `${lift.short} max for weeks 4–8: ${fmt(next)}, ${next > was ? 'up' : 'down'} ${fmt(Math.abs(next - was))}.`;
  }
  const last = session.reps.length - 1;
  const estimate = Math.round(estimateMax(setWeight(b, session, ui.week, last, state), session.reps[last]));
  return `Estimated ${lift.short.toLowerCase()} max: ${estimate}. ${b.finish === 'remax' ? 'Your re-max attempts build from it.' : 'It sets your next block’s max.'}`;
}

// ---------- The keypad ----------
// Weights in sheets are typed on the app's own keys, laid out like the phone's number pad with a tall key for
// what comes next, so the phone's keyboard never comes up over a sheet. Built once into each sheet's .pad.

function buildPads() {
  const key = (k, label, cls) => `<button class="pad-key${cls ? ` ${cls}` : ''}" data-action="pad-key" data-key="${k}"${label ? ` aria-label="${label}"` : ''}>${k === 'back' ? '⌫' : k}</button>`;
  for (const pad of document.querySelectorAll('.pad')) {
    pad.innerHTML = `${['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => key(k)).join('')}
      ${key('.', 'Decimal point', 'pad-point')}${key('0')}${key('back', 'Delete', 'pad-back')}
      <button class="pad-key pad-done" data-action="pad-done">${pad.dataset.done}</button>`;
  }
  for (const load of document.querySelectorAll('.load')) {
    load.innerHTML = `
      <button class="load-value" data-action="pad-open">
        <span class="load-num" aria-live="polite"></span><span class="load-caret" aria-hidden="true"></span><span class="field-unit"></span>
      </button>
      <button class="step-key" data-action="pad-nudge" data-dir="-1"></button>
      <button class="step-key" data-action="pad-nudge" data-dir="1"></button>`;
  }
}

// Sets the keypad up for a sheet. `value` is the weight it opens with (null for none), shown as if selected:
// typing replaces it. `text` is what's been typed, kept as typed so "12." shows that way. `open` is whether
// the keys are showing: always in the weight sheet, in place of the reps in the set sheet. `step` is what
// the − and + keys move by; `plates` is for an accessory counted in plates a side, typed to a tenth (2.5 is
// 45 + 45 + 25), with the plates it makes shown under it. `guess` is an accessory not counted in plates yet,
// which typing a count can turn to plates a side.
function startPad(host, value, { step, plates = false, guess = null, open = true }) {
  ui.pad = { host, text: value === null ? '' : fmt(value), fresh: value !== null, guess, open };
  padPlates(plates, step);
}

// Turns the keypad to or from plates a side: what the number reads as, how it's typed and what − and + move by.
function padPlates(plates, step) {
  Object.assign(ui.pad, { plates, decimals: plates ? DECIMALS.plates : DECIMALS.weight, unit: loadUnit(plates), step });
}

// A number of 10 lb or less typed for an accessory not yet counted in plates turns the keypad to plates a
// side (2.5 is 45 + 45 + 25), and going over 10 turns it back. A whole number could still grow (the 1 of
// 190), so it's judged once it's `final` (Done, or the reps tapped); a point fixes the whole part, so 2.5 is
// judged as it's typed. Logging the set switches the exercise over.
function guessPlates(final = false) {
  const p = ui.pad;
  const value = padValue();
  if (!p.guess || value === null) return;
  const plates = value > PLATES_UP_TO ? false : final || p.text.includes('.') ? looksCounted(state, p.guess, value) : p.plates;
  if (plates === p.plates) return;
  padPlates(plates, plates ? GUESSED_STEP : p.guess.step);
  document.getElementById('reps-note').textContent = extraNote(p.guess, plates);
}

const padSheet = () => (ui.pad.host === 'reps' ? repsSheet : weightSheet);
const padValue = () => typed(ui.pad.text);

// Redraws the number being typed and the keys in place, so a tapped key keeps focus.
function renderPad() {
  const p = ui.pad;
  const sheet = padSheet();
  const value = padValue();
  const field = sheet.querySelector('.load-value');
  field.classList.toggle('is-live', p.open);
  field.classList.toggle('is-fresh', p.open && p.fresh && p.text !== '');
  field.setAttribute('aria-label', value === null ? 'No weight yet. Tap to type one.' : `${fmt(value)} ${p.unit}. Tap to type another.`);
  sheet.querySelector('.load-num').textContent = p.open ? p.text : value === null ? '' : fmt(value);
  sheet.querySelector('.load .field-unit').textContent = p.unit;
  for (const key of sheet.querySelectorAll('.step-key')) {
    const up = key.dataset.dir === '1';
    key.textContent = `${up ? '+' : '−'}${fmt(p.step)}`;
    key.setAttribute('aria-label', `${up ? 'Up' : 'Down'} ${fmt(p.step)}`);
    key.disabled = !up && !(value > 0);
  }
  sheet.querySelector('.pad').hidden = !p.open;
  sheet.querySelector('.pad-point').disabled = !p.decimals;
  const note = sheet.querySelector('.load-note');
  if (note) {
    note.hidden = !(p.plates && value > 0);
    note.textContent = note.hidden ? '' : `${platesText(value)} = ${fmt(countedPlates(value, state.unit).reduce((a, b) => a + b, 0))} ${state.unit} a side`;
  }
  if (p.host === 'reps') repGrid.hidden = p.open;
}

function openReps(index, set) {
  const session = sessionAt(index);
  const current = session.reps[set];
  ui.sheet = { index, set };
  ui.pad = null;
  document.getElementById('reps-weight-field').hidden = true;
  repsSheet.querySelector('.pad').hidden = true;
  repGrid.hidden = false;
  repGrid.classList.toggle('is-judging', session.kind === 'max');
  if (session.kind === 'max') {
    const weight = setWeight(block(), session, ui.week, set, state);
    document.getElementById('reps-title').textContent = `${liftOf(session).name}, ${ATTEMPT_NAMES[set].toLowerCase()}`;
    document.getElementById('reps-note').textContent = `${fmt(weight)} ${state.unit}. Mark a pass as no lift.`;
    repGrid.innerHTML = [[1, 'Good lift'], [0, 'No lift']].map(([n, text]) => `
      <button class="rep" data-action="reps-pick" data-reps="${n}" aria-pressed="${n === current}">${text}</button>`).join('');
  } else {
    const target = prescription(session.kind, ui.week).reps;
    const test = isTestSet(session, ui.week, set);
    document.getElementById('reps-title').textContent = `${liftOf(session).name}, set ${set + 1}`;
    document.getElementById('reps-note').textContent = test
      ? testNote(session)
      : `Target ${plural(target, 'rep')}. How many did you get?`;
    // Test sets can run long, so they get a wider range, marked at the fewest reps that keep the max.
    const mark = (test && testAim(session).keep) || target;
    repGrid.innerHTML = Array.from({ length: target + (test ? 11 : 6) }, (_, n) => `
      <button class="rep${n === mark ? ' is-target' : ''}" data-action="reps-pick" data-reps="${n}"
        aria-pressed="${n === current}">${n}</button>`).join('');
  }
  repsSheet.showModal();
}

// The set sheet's note for an accessory: its rep range, and how to put in the weight or the plates.
const extraNote = (e, plates) => (plates
  ? `${e.low}–${e.high} reps. Count the plates on one side: ${countRule()}. Then tap the reps you did.`
  : `${e.low}–${e.high} reps. Set the weight (0 for body weight), then tap the reps you did.`);

// An accessory set: the weight (0 for body weight) and a tap on the reps done.
function openExtra(index, id, set) {
  const session = sessionAt(index);
  const e = exerciseById(id);
  const { entry, variant, plan } = extraPlan(session, index, e);
  const current = entry?.sets[set] ?? null;
  const target = extraTarget(e, entry, plan, set);
  ui.sheet = { index, set, exercise: id };
  document.getElementById('reps-title').textContent = `${e.name}${variant ? `, ${variant}` : ''}, set ${set + 1}`;
  document.getElementById('reps-weight-field').hidden = false;
  const weight = current?.weight ?? target.weight ?? entry?.sets.filter(Boolean).pop()?.weight ?? null;
  // A count logged before the exercise was switched to plates (2.5) opens as plates a side.
  const plates = isCounted(e) || looksCounted(state, e, weight);
  document.getElementById('reps-note').textContent = extraNote(e, plates);
  // With no weight to go on, the keys come up first; otherwise the reps do, and a tap on the weight brings them up.
  startPad('reps', weight, { step: plates && !isCounted(e) ? GUESSED_STEP : e.step, plates, guess: isCounted(e) ? null : e, open: weight === null });
  repGrid.classList.remove('is-judging');
  repGrid.innerHTML = Array.from({ length: e.high + 6 }, (_, n) => `
    <button class="rep${n === target.reps ? ' is-target' : ''}" data-action="reps-pick" data-reps="${n}"
      aria-pressed="${n === current?.reps}">${n}</button>`).join('');
  renderPad();
  repsSheet.showModal();
}

// Logging on a day marks it trained. Days trained before today are over by then, so whatever accessories
// they have left are skipped, and a workout left running ends at its last set.
function markTrained(session) {
  const today = todayISO();
  session.date ??= today;
  block().lastTrained = today;
  for (const s of block().log.flat()) {
    if (s === session || !s.date || s.date >= today) continue;
    finishExtras(state, s);
    if (s.started && !s.ended) s.ended = workoutTime(s).end;
  }
}

// Starting a day ahead of today's one (a tap while looking at a later week, say) asks first. Today's day, one
// missed before it and a day already under way never ask.
function okToStart(index) {
  const session = sessionAt(index);
  if (session.date) return true;
  const b = block();
  const today = todayISO();
  const due = dueSession(b, today);
  if (!due || (due.week === ui.week && due.index === index) || isMissed(missedSessions(b, today), ui.week, index)) return true;
  return confirm(`Start ${dayName(ui.week, session)}? Today's workout is ${dayName(due.week, b.log[due.week][due.index])}.`);
}

function logExtra(index, exercise, set, value) {
  const session = sessionAt(index);
  const variant = entryOf(session, exercise.id)?.variant ?? defaultVariant(state, exercise);
  const entry = entryFor(session, exercise, variant);
  const was = entry.sets[set];
  const fresh = was === null && value !== null;
  // When the set was logged, for the day's timing. A set changed later keeps its time.
  if (fresh) value.at = nowISO();
  else if (value && was?.at) value.at = was.at;
  entry.sets[set] = value;
  // Clearing an added set at the end removes it again.
  if (value === null && set >= plannedSets(exercise, ui.week) && set === entry.sets.length - 1) entry.sets.pop();
  if (value) markTrained(session);
  save();
  if (!fresh) return;
  pulseGlow();
  const group = dayGroups(state, session).find((g) => g.includes(exercise)) ?? [exercise];
  const next = groupNext(session, index, group);
  if (!next) return rest.stop();
  // Within a superset round there's only the move to the other exercise; the full rest comes after the round.
  const seconds = next.exercise !== exercise && next.set === set ? 15 : Math.max(...group.map((e) => e.rest));
  rest.start(seconds, extraNextLabel(next));
}

// A group's next set to do, with the weight it's prefilled with, or null once every set is done or skipped. In a
// superset the sets alternate between the two; a single exercise is a group of one.
function groupNext(session, index, group) {
  const counts = group.map((e) => (entryOf(session, e.id)?.skipped ? 0 : setCount(e, entryOf(session, e.id))));
  const next = supersetOrder(counts).find(({ which, set: s }) => !entryOf(session, group[which].id)?.sets[s]);
  if (!next) return null;
  const exercise = group[next.which];
  const { plan } = extraPlan(session, index, exercise);
  const { weight } = extraTarget(exercise, entryOf(session, exercise.id), plan, next.set);
  return { exercise, set: next.set, count: counts[next.which], weight };
}

const extraNextLabel = ({ exercise: e, set, count, weight }) => `Next: ${e.name}, set ${set + 1} of ${count}${weight === null ? ''
  : `, ${loadText(e, weight)}${isCounted(e) ? ' a side' : ` ${state.unit}`}`}`;

function openPick(index) {
  const session = sessionAt(index);
  const shown = dayExtras(state, session);
  const others = state.exercises.filter((e) => !shown.includes(e));
  ui.sheet = { index };
  if (!others.length) return openEditor(null, index);
  document.getElementById('pick-note').textContent = `Adds it to this ${session.day} only. To have it every week, set its days in Settings.`;
  document.getElementById('pick-list').innerHTML = others.map((e) => `
    <button class="index-row" data-action="extra-pick" data-exercise="${e.id}">${picHTML(e)}<span class="index-text">
      <span class="index-name">${esc(e.name)}</span><span class="index-meta">${e.sets} × ${e.low}–${e.high}</span>
    </span></button>`).join('');
  pickSheet.showModal();
}

// A max from before the app: `index` is its place in state.pastMaxes, or null to add one for the lift shown.
function openPast(index) {
  const p = index === null ? null : state.pastMaxes[index];
  ui.past = index;
  const f = pastForm.elements;
  document.getElementById('past-title').textContent = p ? 'Change earlier max' : 'Add an earlier max';
  document.getElementById('past-unit').textContent = state.unit;
  document.getElementById('past-delete').hidden = !p;
  document.getElementById('past-lift').innerHTML = LIFTS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
  f.lift.value = p?.lift ?? ui.lift;
  f.value.value = p ? fmt(p.value) : '';
  f.date.value = p?.date ?? '';
  f.date.max = todayISO();
  pastSheet.showModal();
}

// `index` is the training day it was opened from, so a new exercise lands on that day.
function openEditor(id, index = null) {
  const e = id ? exerciseById(id) : null;
  const day = index === null ? null : sessionAt(index).day;
  ui.editing = { id, index };
  const f = exerciseForm.elements;
  document.getElementById('exercise-title').textContent = e ? 'Edit exercise' : 'New exercise';
  document.getElementById('exercise-unit').textContent = isCounted(e) ? 'plates' : state.unit;
  document.getElementById('exercise-delete').hidden = !e;
  f.name.value = e?.name ?? '';
  f.variants.value = e?.variants.join(', ') ?? '';
  f.sets.value = e?.sets ?? EXTRA_DEFAULTS.sets;
  f.low.value = e?.low ?? EXTRA_DEFAULTS.low;
  f.high.value = e?.high ?? EXTRA_DEFAULTS.high;
  f.step.value = fmt(e?.step ?? EXTRA_STEP[state.unit]);
  f.restSeconds.value = e?.rest ?? EXTRA_DEFAULTS.rest;
  const days = e?.days ?? (day ? [day] : []);
  document.getElementById('exercise-days').innerHTML = WEEKDAYS.map((d) => `
    <label class="day-box"><input type="checkbox" name="days" value="${d}"${days.includes(d) ? ' checked' : ''}><span>${shortDay(d)}</span></label>`).join('');
  const partner = e && (e.link ?? state.exercises.find((x) => x.link === e.id)?.id);
  document.getElementById('exercise-muscle').innerHTML = `<option value="">Not set</option>${MUSCLES
    .map((m) => `<option value="${m}"${m === e?.muscle ? ' selected' : ''}>${m}</option>`).join('')}`;
  const loadLabel = (l) => (l.bar[state.unit] ? `${l.name[0].toUpperCase()}${l.name.slice(1)}, ${fmt(l.bar[state.unit])} ${state.unit}` : 'Plate-loaded machine, by weight');
  const loads = [['', 'None: dumbbells, cables or a stack'], ...Object.entries(LOADS).map(([k, l]) => [k, loadLabel(l)]),
    ['count', `Counted in plates a side (2.5 = ${platesText(2.5)})`]];
  const load = isCounted(e) ? 'count' : e?.plates ?? '';
  document.getElementById('exercise-plates').innerHTML = loads
    .map(([k, label]) => `<option value="${k}"${k === load ? ' selected' : ''}>${label}</option>`).join('');
  document.getElementById('exercise-link').innerHTML = `<option value="">None</option>${state.exercises
    .filter((x) => x !== e)
    .map((x) => `<option value="${x.id}"${x.id === partner ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  document.getElementById('exercise-pics').innerHTML = picChoices(e?.pic ?? null, e?.name ?? '');
  pickSheet.close();
  exerciseSheet.showModal();
}

// The editor's picture choices: Auto, showing what the name gives, then every picture there is.
function picChoices(chosen, name) {
  const auto = picFor({ name });
  const option = (value, label, key, checked, id = '') => `<label class="pic-box"><input type="radio" name="pic" value="${value}"${checked ? ' checked' : ''}>
    <span><i class="pic${key ? '' : ' is-none'}"${id ? ` id="${id}"` : ''}${key ? ` style="--pic:url('${picFile(key)}')"` : ''} aria-hidden="true"></i><small>${esc(label)}</small></span></label>`;
  const known = PICS.some(([key]) => key === chosen);
  return [option('', 'Auto', auto, !known, 'pic-auto'), ...PICS.map(([key, label]) => option(key, label, key, chosen === key))].join('');
}

function openWeight(index, attempt) {
  const session = sessionAt(index);
  const lift = liftOf(session);
  const b = block();
  const target = attempt === undefined
    ? targetWeight(workingMax(weekMax(b, lift.id, ui.week, state), state), session.kind, ui.week, state.round)
    : attemptWeight(b, lift.id, attempt, state);
  const current = attempt === undefined ? session.weight : session.weights[attempt];
  ui.sheet = { index, attempt, target };
  document.getElementById('weight-title').textContent = attempt === undefined
    ? `${lift.name}, ${session.day}` : `${lift.name}, ${ATTEMPT_NAMES[attempt].toLowerCase()}`;
  document.getElementById('weight-note').textContent = attempt === undefined
    ? `Target ${fmt(target)} ${state.unit}. Change it if you loaded something different.`
    : `Suggested ${fmt(target)} ${state.unit}. Change it to the weight you'll take.`;
  document.getElementById('weight-label').textContent = 'Weight on the bar';
  weightSheet.querySelector('[data-action="weight-reset"]').hidden = false;
  startPad('weight', current ?? target, { step: state.round });
  renderPad();
  weightSheet.showModal();
}

// Today's body weight, on the same keypad, from the button on the day due.
const BODY_STEP = { lb: 1, kg: 0.5 };

function openBodyweight() {
  const latest = state.bodyweight[state.bodyweight.length - 1];
  ui.sheet = { bodyweight: true };
  document.getElementById('weight-title').textContent = 'Body weight';
  document.getElementById('weight-note').textContent = latest
    ? `Last ${fmt(latest.weight)} ${state.unit} on ${shortDate(latest.date)}. Weigh in the same way each time, like first thing in the morning.`
    : 'Weigh in the same way each time, like first thing in the morning.';
  document.getElementById('weight-label').textContent = 'Today';
  weightSheet.querySelector('[data-action="weight-reset"]').hidden = true;
  startPad('weight', latest?.weight ?? null, { step: BODY_STEP[state.unit] });
  renderPad();
  weightSheet.showModal();
}

// The target is stored as "no change" until something is logged; after that the weight is a record.
function saveWeight(value) {
  const session = sessionAt(ui.sheet.index);
  const { attempt, target } = ui.sheet;
  const logged = attempt === undefined ? session.reps.some((r) => r !== null) : session.reps[attempt] !== null;
  const weight = value ?? target;
  const kept = weight === target && !logged ? null : weight;
  if (attempt === undefined) session.weight = kept;
  else session.weights[attempt] = kept;
  save();
  weightSheet.close();
  render();
}

function saveBodyweight(weight) {
  logBodyweight(state, todayISO(), weight);
  save();
  weightSheet.close();
  render();
  toast(`Body weight logged, ${fmt(weight)} ${state.unit}.`);
}

// ---------- Backup ----------

async function backup() {
  const name = `powerlifting-wave-${todayISO()}.json`;
  const json = JSON.stringify(state, null, 2);
  // iOS opens the share sheet, where "Save to Files" keeps the backup off the phone's web storage.
  for (const type of ['application/json', 'text/plain']) {
    const file = new File([json], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (err) {
        if (err.name !== 'AbortError') toast("Couldn't open the share sheet. Try again.");
      }
      return;
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup downloaded.');
}

async function restore(file) {
  let data;
  try {
    data = upgradeAll(JSON.parse(await file.text()));
  } catch {
    data = null;
  }
  if (!data) {
    toast("That file isn't a Powerlifting Wave backup.");
    return;
  }
  const replacing = state.blocks.length ? ' This replaces everything on this phone.' : '';
  if (!confirm(`Restore ${plural(data.blocks.length, 'block')} from this backup?${replacing}`)) return;
  state = data;
  save();
  requestPersist();
  rest.setMode(state.rest);
  Object.assign(ui, { tab: 'train', reviewing: false, week: null, open: undefined });
  render();
  scrollTop();
  toast('Backup restored.');
}

// ---------- Forms ----------

// The key's expiry day typed in a connect form, or null.
const expiresField = (form) => (isDay(form.elements.expires?.value ?? '') ? form.elements.expires.value : null);

// `previous` holds the stored maxes: a field left as shown keeps its full-precision value.
function readMaxes(form, previous) {
  const max = {};
  for (const l of LIFTS) {
    const raw = form.elements[l.id].value;
    const v = tidy(parseFloat(raw));
    if (!(v > 0)) return null;
    max[l.id] = previous && raw === fmt(previous[l.id]) ? previous[l.id] : v;
  }
  return max;
}

const FORMS = {
  'setup-form'(form) {
    const max = readMaxes(form);
    if (!max) return toast('Enter a max above 0 for all three lifts.');
    state.blocks.push(newBlock(max, todayISO(), finishFor(0)));
    save();
    requestPersist();
    Object.assign(ui, { week: 0, open: undefined });
    render();
    scrollTop();
  },
  'review-form'(form) {
    const b = block();
    const suggested = Object.fromEntries(LIFTS.map((l) => [l.id, evaluateLift(b, l.id, state).suggested]));
    const max = readMaxes(form, suggested);
    if (!max) return toast('Enter a max above 0 for all three lifts.');
    b.finished = todayISO();
    state.blocks.push(newBlock(max, todayISO(), form.elements.finish.value));
    save();
    rest.stop();
    Object.assign(ui, { reviewing: false, week: 0, open: undefined });
    render();
    scrollTop();
    toast(`Block ${state.blocks.length} started.`);
  },
  async 'sync-form'(form) {
    const token = form.elements.token.value.trim();
    if (!token) return toast('Paste your GitHub access key first.');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Connecting…';
    const result = await sync.connect(token, expiresField(form));
    if (!result.ok) {
      button.disabled = false;
      button.textContent = 'Connect';
      return toast(result.message);
    }
    const saved = upgradeAll(result.remote?.state);
    const useSaved = saved && saved.blocks.length > 0 && (state.blocks.length === 0 || confirm(
      `GitHub has a saved log with ${plural(saved.blocks.length, 'block')}. Replace this phone's log with it?\n\nCancel keeps this phone's log and saves it to GitHub instead.`));
    if (useSaved) {
      // Written locally only: the log just came from GitHub, so there is nothing new to send back.
      state = saved;
      writeLocal();
      requestPersist();
      rest.setMode(state.rest);
      Object.assign(ui, { tab: 'train', reviewing: false, week: null, open: undefined });
      render();
      scrollTop();
      toast('Restored your log from GitHub.');
      return;
    }
    if (state.blocks.length) {
      sync.saveNow();
      render();
    } else {
      // On the setup screen, swap just the GitHub panel so maxes already typed in stay put.
      form.closest('.restore-github')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: syncStatusLine() }).firstElementChild);
    }
    toast('Connected to GitHub.');
  },
  // A new key for the same repository, for one about to run out; nothing about the log changes.
  async 'rekey-form'(form) {
    const token = form.elements.token.value.trim();
    if (!token) return toast('Paste your new GitHub access key first.');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Checking…';
    const result = await sync.rekey(token, expiresField(form));
    if (!result.ok) {
      button.disabled = false;
      button.textContent = 'Use this key';
      return toast(result.message);
    }
    render();
    toast(sync.keyExpires() ? `New key in use, until ${shortDate(sync.keyExpires())}.` : 'New key in use. Add the day it expires for a reminder.');
  },
  'exercise-form'(form) {
    const f = form.elements;
    const name = f.name.value.trim();
    const variants = [...new Set(f.variants.value.split(',').map((v) => v.trim()).filter(Boolean))];
    const [sets, low, high, rest] = ['sets', 'low', 'high', 'restSeconds'].map((k) => Number(f[k].value));
    const step = tidy(parseFloat(f.step.value));
    const days = [...form.querySelectorAll('input[name="days"]:checked')].map((c) => c.value);
    if (!name || name.length > 60) return toast('Give the exercise a name.');
    if (variants.length > 8 || variants.some((v) => v.length > 40)) return toast('Use up to 8 short variant names.');
    if (!Number.isInteger(sets) || sets < 1 || sets > 10) return toast('Sets must be 1 to 10.');
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 1 || high > 50 || low > high) return toast('Reps go from a lower to a higher number, up to 50.');
    if (!(step > 0) || step > 100) return toast(`Set a weight jump above 0, like ${EXTRA_STEP[state.unit]} ${state.unit}.`);
    if (!Number.isInteger(rest) || rest < 15 || rest > 900) return toast('Rest must be 15 to 900 seconds.');
    const muscle = MUSCLES.includes(f.muscle.value) ? f.muscle.value : null;
    // Counted in plates a side is its own switch; the plate math modes are mutually exclusive with it.
    const counted = f.plates.value === 'count';
    const plates = !counted && Object.hasOwn(LOADS, f.plates.value) ? f.plates.value : null;
    // A picture picked by hand stays; Auto stores nothing, so a renamed exercise follows its new name.
    const pic = PICS.some(([key]) => key === f.pic.value) ? f.pic.value : null;
    const fields = { name, variants, sets, low, high, step, rest, days, muscle, plates, counted, pic };
    const { id, index } = ui.editing;
    let e = id ? exerciseById(id) : null;
    if (e) {
      Object.assign(e, fields);
    } else {
      e = newExercise({ ...fields, link: null });
      state.exercises.push(e);
      // Opened from a training day that isn't one of its days: it still shows up on that day.
      if (index !== null && !days.includes(sessionAt(index).day)) entryFor(sessionAt(index), e, defaultVariant(state, e));
      if (index !== null) ui.extraOpen = e.id;
    }
    // A pairing that's unchanged keeps its order; a new one puts this exercise first.
    const partner = exerciseById(f.link.value) ?? null;
    const current = e.link ?? state.exercises.find((x) => x.link === e.id)?.id ?? null;
    if ((partner?.id ?? null) !== current) setLink(state, e, partner);
    // In Settings, a new exercise, or one moved to other days, opens the kind of day it's now under.
    const kinds = exercisesByDay(state);
    if (index === null && !kinds.find((k) => (k.lift ?? 'none') === ui.exerciseKind)?.exercises.includes(e)) {
      const kind = kinds.find((k) => k.exercises.includes(e));
      ui.exerciseKind = kind ? kind.lift ?? 'none' : null;
    }
    save();
    exerciseSheet.close();
    render();
    toast(id ? 'Exercise saved.' : `${name} added.`);
  },
  'bodyweight-form'(form) {
    const weight = tidy(parseFloat(form.elements.weight.value));
    if (!(weight > 0)) return toast('Enter your body weight.');
    logBodyweight(state, todayISO(), weight);
    save();
    render();
    toast('Body weight logged.');
  },
  // One max per lift per day: saving onto a day that already has one replaces it.
  'past-form'(form) {
    const f = form.elements;
    const value = tidy(parseFloat(f.value.value));
    const date = f.date.value;
    if (!(value > 0) || value >= 5000) return toast('Enter the max you lifted.');
    if (!isDay(date) || date > todayISO()) return toast('Pick the day you lifted it, on or before today.');
    const edited = ui.past === null ? null : state.pastMaxes[ui.past];
    const entry = { date, lift: f.lift.value, value };
    state.pastMaxes = [...(state.pastMaxes ?? []).filter((p) => p !== edited && !(p.date === date && p.lift === entry.lift)), entry]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    ui.lift = entry.lift;
    save();
    pastSheet.close();
    render();
    toast(edited ? 'Earlier max saved.' : 'Earlier max added.');
  },
  'max-form'(form) {
    const b = block();
    const max = readMaxes(form, b.max);
    if (!max) return toast('Enter a max above 0 for all three lifts.');
    // A day left as the block's start isn't stored, so it follows the block.
    const dates = {};
    for (const l of LIFTS) {
      const day = form.elements[`${l.id}Date`].value;
      if (day && !(isDay(day) && day <= todayISO())) return toast('Pick a day on or before today for each max.');
      if (day && day !== b.started) dates[l.id] = day;
    }
    b.max = max;
    if (Object.keys(dates).length) b.maxDates = dates;
    else delete b.maxDates;
    save();
    render();
    toast('Maxes saved.');
  },
};

// ---------- Events ----------

const ACTIONS = {
  // `data-to` names a part of the tab to scroll to. Train opens where it was left (see trainSpot); tapped while
  // it's showing, it goes to the top.
  tab(el) {
    const from = ui.tab;
    if (from === 'train' && el.dataset.tab !== 'train') markTrainSpot();
    Object.assign(ui, { tab: el.dataset.tab, reviewing: false });
    render();
    const to = el.dataset.to && document.getElementById(el.dataset.to);
    if (to) to.scrollIntoView();
    else if (ui.tab === 'train' && from !== 'train') backToTrainSpot();
    else scrollTop();
  },
  'skip-missed'() {
    const b = block();
    for (const { week, index } of missedSessions(b, todayISO())) b.log[week][index].skipped = true;
    save();
    render();
  },
  'missed-later'() {
    ui.missedLater = missedKey(missedSessions(block(), todayISO()));
    render();
  },
  'key-later'() {
    sync.remindKeyAfter(todayISO());
    render();
  },
  // A warm-up step ticked off, or back on. The first tick on the day being trained starts the workout clock, as
  // Start workout does, and the last step's tick starts the rest before the first set; a day already under way,
  // done or from an earlier day just keeps the tick.
  warmup(el) {
    rest.prime();
    const index = Number(el.dataset.index);
    const step = Number(el.dataset.step);
    const session = sessionAt(index);
    if (!session.warmups?.[step] && !session.started && !okToStart(index)) return;
    const ticks = session.warmups ?? [];
    while (ticks.length <= step) ticks.push(null);
    ticks[step] = ticks[step] ? null : nowISO();
    if (ticks.every((t) => t === null)) delete session.warmups;
    else session.warmups = ticks;
    const ahead = ticks[step] && sessionStatus(session) === 'todo' && (!session.date || session.date === todayISO());
    const starts = ahead && !session.started;
    const rests = ahead && 'last' in el.dataset;
    if (starts) {
      session.started = nowISO();
      markTrained(session);
    }
    save();
    render();
    if (rests) rest.start(warmupRest(session), nextLabel(session, 0));
    if (starts) toast('Workout started.');
  },
  feel(el) {
    const session = sessionAt(Number(el.dataset.index));
    if (session.feel === el.dataset.feel) delete session.feel;
    else session.feel = el.dataset.feel;
    save();
    render();
  },
  'feel-tm'() {
    state.trainingMax = true;
    save();
    render();
    toast('Working from a 90% training max. Switch back in Settings → Work from.');
  },
  'bodyweight-open'() {
    openBodyweight();
  },
  'update-load'() {
    location.reload();
  },
  week(el) {
    ui.week = Number(el.dataset.week);
    ui.open = defaultOpen(block(), ui.week);
    ui.extraOpen = undefined;
    render();
  },
  session(el) {
    ui.open = Number(el.dataset.index);
    ui.extraOpen = undefined;
    render();
  },
  'extra-open'(el) {
    ui.extraOpen = el.getAttribute('aria-expanded') === 'true' ? null : el.dataset.group;
    render();
  },
  // Stays on the skipped day so the skip can be undone and its accessories still logged.
  skip(el) {
    sessionAt(Number(el.dataset.index)).skipped = true;
    save();
    rest.stop();
    render();
  },
  unskip(el) {
    const i = Number(el.dataset.index);
    sessionAt(i).skipped = false;
    save();
    ui.open = i;
    render();
  },
  set(el) {
    rest.prime();
    const index = Number(el.dataset.index);
    const i = Number(el.dataset.set);
    const session = sessionAt(index);
    if (!okToStart(index)) return;
    // One tap logs a normal set at target; test sets and re-max attempts always ask.
    if (session.reps[i] === null && session.kind !== 'max' && !isTestSet(session, ui.week, i)) {
      logSet(session, i, prescription(session.kind, ui.week).reps);
      render();
    } else {
      openReps(index, i);
    }
  },
  'reps-pick'(el) {
    rest.prime();
    if (ui.sheet.exercise) {
      const weight = padValue();
      if (weight === null) {
        Object.assign(ui.pad, { open: true, fresh: false });
        renderPad();
        return toast('Enter the weight first. Use 0 for body weight.');
      }
      const e = exerciseById(ui.sheet.exercise);
      // A count typed for an exercise logged by weight (3, or 2.5) switches it to plates a side, for good.
      guessPlates(true);
      const switched = !isCounted(e) && ui.pad.plates;
      if (switched) countInPlates(e);
      logExtra(ui.sheet.index, e, ui.sheet.set, { weight, reps: Number(el.dataset.reps) });
      repsSheet.close();
      render();
      if (switched) toast(`${e.name} is now counted in plates a side: ${fmt(weight)} is ${platesText(weight)}.`);
      return;
    }
    const session = sessionAt(ui.sheet.index);
    const reps = Number(el.dataset.reps);
    // The record going in, to see whether a good re-max lift beats it. Only a re-max single can; a lift already
    // counted (judged good before) is in the record going in, so re-judging it never sets the moment off again.
    const record = session.kind === 'max' ? liftRecord(state, session.lift) : null;
    logSet(session, ui.sheet.set, reps);
    repsSheet.close();
    render();
    if (isTestSet(session, ui.week, ui.sheet.set)) toast(testNews(session));
    else if (record && reps === 1) {
      const now = liftRecord(state, session.lift);
      if (now.value > record.value) openMoment(liftOf(session), record.value, now.value);
    }
  },
  'reps-clear'() {
    if (ui.sheet.exercise) logExtra(ui.sheet.index, exerciseById(ui.sheet.exercise), ui.sheet.set, null);
    else logSet(sessionAt(ui.sheet.index), ui.sheet.set, null);
    repsSheet.close();
    render();
  },
  'sheet-close'(el) {
    el.closest('dialog').close();
  },
  'moment-close'() {
    moment.close();
  },
  weight(el) {
    openWeight(Number(el.dataset.index), el.dataset.attempt === undefined ? undefined : Number(el.dataset.attempt));
  },
  'weight-reset'() {
    saveWeight(null);
  },
  // A tap on the weight brings the keys up (in the set sheet) and selects the number, so typing starts over.
  'pad-open'() {
    Object.assign(ui.pad, { open: true, fresh: ui.pad.text !== '' });
    renderPad();
  },
  'pad-key'(el) {
    ui.pad.text = press(ui.pad.text, el.dataset.key, ui.pad);
    ui.pad.fresh = false;
    guessPlates();
    renderPad();
  },
  // A step gives a whole number again, so typing after it starts over rather than adding digits to it.
  'pad-nudge'(el) {
    Object.assign(ui.pad, { text: fmt(nudge(padValue(), ui.pad.step, Number(el.dataset.dir))), fresh: true });
    renderPad();
  },
  // Done typing: the bar weight is saved, an accessory's weight is kept and the reps come back.
  'pad-done'() {
    const v = padValue();
    if (ui.pad.host === 'weight') {
      // Checked after rounding: a weight that rounds to 0 would make the saved log fail its check on the next load.
      if (!(v > 0)) return toast('Enter a weight above 0.');
      if (ui.sheet.bodyweight) return saveBodyweight(v);
      return saveWeight(v);
    }
    if (v === null) return toast('Enter the weight first. Use 0 for body weight.');
    Object.assign(ui.pad, { text: fmt(v), fresh: true, open: false });
    guessPlates(true);
    renderPad();
  },
  // One tap logs an accessory set as planned once its weight is known; otherwise it asks.
  'extra-set'(el) {
    rest.prime();
    const index = Number(el.dataset.index);
    const set = Number(el.dataset.set);
    const e = exerciseById(el.dataset.exercise);
    if (!okToStart(index)) return;
    const { entry, plan } = extraPlan(sessionAt(index), index, e);
    const target = extraTarget(e, entry, plan, set);
    if (!entry?.sets[set] && target.weight !== null) {
      logExtra(index, e, set, { weight: target.weight, reps: target.reps });
      render();
    } else {
      openExtra(index, e.id, set);
    }
  },
  'extra-set-add'(el) {
    const session = sessionAt(Number(el.dataset.index));
    const e = exerciseById(el.dataset.exercise);
    const entry = entryFor(session, e, entryOf(session, e.id)?.variant ?? defaultVariant(state, e));
    entry.sets.push(null);
    save();
    render();
  },
  // Takes off the last set not done yet; when every set is logged, the last one, after asking.
  'extra-set-remove'(el) {
    const session = sessionAt(Number(el.dataset.index));
    const e = exerciseById(el.dataset.exercise);
    const entry = entryFor(session, e, entryOf(session, e.id)?.variant ?? defaultVariant(state, e));
    const open = entry.sets.lastIndexOf(null);
    if (open === -1) {
      const last = entry.sets[entry.sets.length - 1];
      if (!confirm(`Remove set ${entry.sets.length}, ${loadText(e, last.weight)} × ${last.reps}?`)) return;
    }
    entry.sets.splice(open === -1 ? entry.sets.length - 1 : open, 1);
    save();
    render();
  },
  'extra-finish'(el) {
    const i = Number(el.dataset.index);
    const left = unfinished(sessionAt(i));
    finishExtras(state, sessionAt(i));
    ui.extraOpen = null;
    save();
    rest.stop();
    render();
    const short = shortWeekText(i, left);
    if (short) toast(`Skipped the rest.${short}`);
  },
  // Starting dates the day (and closes earlier ones) the same as logging a set does.
  'workout-start'(el) {
    if (!okToStart(Number(el.dataset.index))) return;
    const session = sessionAt(Number(el.dataset.index));
    session.started = nowISO();
    markTrained(session);
    save();
    render();
  },
  'workout-end'(el) {
    const i = Number(el.dataset.index);
    const session = sessionAt(i);
    const open = unfinished(session);
    session.ended = nowISO();
    const left = finishExtras(state, session);
    ui.extraOpen = null;
    save();
    rest.stop();
    render();
    toast(`Workout ended, ${spanText(workoutTime(session).total)}.${left ? ` ${plural(left, 'accessory')} not finished ${left === 1 ? 'was' : 'were'} skipped.${shortWeekText(i, open)}` : ''}`);
  },
  // The workout pane: Train, on the day under way, at what's next (the accessory opened), or at End once it's all done.
  'workout-open'() {
    const live = liveDay();
    if (!live) return;
    const status = dayStatus(live);
    if (ui.week !== live.week || ui.open !== live.index) ui.extraOpen = undefined;
    Object.assign(ui, { tab: 'train', reviewing: false, week: live.week, open: live.index });
    if (status.group) ui.extraOpen = status.group;
    render();
    const to = view.querySelector(status.next === null ? `[data-key="workout-end-${live.index}"]`
      : status.group ? '.extra.is-open' : '.attempts, .sets');
    if (to) to.scrollIntoView({ block: 'center' });
    else scrollTop();
  },
  // End on the workout pane, once every set is done or skipped: the day's End workout, from any tab.
  'workout-finish'() {
    const live = liveDay();
    if (!live) return;
    Object.assign(ui, { week: live.week, open: live.index });
    ACTIONS['workout-end']({ dataset: { index: live.index } });
  },
  'workout-reopen'(el) {
    delete sessionAt(Number(el.dataset.index)).ended;
    save();
    render();
    toast('Reopened. Anything skipped stays skipped until you undo it.');
  },
  // A day started by mistake goes back to untouched: its sets, warm-ups, accessories, times and skip.
  'day-clear'(el) {
    const i = Number(el.dataset.index);
    const name = dayName(ui.week, sessionAt(i));
    if (!confirm(`Clear ${name}? Its sets, warm-ups, accessories and times are erased.`)) return;
    const live = liveDay();
    if (live?.week === ui.week && live.index === i) rest.stop();
    clearDay(block(), ui.week, i);
    ui.extraOpen = undefined;
    save();
    render();
    toast(`Cleared ${name}.`);
  },
  // A skip that leaves the muscle's week short says so (the line on the row said it first); Undo is on the row.
  'extra-skip'(el) {
    const i = Number(el.dataset.index);
    const session = sessionAt(i);
    const e = exerciseById(el.dataset.exercise);
    const concern = concernFor(session, i, e);
    entryFor(session, e, defaultVariant(state, e)).skipped = true;
    save();
    render();
    if (concern) toast(`${e.name} skipped. ${concernText(concern)}`);
  },
  // From the day's summary: an exercise skipped time after time comes off this kind of day. Its log stays.
  'extra-drop'(el) {
    const e = exerciseById(el.dataset.exercise);
    const kind = DAY_KINDS.find((k) => k.days.includes(sessionAt(Number(el.dataset.index)).day));
    e.days = e.days.filter((d) => !kind.days.includes(d));
    save();
    render();
    toast(`${e.name} is off ${kindName(kind).toLowerCase()}. Add it back in Settings → Accessories.`);
  },
  'extra-unskip'(el) {
    entryOf(sessionAt(Number(el.dataset.index)), el.dataset.exercise).skipped = false;
    save();
    render();
  },
  'extra-variant'(el) {
    const session = sessionAt(Number(el.dataset.index));
    const e = exerciseById(el.dataset.exercise);
    const current = entryOf(session, e.id)?.variant ?? defaultVariant(state, e);
    const entry = entryFor(session, e, current);
    entry.variant = e.variants[(e.variants.indexOf(current) + 1) % e.variants.length];
    save();
    render();
  },
  'extra-add'(el) {
    openPick(Number(el.dataset.index));
  },
  'extra-pick'(el) {
    const session = sessionAt(ui.sheet.index);
    const e = exerciseById(el.dataset.exercise);
    entryFor(session, e, defaultVariant(state, e));
    ui.extraOpen = e.id;
    save();
    pickSheet.close();
    render();
  },
  'exercise-new'() {
    openEditor(null, pickSheet.open ? ui.sheet.index : null);
  },
  'exercise-edit'(el) {
    openEditor(el.dataset.exercise);
  },
  'exercise-kind'(el) {
    ui.exerciseKind = el.getAttribute('aria-expanded') === 'true' ? null : el.dataset.kind;
    render();
  },
  'exercise-move'(el) {
    const e = exerciseById(el.dataset.exercise);
    const kind = exercisesByDay(state).find((k) => (k.lift ?? 'none') === el.dataset.kind);
    if (!e || !kind || !moveExercise(state, e, Number(el.dataset.by), kind.exercises)) return;
    save();
    render();
  },
  'exercise-delete'() {
    const e = exerciseById(ui.editing.id);
    if (!confirm(`Delete ${e.name}? It comes off your days and out of History. Sets already logged stay in your saved log.`)) return;
    setLink(state, e, null);
    state.exercises = state.exercises.filter((x) => x !== e);
    save();
    exerciseSheet.close();
    render();
  },
  'muscle-week'(el) {
    ui.muscleWeek = Math.max(0, Math.min(currentWeek(block()), (ui.muscleWeek ?? currentWeek(block())) + Number(el.dataset.by)));
    render();
  },
  'past-new'() {
    openPast(null);
  },
  'past-edit'(el) {
    openPast(Number(el.dataset.past));
  },
  'past-delete'() {
    const p = state.pastMaxes[ui.past];
    if (!confirm(`Delete your ${shortDate(p.date)} ${LIFTS.find((l) => l.id === p.lift).short.toLowerCase()} max of ${fmt(p.value)}?`)) return;
    state.pastMaxes = state.pastMaxes.filter((x) => x !== p);
    save();
    pastSheet.close();
    render();
  },
  // From the Accessories list, or from Stats with the variant to show.
  'exercise-open'(el) {
    Object.assign(ui, { history: 'extras', exercise: el.dataset.exercise, variant: el.dataset.variant ?? null });
    render();
    scrollTop();
  },
  'history-view'(el) {
    Object.assign(ui, { history: el.dataset.view, exercise: null });
    render();
    scrollTop();
  },
  'week-hide'(el) {
    try {
      localStorage.setItem(WEEK_HIDDEN, weekId(block(), Number(el.dataset.week)));
    } catch {
      // Without storage the card stays until something in the new week is done.
    }
    render();
  },
  'week-muscles'(el) {
    markTrainSpot();
    Object.assign(ui, { tab: 'history', history: 'muscles', muscleWeek: Number(el.dataset.week), exercise: null });
    render();
    scrollTop();
  },
  'exercise-close'() {
    ui.exercise = null;
    render();
  },
  'switch-finish'() {
    const b = block();
    const to = b.finish === 'remax' ? 'deload' : 'remax';
    if (!setFinish(b, to)) return toast("You've already logged part of week 8, so it stays as it is.");
    save();
    ui.open = undefined;
    render();
    toast(to === 'remax' ? 'Week 8 is now a re-max.' : 'Week 8 is now a deload.');
  },
  'repeat-week'(el) {
    const w = Number(el.dataset.week);
    resetWeek(block(), w);
    save();
    Object.assign(ui, { week: w, open: undefined });
    render();
    scrollTop();
  },
  'restart-block'() {
    if (!confirm("Clear this block's logged sets and start again at week 1? Your maxes stay the same.")) return;
    restartBlock(block());
    save();
    rest.stop();
    Object.assign(ui, { week: 0, open: undefined });
    render();
    scrollTop();
  },
  'keep-going'() {
    block().breakSeen = block().lastTrained;
    save();
    render();
  },
  review() {
    ui.reviewing = true;
    render();
    scrollTop();
  },
  'review-back'() {
    ui.reviewing = false;
    render();
  },
  'rest-add'(el) {
    rest.add(Number(el.dataset.seconds));
  },
  'rest-stop'() {
    rest.stop();
  },
  backup() {
    backup();
  },
  restore() {
    restoreInput.value = '';
    restoreInput.click();
  },
  'sync-now'() {
    sync.saveNow();
  },
  async 'sync-load'() {
    const result = await sync.fetchSaved();
    if (!result.ok) return toast(result.message);
    const saved = upgradeAll(result.state);
    if (!saved || !saved.blocks.length) return toast("The copy on GitHub isn't a log this app can read.");
    const what = `${plural(saved.blocks.length, 'block')} and ${plural(saved.exercises.length, 'accessory exercise')}`;
    if (!confirm(`Replace this phone's log with the copy on GitHub (${what})?`)) return;
    // Written locally only: it just came from GitHub, so there is nothing new to send back.
    state = saved;
    writeLocal();
    rest.setMode(state.rest);
    Object.assign(ui, { tab: 'train', reviewing: false, week: null, open: undefined, exercise: null });
    render();
    scrollTop();
    toast('Loaded your log from GitHub.');
  },
  'sync-disconnect'() {
    sync.disconnect();
    render();
    toast('Disconnected. Your log stays on this phone and on GitHub.');
  },
  erase() {
    if (!confirm("Erase every block on this phone? This can't be undone.")) return;
    state = { ...emptyState(state.unit), round: state.round, trainingMax: state.trainingMax, rest: state.rest };
    // Disconnect first so the empty log never overwrites the copy on GitHub.
    sync.disconnect();
    writeLocal();
    rest.stop();
    Object.assign(ui, { tab: 'train', reviewing: false, week: null, open: undefined });
    render();
    scrollTop();
  },
};

document.addEventListener('click', (e) => {
  // A tap on the dimmed backdrop lands on the dialog element itself.
  if (e.target instanceof HTMLDialogElement) {
    e.target.close();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (el) ACTIONS[el.dataset.action]?.(el);
});

document.addEventListener('submit', (e) => {
  const handler = FORMS[e.target.id];
  if (!handler) return;
  e.preventDefault();
  handler(e.target);
});

document.addEventListener('change', (e) => {
  // Only the app's own settings controls; fields in sheets and forms are read when they're submitted.
  if (e.target.closest('dialog, #exercise-form, #past-form, #bodyweight-form, #review-form, .max-form, .sync-form')) return;
  const { name, value } = e.target;
  if (name === 'unit') {
    if (state.blocks.length === 0) {
      // On the setup screen, swap labels in place so typed maxes aren't lost. There's no log to send to GitHub yet.
      Object.assign(state, { unit: value, round: ROUNDING[value][0] });
      for (const u of view.querySelectorAll('.field-unit')) u.textContent = value;
      writeLocal();
    } else {
      state = convertState(state, value);
      save();
      render();
      toast(`Switched to ${value === 'kg' ? 'kilograms' : 'pounds'}.`);
    }
  } else if (name === 'round') {
    state.round = Number(value);
    save();
    render();
  } else if (name === 'trainingMax') {
    state.trainingMax = value === 'true';
    save();
    render();
  } else if (name === 'rest' && REST_MODES.includes(value)) {
    state.rest = value;
    rest.setMode(value);
    save();
  } else if (name === 'plate') {
    const owned = [...view.querySelectorAll('input[name="plate"]:checked')].map((c) => Number(c.value));
    if (!owned.length) {
      e.target.checked = true;
      return toast('Keep at least one plate size.');
    }
    if (owned.length === PLATES[state.unit].length) delete state.platesOwned;
    else state.platesOwned = owned;
    save();
  } else if (name === 'keyExpires') {
    sync.setKeyExpires(isDay(value) ? value : null);
    toast(isDay(value) ? `Saved. Train reminds you from ${shortDate(addDays(value, -KEY_WARN_DAYS))}.` : 'Expiry date cleared.');
  } else if (name === 'dots' && Object.hasOwn(DOTS, value)) {
    state.dots = value;
    save();
    render();
  } else if (name === 'lift') {
    ui.lift = value;
    render();
  } else if (name === 'historyView') {
    Object.assign(ui, { history: value, exercise: null });
    render();
  } else if (name === 'variant') {
    ui.variant = value || null;
    render();
  }
});

document.addEventListener('pointerdown', chartPointer);
document.addEventListener('pointermove', (e) => {
  // A finger drags the crosshair; a mouse only needs to hover.
  if (e.pointerType === 'mouse' || e.buttons) chartPointer(e);
});

document.addEventListener('keydown', (e) => {
  const figure = e.target.closest?.('.chart');
  if (!figure) return;
  if (e.key === 'Escape') return hideTip(figure);
  const n = chartData[figure.dataset.chart].length;
  const at = figure.dataset.index === undefined ? latestIndex(figure.dataset.chart) : Number(figure.dataset.index);
  const moves = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  showTip(figure, Math.min(n - 1, Math.max(0, moves[e.key])));
});

// Focus from the keyboard shows the latest week; a tap already placed the crosshair before focus lands.
document.addEventListener('focusin', (e) => {
  if (e.target.matches?.('.chart') && e.target.dataset.index === undefined) showTip(e.target, latestIndex(e.target.dataset.chart));
});

let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  if (ui.tab === 'history' && state.blocks.length) render();
});

// A hardware keyboard types on the keypad too, while it's up.
document.addEventListener('keydown', (e) => {
  if (!ui.pad?.open || !padSheet().open || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key === 'Backspace' ? 'back' : e.key;
  if (key !== 'Enter' && key !== 'back' && !/^[0-9.]$/.test(key)) return;
  // Without this, the same Enter also presses the button that gets focus back after the sheet closes.
  e.preventDefault();
  if (key === 'Enter') ACTIONS['pad-done']();
  else ACTIONS['pad-key']({ dataset: { key } });
});

// The Auto picture follows the name as it's typed.
exerciseForm.elements.name.addEventListener('input', (e) => {
  const auto = picFor({ name: e.target.value });
  const el = document.getElementById('pic-auto');
  if (!el) return;
  el.className = `pic${auto ? '' : ' is-none'}`;
  el.style.setProperty('--pic', auto ? `url('${picFile(auto)}')` : 'none');
});

// Switching an exercise to or from plates a side changes what its weight jump is counted in.
exerciseForm.elements.plates.addEventListener('change', (e) => {
  const counted = e.target.value === 'count';
  document.getElementById('exercise-unit').textContent = counted ? 'plates' : state.unit;
  exerciseForm.elements.step.value = fmt(counted ? 1 : EXTRA_STEP[state.unit]);
});

setInterval(tickElapsed, 30000);

// The day the page was drawn for. Back on screen on a later day (iOS can keep the app in memory overnight), it goes
// back to Train on the day due, unless a sheet is open.
let shownDay = todayISO();
function newDay() {
  if (todayISO() === shownDay) return;
  shownDay = todayISO();
  if (!state.blocks.length || document.querySelector('dialog[open]')) return;
  Object.assign(ui, { tab: 'train', reviewing: false, week: null, open: undefined, extraOpen: undefined, missedLater: null });
  render();
  scrollTop();
}

// A new version: the service worker downloads it in the background and takes over once it has it all. The page
// still runs the old code until it's loaded again, which happens the next time the app comes back on screen with
// no sheet open and no rest running, or at once from Settings.
async function checkUpdate() {
  const n = (k) => Number(k.slice('wave-v'.length));
  let newest;
  try {
    newest = (await caches.keys()).filter((k) => /^wave-v\d+$/.test(k)).sort((a, b) => n(b) - n(a))[0];
  } catch {
    return;
  }
  if (!newest || n(newest) <= n(VERSION) || newest === update) return;
  update = newest;
  document.getElementById('version')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: versionLine() }).firstElementChild);
  toast(`Version ${n(newest)} is ready. It loads next time you come back to the app.`);
}

let worker = null;
let lastCheck = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (update && !document.querySelector('dialog[open]') && !rest.running()) {
    location.reload();
    return;
  }
  // iOS only looks for a new version when the app is opened fresh, so ask each time it's back (at most once a minute).
  if (worker && Date.now() - lastCheck > 60000) {
    lastCheck = Date.now();
    worker.update().catch(() => {});
  }
  tickElapsed();
  paintWorkout();
  newDay();
});

restoreInput.addEventListener('change', () => {
  const file = restoreInput.files[0];
  if (file) restore(file);
});

buildPads();
render();
if (state.blocks.length) requestPersist();
rest.setMode(state.rest);
rest.resume();

// Warns once per rejected key; a successful save or reconnect re-arms the warning.
let keyWarned = false;
// Takes on a log saved from somewhere else; only redraws when it actually differs.
function adopt(next, message) {
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  writeLocal();
  rest.setMode(state.rest);
  render();
  if (message) toast(message);
}

sync.init({
  getState: () => state,
  onRemote(remoteState) {
    const next = upgradeAll(remoteState);
    if (next) adopt(next, 'Loaded changes saved on GitHub.');
  },
  // Both sides changed: the copies are brought to this phone's units, then merged part by part.
  merge(remoteState) {
    let remote = upgradeAll(remoteState);
    if (!remote) return state;
    if (remote.unit !== state.unit) remote = convertState(remote, state.unit);
    let base = upgradeAll(sync.getBase());
    if (base && base.unit !== state.unit) base = convertState(base, state.unit);
    adopt(mergeLogs(base, state, remote));
    return state;
  },
  // Updates the status line in place so a finished save never wipes what's being typed in Settings.
  onStatus(status) {
    const line = document.getElementById('sync-status');
    if (line) {
      line.dataset.state = status;
      line.textContent = syncStatusText(status);
    }
    if (status === 'bad-key' && !keyWarned) {
      keyWarned = true;
      toast('GitHub rejected the access key. Open Settings to fix it.');
    }
    if (status === 'synced' || status === 'off') keyWarned = false;
  },
});

if ('serviceWorker' in navigator) {
  // The first worker taking over isn't an update; a later one is.
  const hadWorker = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) checkUpdate(); });
  navigator.serviceWorker.register('sw.js').then((reg) => { worker = reg; }).catch(() => {});
}
