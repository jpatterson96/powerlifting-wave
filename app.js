import {
  LIFTS, WEEKS, BLOCK_WEEKS, WAVE_TWO, FIRST_TEST, FINISH_WEEK, ATTEMPTS, ATTEMPT_NAMES, REMAX_RAMP, BUMPS, isTestSet,
  prescription, ROUNDING, REST_MODES, BAR, tidy, roundTo, workingMax, targetWeight, estimateMax, weekMax, attemptBase, attemptWeight, setWeight,
  singleWeight, restSeconds, platesPerSide, warmups, emptyState, newBlock, finishFor, setFinish, sessionStatus,
  weekProgress, nextSession, currentWeek, weekToRepeat, resetWeek, longBreak, restartBlock, evaluateLift, liftHistory,
  maxChanges, liftRecord, totalHistory, convertState, upgrade,
} from './logic.js';
import {
  WEEKDAYS, EXTRA_DEFAULTS, EXTRA_STEP, MUSCLES, LIFT_MUSCLE, LOADS, PLATE, isCounted, loadOf, isLightWeek, plannedSets, newExercise,
  dayExtras, dayGroups, setLink, supersetOrder, entryOf, ensureEntry, finishExtras, exerciseHistory, lastTime, isNewBest, defaultVariant,
  suggestion, sessionBest, records, muscleSets, workoutTime, timedSessions, logBodyweight, cleanExtras,
} from './extras.js';
import { mergeLogs } from './merge.js';
import { press, typed, nudge } from './pad.js';
import { PICS, picFor, picFile } from './pics.js';
import * as sync from './sync.js';
import * as rest from './rest.js';
import { maxChart, volumeChart, progressChart } from './charts.js';

const KEY = 'powerlifting-wave';
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

let state = load();
// `open` is the index of the expanded day in the shown week; undefined means "pick the next day to train".
// `history` is the History tab's section; `exercise` an accessory opened there; `editing` the exercise in the editor;
// `past` the earlier max being changed, by its place in state.pastMaxes (null for a new one).
const ui = {
  tab: 'train', reviewing: false, week: null, open: undefined, sheet: null, lift: 'squat',
  history: 'lifts', exercise: null, variant: null, editing: null, past: null, muscleWeek: null,
  // The accessory (or superset) opened on the shown day, by its first exercise's id; undefined picks one under way.
  extraOpen: undefined,
  // The weight being typed on the app's keypad in a sheet; see startPad.
  pad: null,
};
// The numbers behind each History chart, by its data-chart name, for the tooltips.
const chartData = {};

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
const loadUnit = (e) => (isCounted(e) ? 'plates a side' : state.unit);
// An estimated max in the exercise's own terms: a whole weight, or plates to a tenth.
const estText = (e, v) => (isCounted(e) ? `${fmt(Math.round(v * 10) / 10)} plates` : fmt(Math.round(v)));
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

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

// ---------- Views ----------

function render() {
  const focusKey = document.activeElement?.dataset?.key;
  const hasBlock = state.blocks.length > 0;
  tabs.hidden = !hasBlock;
  if (!hasBlock) {
    view.innerHTML = setupView();
  } else {
    for (const t of tabs.querySelectorAll('.tab')) {
      t.setAttribute('aria-current', t.dataset.tab === ui.tab ? 'page' : 'false');
    }
    if (ui.tab === 'history') view.innerHTML = historyView();
    else if (ui.tab === 'prs') view.innerHTML = prsView();
    else if (ui.tab === 'settings') view.innerHTML = settingsView();
    else view.innerHTML = ui.reviewing ? reviewView() : trainView();
  }
  if (focusKey) view.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
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

function syncForm() {
  return `<form class="sync-form" id="sync-form" novalidate>
    <label class="field">
      <span class="field-label">Access key</span>
      <span class="field-row">
        <input class="text-input" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_">
      </span>
    </label>
    <button class="btn" type="submit">Connect</button>
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
  return `<section class="setting">
    <h2 class="setting-title">Save to GitHub</h2>
    ${syncStatusLine()}
    <p class="hint">GitHub keeps every saved version, so an older log can always be recovered. Load from GitHub brings in changes made somewhere else, replacing this phone's log.</p>
    <div class="button-row">
      <button class="btn" data-action="sync-now">Save now</button>
      <button class="btn-quiet" data-action="sync-load">Load from GitHub</button>
      <button class="btn-quiet" data-action="sync-disconnect">Disconnect</button>
    </div>
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

// Opens the next day to train if it's in this week, otherwise the week's first unfinished day.
function defaultOpen(b, week) {
  const next = nextSession(b);
  if (next?.week === week) return next.index;
  const index = b.log[week].findIndex((s) => ['todo', 'started'].includes(sessionStatus(s)));
  return index === -1 ? null : index;
}

// Guidance for missed training: restart after a long break, repeat a mostly skipped week.
function notice(b) {
  const days = longBreak(b, todayISO());
  if (days) {
    return `<aside class="notice">
      <p>It's been ${days} days since you last trained. After two weeks or more off, restart the block at week 1 rather than picking up where you left off.</p>
      <div class="button-row">
        <button class="btn" data-action="restart-block">Restart at week 1</button>
        <button class="btn-quiet" data-action="keep-going">Keep going</button>
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

function trainView() {
  const b = block();
  const n = state.blocks.length;
  if (ui.week === null || ui.week >= b.log.length) ui.week = currentWeek(b);
  // One day shows at a time: the one picked, else the next to train, else the week's first.
  if (ui.open === undefined || ui.open === null || ui.open >= b.log[ui.week].length) ui.open = defaultOpen(b, ui.week) ?? 0;
  const next = nextSession(b);
  const last = ui.week === b.log.length - 1;
  const finish = ui.week === FINISH_WEEK
    ? `<button class="btn-quiet" data-action="switch-finish">${b.finish === 'remax' ? 'Deload this week instead' : 'Re-max this week instead'}</button>`
    : '';
  const session = b.log[ui.week][ui.open];
  return `<header class="top">
      <h1 class="display">Block ${n}</h1>
      <p class="top-meta">Started ${shortDate(b.started)}</p>
    </header>
    ${notice(b)}
    ${waveNav(b)}
    <p class="week-line"><span class="week-count">Week ${ui.week + 1} of ${BLOCK_WEEKS}</span> <span class="week-title">${weekName(b, ui.week)}</span></p>
    ${dayTabs(b, next)}
    ${dayPanel(b, session, ui.open, next?.week === ui.week && next.index === ui.open)}
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

// The week's days as tabs, each with a light: white when done, a ring when started, a dash when skipped.
function dayTabs(b, next) {
  const days = b.log[ui.week];
  return `<nav class="days" aria-label="Days" style="--n:${days.length}">${days.map((s, i) => {
    const status = sessionStatus(s);
    const isNext = next?.week === ui.week && next.index === i;
    const said = { done: 'done', skipped: 'skipped', started: 'started', todo: isNext ? 'up next' : 'not started' }[status];
    return `<button class="day-tab" data-action="session" data-index="${i}" data-key="day-${i}" data-status="${status}"${isNext ? ' data-next' : ''}
        aria-pressed="${ui.open === i}" aria-label="${s.day}, ${liftOf(s).name}, ${said}">
      <span class="day-tab-day">${s.day.slice(0, 3)}</span>
      <span class="day-tab-lift">${liftOf(s).short}</span>
      <span class="day-tab-light" aria-hidden="true"></span>
    </button>`;
  }).join('')}</nav>`;
}

function dayPanel(b, session, i, isNext) {
  const status = sessionStatus(session);
  const logged = session.reps.filter((r) => r !== null).length;
  const what = session.kind === 'max' ? 'attempt' : 'set';
  const label = {
    skipped: 'Skipped',
    done: 'Done',
    started: `${logged} of ${plural(session.reps.length, what)}`,
    todo: isNext ? 'Up next' : '',
  }[status];
  const tag = session.kind === 'max' ? ', re-max' : isHeavyDay(session) ? ', heavy day' : '';
  return `<section class="day-panel" data-status="${status}" aria-label="${session.day}">
    <div class="day-head">
      <span class="session-day">${session.day}${tag}</span>
      <h2 class="session-lift">${liftOf(session).name}</h2>
      <span class="session-state">${label}</span>
    </div>
    ${dayTiming(session, i)}
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

// Keeps the running time on a started day current without redrawing the page.
function tickElapsed() {
  for (const el of view.querySelectorAll('.day-elapsed')) el.textContent = spanText(Date.now() - Date.parse(el.dataset.start));
}

const skipButton = (session, i) => (sessionStatus(session) === 'done' ? ''
  : `<button class="btn-quiet skip" data-action="skip" data-index="${i}" data-key="skip-${i}">Skip this day</button>`);

function sessionBody(b, session, i) {
  if (session.skipped) {
    return `<div class="session-body">
      <p class="hint">You skipped this day's ${liftOf(session).name.toLowerCase()}. It doesn't count toward your next max.</p>
      <button class="btn-quiet" data-action="unskip" data-index="${i}" data-key="unskip-${i}">Undo skip</button>
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
  const ramp = warmups(work, single ?? shown, state.unit, state.round).map((s) => `, ${fmt(s.weight)} × ${s.reps}`).join('');
  const moved = max - b.max[lift.id];
  const tested = moved && ui.week >= WAVE_TWO ? maxSince(maxChanges(state, lift.id), state.blocks.length - 1, ui.week).date : null;
  const movedNote = moved && ui.week >= WAVE_TWO
    ? `<p class="hint">${moved > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(moved))} from ${fmt(b.max[lift.id])} after your week 3 test set${tested ? ` on ${shortDate(tested)}` : ''}.</p>` : '';
  return `<div class="session-body">
    <p class="lift-scheme">${p.sets} × ${p.reps} at ${tidy(p.pct * 100)}% of ${fmt(work)}${state.trainingMax ? ' (training max)' : ''}. Rest ${restText(restSeconds(session, ui.week, 1))} between sets.</p>
    ${movedNote}
    <button class="lift-weight" data-action="weight" data-index="${i}" data-key="weight-${i}"
        aria-label="${lift.name}, ${fmt(shown)} ${state.unit}. Change weight">
      <span class="lift-num">${fmt(shown)}</span><span class="lift-unit">${state.unit}</span>
    </button>
    ${session.weight !== null && session.weight !== target ? `<p class="lift-target">Target is ${fmt(target)}</p>` : ''}
    ${barbell(shown)}
    <p class="warmup">Warm-up: empty bar × 5–10${ramp}</p>
    ${single ? `<p class="warmup">Then one heavy single: ${fmt(single)} × 1 at ${tidy(p.single * 100)}%. Rest 3 minutes before your sets.</p>` : ''}
    ${isHeavyDay(session) ? '<p class="hint">Heavy day: stop each set with 2–4 reps left in the tank.</p>' : ''}
    <div class="sets" role="group" aria-label="${lift.name} sets">
      ${session.reps.map((r, s) => setLight(session, i, s, r)).join('')}
    </div>
    ${skipButton(session, i)}
    ${extrasSection(session, i)}
  </div>`;
}

// Where a training day sits in the log, for finding the last time an accessory was done before it.
const here = (index) => [state.blocks.length - 1, ui.week, index];

function extraPlan(session, index, exercise) {
  const entry = entryOf(session, exercise.id);
  const variant = entry?.variant ?? defaultVariant(state, exercise);
  const last = lastTime(state, exercise.id, variant, here(index), true);
  return { entry, variant, last, plan: suggestion(exercise, last, ui.week) };
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
function openGroup(session, groups) {
  if (ui.extraOpen !== undefined) return ui.extraOpen;
  return groups.find((g) => g.some((e) => isUnderway(entryOf(session, e.id))))?.[0].id ?? null;
}

// Today's sets once anything is recorded, so sets added or removed today stick; else the week's planned number.
const setCount = (e, entry) => entry?.sets.length ?? plannedSets(e, ui.week);

// One exercise's line in the list: name, a light per set, and either today's sets or last time's.
function rowLine(session, i, e) {
  const { entry, variant, last } = extraPlan(session, i, e);
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
    heading = toggle(rowLine(session, i, group[0]), key);
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
  if (isCounted(e)) return `${loadText(e, weight)} a side is ${fmt(loadOf(e, weight, state.unit))} ${state.unit} in all, counting each plate as ${PLATE[state.unit]}.`;
  const load = LOADS[e.plates];
  const bar = load.bar[state.unit];
  if (weight < bar) return `${fmt(weight)} is lighter than the empty ${load.name}.`;
  const plates = platesPerSide(weight, state.unit, bar);
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
    const top = sessionBest(x.sets);
    return `${esc(x.e.name)}${x.entry.variant ? ` (${esc(x.entry.variant)})` : ''}, ${top.kind === 'reps' ? plural(top.value, 'rep') : `est. max ${estText(x.e, top.value)}`}`;
  });
  return `<section class="day-summary" aria-label="Workout summary">
    <h3 class="summary-title">Workout done${session.date ? `, ${shortDate(session.date)}` : ''}</h3>
    <dl class="summary-list">
      <div><dt>${lift.name}</dt><dd>${lifted}</dd></div>
      ${extras.length ? `<div><dt>Accessories</dt><dd>${done.length} done${skipped ? `, ${skipped} skipped` : ''}</dd></div>` : ''}
      <div><dt>Volume</dt><dd>${Math.round(volume).toLocaleString()} ${state.unit}</dd></div>
      ${bests.length ? `<div><dt>New bests</dt><dd>${bests.join('<br>')}</dd></div>` : ''}
      ${session.started ? timeSummary(session) : ''}
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
      : plan.up ? `${range}. Last time ${setsText(last.sets, e)}: every set at the top, so go up to ${loadText(e, plan.weights[0])}.`
        : `${range}. Last time ${setsText(last.sets, e)}: same ${isCounted(e) ? 'plates' : 'weight'}, one more rep a set.`;
  const next = Array.from({ length: count }, (_, k) => k).find((k) => !entry?.sets[k]);
  const plates = e.plates && next !== undefined ? plateNote(e, extraTarget(e, entry, plan, next).weight) : '';
  const chip = e.variants.length > 1
    ? `<button class="chip" data-action="extra-variant" ${ids} data-key="extra-variant-${i}-${e.id}" aria-label="${esc(e.name)} variant: ${esc(variant)}. Change">${esc(variant)}</button>`
    : e.variants.length ? `<span class="chip is-static">${esc(variant)}</span>` : '';
  return `<div class="extra-detail">
    ${named || chip ? `<div class="extra-head">${name}${chip}</div>` : ''}
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
  const ramp = warmups(base, weights[0], state.unit, state.round, REMAX_RAMP[lift.id === 'deadlift' ? 'deadlift' : 'lift'])
    .map((s) => `, ${fmt(s.weight)} × ${s.reps}`).join('');
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
    <p class="warmup">Warm-up: empty bar × 5–10${ramp}. Rest 2–3 minutes between warm-ups.</p>
    <ol class="attempts">${attempts}</ol>
    ${loading !== null ? barbell(weights[loading], ATTEMPT_NAMES[loading]) : ''}
    <p class="hint">Pick the third from how the second moved: fast, go for ${fmt(weights[2])}; slow, take about ${fmt(slow)}; a grind, stop there and mark the third a pass.</p>
    ${best !== null ? `<p class="remax-best">Best good lift <strong>${fmt(best)}</strong> ${state.unit}</p>` : ''}
    ${skipButton(session, i)}
    ${extrasSection(session, i)}
  </div>`;
}

function barbell(total, attempt) {
  const plates = platesPerSide(total, state.unit);
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

// ---------- PRs ----------

const big = (n) => (Math.round(n * 100) / 100).toLocaleString();

// How much sleeve a stack of plates takes: the shoulder, each plate with its gap, and the collar.
const stackWidth = (plates) => 12 + plates.reduce((sum, p) => sum + PLATE_STYLE[state.unit][p][2] + 2, 0) + 5;

// A loaded barbell seen from the side, plates on both sleeves. `sleeve` is shared by a page's bars so the
// plates are the same size on each. They slide on when the page opens.
function loadedBar(plates, sleeve) {
  const H = 76;
  const mid = H / 2;
  const shaft = 150;
  const W = shaft + 2 * sleeve;
  const side = (dir) => {
    const shoulder = dir < 0 ? sleeve : sleeve + shaft;
    const parts = [`<rect x="${dir < 0 ? shoulder - 7 : shoulder}" y="${mid - 9}" width="7" height="18" rx="1.5" fill="var(--chrome)"/>`];
    let x = shoulder + dir * 12;
    plates.forEach((p, k) => {
      const [colour, h, w] = PLATE_STYLE[state.unit][p];
      const fill = colour === 'chrome' ? 'var(--chrome)' : `var(--plate-${colour})`;
      parts.push(`<rect class="bar-plate" style="--k:${k};--from:${dir * 40}px" x="${dir < 0 ? x - w : x}" y="${mid - h / 2}" width="${w}" height="${h}" rx="1.5" fill="${fill}" stroke="rgba(0,0,0,0.3)"/>`);
      x += dir * (w + 2);
    });
    parts.push(`<rect class="bar-plate" style="--k:${plates.length};--from:${dir * 40}px" x="${dir < 0 ? x - 5 : x}" y="${mid - 11}" width="5" height="22" rx="1" fill="var(--chrome)"/>`);
    return parts.join('');
  };
  return `<svg class="bar-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <rect x="0" y="${mid - 4.5}" width="${sleeve}" height="9" rx="2" fill="url(#bar-steel)"/>
    <rect x="${sleeve + shaft}" y="${mid - 4.5}" width="${sleeve}" height="9" rx="2" fill="url(#bar-steel)"/>
    <rect x="${sleeve}" y="${mid - 3.5}" width="${shaft}" height="7" fill="url(#bar-steel)"/>
    <rect x="${sleeve + 10}" y="${mid - 3.5}" width="${shaft * 0.3}" height="7" fill="rgba(0,0,0,0.18)"/>
    <rect x="${sleeve + shaft * 0.7 - 10}" y="${mid - 3.5}" width="${shaft * 0.3}" height="7" fill="rgba(0,0,0,0.18)"/>
    ${side(-1)}${side(1)}
  </svg>`;
}

// The three records, each loaded on a bar, and the total they add up to.
function prsView() {
  const records = LIFTS.map((l) => ({ l, r: liftRecord(state, l.id) })).filter(({ r }) => r);
  const stacks = records.map(({ r }) => platesPerSide(r.value, state.unit));
  const sleeve = Math.max(100, ...stacks.map((p) => stackWidth(p) + 18));
  const totals = totalHistory(state);
  const now = totals[totals.length - 1];
  const first = totals[0];
  const bar = BAR[state.unit];
  const rows = records.map(({ l, r }, i) => {
    const plates = stacks[i];
    const made = tidy(bar + 2 * plates.reduce((sum, p) => sum + p, 0));
    let caption = plates.length ? `${plates.map(fmt).join(' + ')} each side` : 'The empty bar';
    if (r.value < bar) caption = 'Lighter than the empty bar';
    else if (made !== r.value) caption += `. Plates make ${fmt(made)}`;
    return `<li class="pr">
      <div class="pr-head">
        <h2 class="pr-lift">${l.name}</h2>
        <span class="pr-date">${r.kind === 'remax' ? 'Re-max, ' : ''}${shortDate(r.date)}</span>
      </div>
      <p class="pr-num">${fmt(r.value)}<span class="pr-unit">${state.unit}</span></p>
      ${loadedBar(plates, sleeve)}
      <p class="pr-plates">${caption}</p>
      ${r.previous ? `<p class="pr-gain">Up ${fmt(r.value - r.previous.value)} from ${fmt(r.previous.value)} on ${shortDate(r.previous.date)}</p>` : ''}
    </li>`;
  }).join('');
  const rise = first && first.date !== now.date ? ` Up ${fmt(now.total - first.total)} from your first total of ${big(first.total)} on ${shortDate(first.date)}.` : '';
  return `<header class="top"><h1 class="display">PRs</h1></header>
    ${now ? `<section class="total" aria-label="Total">
      <p class="total-num">${big(now.total)}<span class="total-unit">${state.unit} total</span></p>
      <p class="hint">Your best squat, bench and deadlift added up, reached ${shortDate(now.date)}.${rise}</p>
    </section>` : ''}
    <ol class="pr-list">${rows}</ol>
    <p class="hint">A record is a lift you did: the maxes you entered when you started, maxes added in History → Lifts, and good re-max attempts. Estimates from 2+ sets don't count.</p>`;
}

// Logged sets light up like meet judging lights: white for a good set, red for a short one.
function setLight(session, index, i, reps) {
  const target = prescription(session.kind, ui.week).reps;
  const test = isTestSet(session, ui.week, i);
  let cls = test ? 'set is-heavy' : 'set';
  let text = test ? `${target}+` : String(target);
  let label = `Set ${i + 1}, ${test ? `as many reps as you can, target ${target}` : plural(target, 'rep')}, not logged`;
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

function reviewView() {
  const b = block();
  const n = state.blocks.length;
  return `<header class="top">
      <button class="btn-quiet back" data-action="review-back">Back to week ${b.log.length}</button>
      <h1 class="display">Finish block ${n}</h1>
    </header>
    <p class="lede">These are your maxes for block ${n + 1}. Change any number before you start.</p>
    <form class="review" id="review-form" novalidate>
      ${LIFTS.map((l) => {
        const result = evaluateLift(b, l.id, state);
        return `<section class="review-lift">
          <h2 class="lift-name">${l.name}</h2>
          <p class="review-why${result.change > 0 ? '' : ' is-held'}">${reviewReason(result, l.id)}</p>
          ${maxField({ ...l, name: `New max, was ${fmt(b.max[l.id])}` }, fmt(result.suggested))}
        </section>`;
      }).join('')}
      <fieldset class="review-lift">
        <legend class="setting-title">Week 8 of block ${n + 1}</legend>
        ${segmented('finish', [{ value: 'remax', label: 'Re-max' }, { value: 'deload', label: 'Deload' }], finishFor(n))}
        <p class="hint">Re-max every second block. Deload sooner if your lifts stall, joints ache or sleep slips.</p>
      </fieldset>
      <button class="btn btn-wide" type="submit">Start block ${n + 1}</button>
    </form>`;
}

function chartWidth() {
  const style = getComputedStyle(view);
  return Math.floor(view.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
}

const HISTORY_VIEWS = [
  { value: 'lifts', label: 'Lifts' }, { value: 'extras', label: 'Accessories' }, { value: 'muscles', label: 'Muscles' }, { value: 'time', label: 'Time' },
  { value: 'body', label: 'Body' },
];

function historyView() {
  const section = { extras: extrasHistory, muscles: musclesHistory, time: timeHistory, body: bodyHistory }[ui.history]?.() ?? liftsHistory();
  return `<header class="top"><h1 class="display">History</h1></header>
    <fieldset class="history-pick" aria-label="Show">${segmented('historyView', HISTORY_VIEWS, ui.history)}</fieldset>
    ${section}`;
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
  const totals = new Map();
  for (const { session, time } of all) {
    for (const p of time.parts) {
      const key = p.part === 'lift' ? `lift:${session.lift}` : p.part;
      const t = totals.get(key) ?? { ms: 0, sets: 0, days: 0 };
      Object.assign(t, { ms: t.ms + p.ms, sets: t.sets + p.sets, days: t.days + 1 });
      totals.set(key, t);
    }
  }
  const rows = [...totals].map(([key, t]) => {
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
    const best = records(h).best;
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
  const { heaviest, best, volume } = records(history);
  const points = history.map((h, i) => {
    const top = sessionBest(h.sets);
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
      <div><dt>Best session</dt><dd>${Math.round(loadOf(e, volume, state.unit)).toLocaleString()}</dd></div>
    </dl>
    <p class="hint">Best session is weight × reps added up, in ${state.unit}.${isCounted(e) ? ` Each plate counts as ${PLATE[state.unit]} ${state.unit}, both sides.` : ''}</p>
    <section class="chart-block">
      <h3 class="chart-title">${reps ? 'Most reps in a set' : `Estimated max${isCounted(e) ? ' in plates' : ''}, by session`}</h3>
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
      <p class="chart-legend"><span><i class="key-line"></i>Max you trained from</span><span><i class="key-dot"></i>Tested</span></p>
      <figure class="chart" data-chart="max" data-key="chart-max" tabindex="0"
          aria-label="${lift.short} max by week, now ${fmt(latest)} ${state.unit}${tested.length ? `, ${plural(tested.length, 'tested result')}` : ''}. Use the arrow keys to read each week.">
        ${maxChart(weeks, width)}
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
        ${volumeChart(weeks, width)}
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
      <legend class="setting-title">Work from</legend>
      ${segmented('trainingMax', maxOptions, String(state.trainingMax))}
      <p class="hint">Switch to a 90% training max if your max was a grind, or your 2+ sets start coming up short.</p>
    </fieldset>
    <fieldset class="setting">
      <legend class="setting-title">Rest timer</legend>
      ${segmented('rest', restOptions, state.rest)}
      <p class="hint">Starts when you log a set, timed for the lift and the weight: longer for heavier sets and deadlifts. The screen stays on while it runs, and the bar turns white when rest is over. Beeps only play with the app open and the ring switch off silent.</p>
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
    </section>`;
}

const shortDay = (d) => d.slice(0, 3);

function exercisesSection() {
  const last = state.exercises.length - 1;
  const rows = state.exercises.map((e, i) => {
    const days = e.days.length ? e.days.map(shortDay).join(', ') : 'No set days';
    const partner = exerciseById(e.link) ?? state.exercises.find((x) => x.link === e.id);
    const variants = `${e.variants.length ? `. ${e.variants.map(esc).join(' or ')}` : ''}${partner ? `. Superset with ${esc(partner.name)}` : ''}`;
    return `<li class="exercise-row">
      <button class="index-row" data-action="exercise-edit" data-exercise="${e.id}" data-key="exercise-edit-${e.id}">${picHTML(e)}<span class="index-text">
        <span class="index-name">${esc(e.name)}</span>
        <span class="index-meta">${e.sets} × ${e.low}–${e.high}, ${days}${e.muscle ? `. ${e.muscle}` : ''}${isCounted(e) ? '. In plates a side' : ''}${variants}</span>
      </span></button>
      <button class="icon-btn" data-action="exercise-move" data-exercise="${e.id}" data-by="-1" data-key="exercise-up-${e.id}"
        aria-label="Move ${esc(e.name)} up"${i === 0 ? ' disabled' : ''}>↑</button>
      <button class="icon-btn" data-action="exercise-move" data-exercise="${e.id}" data-by="1" data-key="exercise-down-${e.id}"
        aria-label="Move ${esc(e.name)} down"${i === last ? ' disabled' : ''}>↓</button>
    </li>`;
  }).join('');
  return `<section class="setting">
    <h2 class="setting-title">Accessories</h2>
    <p class="hint">Your exercises, the days they show up on, and their rep ranges. They're listed under each day's main lift in this order.</p>
    ${rows ? `<ol class="index-list">${rows}</ol>` : ''}
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

// ---------- Sheets ----------

const sessionAt = (index) => block().log[ui.week][index];

function nextLabel(session, next) {
  const weight = `${fmt(setWeight(block(), session, ui.week, next, state))} ${state.unit}`;
  if (session.kind === 'max') return `Next: ${ATTEMPT_NAMES[next].toLowerCase()} attempt, ${weight}`;
  const test = isTestSet(session, ui.week, next) ? ', as many reps as you can' : '';
  return `Next: set ${next + 1} of ${session.reps.length}, ${weight}${test}`;
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
// the − and + keys move by; `decimals` is off for weights counted in plates a side.
function startPad(host, value, { step, decimals = true, unit = state.unit, open = true }) {
  ui.pad = { host, text: value === null ? '' : fmt(value), fresh: value !== null, step, decimals, unit, open };
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
      ? `Target ${target}. Count every clean rep you got.`
      : `Target ${plural(target, 'rep')}. How many did you get?`;
    // Test sets can run long, so they get a wider range.
    repGrid.innerHTML = Array.from({ length: target + (test ? 11 : 6) }, (_, n) => `
      <button class="rep${n === target ? ' is-target' : ''}" data-action="reps-pick" data-reps="${n}"
        aria-pressed="${n === current}">${n}</button>`).join('');
  }
  repsSheet.showModal();
}

// An accessory set: the weight (0 for body weight) and a tap on the reps done.
function openExtra(index, id, set) {
  const session = sessionAt(index);
  const e = exerciseById(id);
  const { entry, variant, plan } = extraPlan(session, index, e);
  const current = entry?.sets[set] ?? null;
  const target = extraTarget(e, entry, plan, set);
  ui.sheet = { index, set, exercise: id };
  document.getElementById('reps-title').textContent = `${e.name}${variant ? `, ${variant}` : ''}, set ${set + 1}`;
  document.getElementById('reps-note').textContent = isCounted(e)
    ? `${e.low}–${e.high} reps. Count the ${PLATE[state.unit]} ${state.unit} plates on one side, then tap the reps you did.`
    : `${e.low}–${e.high} reps. Set the weight (0 for body weight), then tap the reps you did.`;
  document.getElementById('reps-weight-field').hidden = false;
  const weight = current?.weight ?? target.weight ?? entry?.sets.filter(Boolean).pop()?.weight ?? null;
  // With no weight to go on, the keys come up first; otherwise the reps do, and a tap on the weight brings them up.
  startPad('reps', weight, { step: e.step, decimals: !isCounted(e), unit: loadUnit(e), open: weight === null });
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
  // In a superset the next set alternates between the two; a single exercise is a group of one.
  const group = dayGroups(state, session).find((g) => g.includes(exercise)) ?? [exercise];
  const counts = group.map((e) => (entryOf(session, e.id)?.skipped ? 0 : setCount(e, entryOf(session, e.id))));
  const next = supersetOrder(counts).find(({ which, set: s }) => !entryOf(session, group[which].id)?.sets[s]);
  if (!next) return rest.stop();
  const ahead = group[next.which];
  const { plan } = extraPlan(session, index, ahead);
  const { weight } = extraTarget(ahead, entryOf(session, ahead.id), plan, next.set);
  // Within a superset round there's only the move to the other exercise; the full rest comes after the round.
  const seconds = ahead !== exercise && next.set === set ? 15 : Math.max(...group.map((e) => e.rest));
  rest.start(seconds, `Next: ${ahead.name}, set ${next.set + 1} of ${counts[next.which]}${weight === null ? '' : `, ${loadText(ahead, weight)}${isCounted(ahead) ? ' a side' : ` ${state.unit}`}`}`);
}

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
    ['count', `Counted in plates a side, ${PLATE[state.unit]} ${state.unit} each`]];
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
  startPad('weight', current ?? target, { step: state.round });
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
    const result = await sync.connect(token);
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
  tab(el) {
    Object.assign(ui, { tab: el.dataset.tab, reviewing: false });
    render();
    scrollTop();
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
      logExtra(ui.sheet.index, exerciseById(ui.sheet.exercise), ui.sheet.set, { weight, reps: Number(el.dataset.reps) });
      repsSheet.close();
      render();
      return;
    }
    const session = sessionAt(ui.sheet.index);
    logSet(session, ui.sheet.set, Number(el.dataset.reps));
    repsSheet.close();
    render();
    if (isTestSet(session, ui.week, ui.sheet.set)) toast(testNews(session));
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
      return saveWeight(v);
    }
    if (v === null) return toast('Enter the weight first. Use 0 for body weight.');
    Object.assign(ui.pad, { text: fmt(v), fresh: true, open: false });
    renderPad();
  },
  // One tap logs an accessory set as planned once its weight is known; otherwise it asks.
  'extra-set'(el) {
    rest.prime();
    const index = Number(el.dataset.index);
    const set = Number(el.dataset.set);
    const e = exerciseById(el.dataset.exercise);
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
    finishExtras(state, sessionAt(Number(el.dataset.index)));
    ui.extraOpen = null;
    save();
    rest.stop();
    render();
  },
  // Starting dates the day (and closes earlier ones) the same as logging a set does.
  'workout-start'(el) {
    const session = sessionAt(Number(el.dataset.index));
    session.started = nowISO();
    markTrained(session);
    save();
    render();
  },
  'workout-end'(el) {
    const session = sessionAt(Number(el.dataset.index));
    session.ended = nowISO();
    const left = finishExtras(state, session);
    ui.extraOpen = null;
    save();
    rest.stop();
    render();
    toast(`Workout ended, ${spanText(workoutTime(session).total)}.${left ? ` ${plural(left, 'accessory')} not finished ${left === 1 ? 'was' : 'were'} skipped.` : ''}`);
  },
  'workout-reopen'(el) {
    delete sessionAt(Number(el.dataset.index)).ended;
    save();
    render();
    toast('Reopened. Anything skipped stays skipped until you undo it.');
  },
  'extra-skip'(el) {
    const session = sessionAt(Number(el.dataset.index));
    const e = exerciseById(el.dataset.exercise);
    entryFor(session, e, defaultVariant(state, e)).skipped = true;
    save();
    render();
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
  'exercise-move'(el) {
    const i = state.exercises.findIndex((e) => e.id === el.dataset.exercise);
    const j = i + Number(el.dataset.by);
    if (j < 0 || j >= state.exercises.length) return;
    [state.exercises[i], state.exercises[j]] = [state.exercises[j], state.exercises[i]];
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
  'exercise-open'(el) {
    Object.assign(ui, { exercise: el.dataset.exercise, variant: null });
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
  'rest-add'() {
    rest.add(30);
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
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tickElapsed();
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
