import {
  LIFTS, WEEKS, DELOAD_WEEK, TEST_WEEK, isTestSet, prescription, ROUNDING, BAR, tidy, workingMax, targetWeight,
  platesPerSide, warmups, emptyState, newBlock, setDeload, sessionStatus, weekProgress, nextSession, currentWeek,
  weekToRepeat, resetWeek, longBreak, restartBlock, evaluateLift, convertState, upgrade,
} from './logic.js';
import * as sync from './sync.js';

const KEY = 'powerlifting-wave';
const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const toastEl = document.getElementById('toast');
const repsSheet = document.getElementById('reps-sheet');
const weightSheet = document.getElementById('weight-sheet');
const weightInput = document.getElementById('weight-input');
const restoreInput = document.getElementById('restore-input');

let state = load();
// `open` is the index of the expanded day in the shown week; undefined means "pick the next day to train".
const ui = { tab: 'train', reviewing: false, week: null, open: undefined, sheet: null };

// Colour, height and thickness for one side of the bar, heaviest plates biggest.
const PLATE_STYLE = {
  lb: { 45: ['blue', 56, 12], 35: ['yellow', 50, 11], 25: ['green', 44, 10], 10: ['white', 34, 8], 5: ['black', 28, 7], 2.5: ['chrome', 22, 6], 1.25: ['chrome', 18, 5] },
  kg: { 25: ['red', 56, 12], 20: ['blue', 56, 11], 15: ['yellow', 50, 10], 10: ['green', 44, 9], 5: ['white', 34, 8], 2.5: ['black', 28, 7], 1.25: ['chrome', 22, 5] },
};

function load() {
  try {
    const saved = upgrade(JSON.parse(localStorage.getItem(KEY)));
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
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function savedAt(isoTime) {
  const t = new Date(isoTime);
  const time = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (t.toDateString() === new Date().toDateString()) return `at ${time}`;
  return `on ${t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

// Exaggerates the gap between 50% and 82.5% so the wave shape reads at small sizes.
const waveHeight = (pct, min, max) => min + ((pct - 0.5) / 0.325) * (max - min);

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
    else if (ui.tab === 'settings') view.innerHTML = settingsView();
    else view.innerHTML = ui.reviewing ? reviewView() : trainView();
  }
  if (focusKey) view.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

function waveMark() {
  const bars = [0.70, 0.75, 0.825, 0.50].map((pct, i) => {
    const h = waveHeight(pct, 34, 96);
    return `<rect x="${i * 30}" y="${100 - h}" width="20" height="${h}" class="${i === 3 ? 'mark-deload' : ''}"/>`;
  }).join('');
  return `<svg class="wave-mark" viewBox="0 0 110 106" aria-hidden="true">${bars}<rect class="mark-floor" x="0" y="102" width="110" height="4"/></svg>`;
}

function segmented(name, options, current) {
  return `<div class="seg">${options.map((o) => `
    <label class="seg-option">
      <input type="radio" name="${name}" value="${o.value}"${o.value === current ? ' checked' : ''}>
      <span>${o.label}</span>
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
    <p class="lede">Enter your current one-rep max for each lift. Every working weight in the block comes from these numbers.</p>
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
    <p class="hint">GitHub keeps every saved version, so an older log can always be recovered.</p>
    <div class="button-row">
      <button class="btn" data-action="sync-now">Save now</button>
      <button class="btn-quiet" data-action="sync-disconnect">Disconnect</button>
    </div>
  </section>`;
}

function weekNote(week) {
  const w = WEEKS[week];
  if (week === TEST_WEEK) {
    return `${w.note}. Monday to Wednesday, the last set (marked 2+) is as many clean reps as you can: use a spotter or safety arms. On Thursday and Friday, stop each set with about 2 reps left.`;
  }
  if (week === DELOAD_WEEK) return `${w.note}: lighter weights so you start the next block fresh. This week doesn't count toward your next increase.`;
  return `${w.note}. Thursday and Friday are heavier days with fewer reps. Missed a day? Do it next time you train, or skip it.`;
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
  if (ui.open === undefined) ui.open = defaultOpen(b, ui.week);
  const next = nextSession(b);
  const last = ui.week === b.log.length - 1;
  return `<header class="top">
      <h1 class="display">Block ${n}</h1>
      <p class="top-meta">Started ${shortDate(b.started)}</p>
    </header>
    ${notice(b)}
    ${waveNav(b)}
    <section class="week-head">
      <h2 class="week-title">${WEEKS[ui.week].name}</h2>
      <p class="week-note">${weekNote(ui.week)}</p>
      ${ui.week === DELOAD_WEEK ? '<button class="btn-quiet" data-action="remove-deload">Remove the deload week</button>' : ''}
    </section>
    <ol class="sessions">
      ${b.log[ui.week].map((s, i) => sessionView(b, s, i, next?.week === ui.week && next.index === i)).join('')}
    </ol>
    ${last ? `<div class="block-end">
      <button class="btn btn-wide" data-action="review" data-key="review">Finish block</button>
      <p class="hint">See how the block went and set your maxes for block ${n + 1}.</p>
    </div>` : ''}`;
}

function waveNav(b) {
  const bar = (pct, fill) => `<span class="wave-bar" style="--h:${waveHeight(pct, 18, 52).toFixed(1)}px;--fill:${fill}"></span>`;
  const weeks = b.log.map((_, i) => {
    const p = weekProgress(b, i);
    const pct = prescription('base', i).pct;
    return `<button class="wave-week" data-action="week" data-week="${i}" data-key="week-${i}" aria-pressed="${i === ui.week}"
        aria-label="Week ${i + 1}, ${WEEKS[i].name}, ${Math.round(p * 100)}% done">
      ${bar(pct, p.toFixed(3))}
      <span class="wave-label">Week ${i + 1}</span>
      <span class="wave-pct">${tidy(pct * 100)}%</span>
    </button>`;
  });
  if (!b.deload) {
    weeks.push(`<button class="wave-week wave-add" data-action="add-deload" data-key="add-deload" aria-label="Add a deload week to this block">
      ${bar(prescription('base', DELOAD_WEEK).pct, 0)}
      <span class="wave-label">Deload</span>
      <span class="wave-pct">Add</span>
    </button>`);
  }
  return `<nav class="wave" aria-label="Weeks">${weeks.join('')}</nav>`;
}

const liftOf = (session) => LIFTS.find((l) => l.id === session.lift);
const isHeavyDay = (session) => session.kind === 'heavy' && ui.week !== DELOAD_WEEK;

function sessionView(b, session, i, isNext) {
  const status = sessionStatus(session);
  const logged = session.reps.filter((r) => r !== null).length;
  const label = {
    skipped: 'Skipped',
    done: 'Done',
    started: `${logged} of ${session.reps.length} sets`,
    todo: isNext ? 'Up next' : '',
  }[status];
  const open = ui.open === i;
  return `<li class="session" data-status="${status}"${isNext ? ' data-next' : ''}>
    <button class="session-head" data-action="session" data-index="${i}" data-key="session-${i}" aria-expanded="${open}">
      <span class="session-day">${session.day}${isHeavyDay(session) ? ', heavy day' : ''}</span>
      <span class="session-lift">${liftOf(session).name}</span>
      <span class="session-state">${label}</span>
    </button>
    ${open ? sessionBody(b, session, i) : ''}
  </li>`;
}

function sessionBody(b, session, i) {
  if (session.skipped) {
    return `<div class="session-body">
      <p class="hint">You skipped this day. It doesn't count toward your next increase.</p>
      <button class="btn-quiet" data-action="unskip" data-index="${i}" data-key="unskip-${i}">Undo skip</button>
    </div>`;
  }
  const lift = liftOf(session);
  const p = prescription(session.kind, ui.week);
  const work = workingMax(b.max[lift.id], state);
  const target = targetWeight(work, session.kind, ui.week, state.round);
  const shown = session.weight ?? target;
  const ramp = warmups(work, shown, state.unit, state.round).map((s) => `, ${fmt(s.weight)} × ${s.reps}`).join('');
  return `<div class="session-body">
    <p class="lift-scheme">${p.sets} × ${p.reps} at ${tidy(p.pct * 100)}% of ${fmt(work)}${state.trainingMax ? ' (training max)' : ''}</p>
    <button class="lift-weight" data-action="weight" data-index="${i}" data-key="weight-${i}"
        aria-label="${lift.name}, ${fmt(shown)} ${state.unit}. Change weight">
      <span class="lift-num">${fmt(shown)}</span><span class="lift-unit">${state.unit}</span>
    </button>
    ${session.weight !== null ? `<p class="lift-target">Target was ${fmt(target)}</p>` : ''}
    ${barbell(shown)}
    <p class="warmup">Warm-up: empty bar × 5–10${ramp}</p>
    ${isHeavyDay(session) ? '<p class="hint">Heavy day: stop each set with about 2 reps left in the tank.</p>' : ''}
    <div class="sets" role="group" aria-label="${lift.name} sets">
      ${session.reps.map((r, s) => setLight(session, i, s, r)).join('')}
    </div>
    ${sessionStatus(session) === 'done' ? '' : `<button class="btn-quiet skip" data-action="skip" data-index="${i}" data-key="skip-${i}">Skip this day</button>`}
  </div>`;
}

function barbell(total) {
  const plates = platesPerSide(total, state.unit);
  const loaded = tidy(BAR[state.unit] + 2 * plates.reduce((sum, p) => sum + p, 0));
  let caption = plates.length ? `Each side: ${plates.map(fmt).join(' + ')}` : 'Empty bar';
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

function reviewReason(result) {
  const skipped = result.skipped ? ` ${plural(result.skipped, 'day')} skipped, not counted.` : '';
  if (result.performed === 0) return 'Nothing logged in weeks 1–3. Repeat at the same max.';
  if (result.passed && !result.bump) {
    // Only just making the target at 82.5% suggests the max is higher than today's real strength.
    const tip = state.trainingMax ? '' : ' A 90% training max in Settings can help.';
    return `Every rep hit, but only the target reps on your test set, so your max may be set too high. It stays the same.${tip}${skipped}`;
  }
  if (result.passed) {
    const extra = result.extra ? `, plus ${plural(result.extra, 'extra rep')} on your test set` : '';
    return `Every rep hit${extra}. Add ${fmt(result.bump)} ${state.unit}.${skipped}`;
  }
  const misses = result.misses.map((m) => {
    const parts = [];
    if (m.short) parts.push(`${plural(m.short, 'set')} short`);
    if (m.unlogged) parts.push(`${plural(m.unlogged, 'set')} not logged`);
    return `Week ${m.week + 1} ${m.day}: ${parts.join(' and ')}.`;
  });
  return `${misses.join(' ')} Repeat at the same max.${skipped}`;
}

function reviewView() {
  const b = block();
  const n = state.blocks.length;
  const deloadDone = b.deload && b.log[DELOAD_WEEK].some((s) => s.reps.some((r) => r !== null));
  return `<header class="top">
      <button class="btn-quiet back" data-action="review-back">Back to week ${b.log.length}</button>
      <h1 class="display">Finish block ${n}</h1>
    </header>
    <p class="lede">These are your maxes for block ${n + 1}. Change any number before you start.</p>
    ${deloadDone ? '<p class="hint">You just had a deload, so this is a good time to retest your maxes. If you do, enter the new numbers below.</p>' : ''}
    <form class="review" id="review-form" novalidate>
      ${LIFTS.map((l) => {
        const result = evaluateLift(b, l.id, state.unit);
        return `<section class="review-lift">
          <h2 class="lift-name">${l.name}</h2>
          <p class="review-why${result.bump ? '' : ' is-held'}">${reviewReason(result)}</p>
          ${maxField({ ...l, name: `New max, was ${fmt(b.max[l.id])}` }, fmt(result.suggested))}
        </section>`;
      }).join('')}
      <section class="review-lift">
        <label class="check">
          <input type="checkbox" name="deload"${b.deload ? '' : ' checked'}>
          <span>End block ${n + 1} with a deload week</span>
        </label>
        <p class="hint">Deload every second block, or sooner if your lifts stall, joints ache or sleep slips.</p>
      </section>
      <button class="btn btn-wide" type="submit">Start block ${n + 1}</button>
    </form>`;
}

function historyView() {
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
  return `<header class="top"><h1 class="display">History</h1></header>
    <p class="lede">The maxes each block was built on. Total is squat, bench and deadlift added together.</p>
    <table class="history">
      <thead><tr><th scope="col">Block</th>${LIFTS.map((l) => `<th scope="col">${l.short}</th>`).join('')}<th scope="col">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${state.blocks.length === 1 ? '<p class="hint">Finish block 1 to see your maxes climb here.</p>' : ''}`;
}

function settingsView() {
  const b = block();
  const roundOptions = ROUNDING[state.unit].map((r) => ({ value: String(r), label: `${fmt(r)} ${state.unit}` }));
  const maxOptions = [{ value: 'false', label: 'Full max' }, { value: 'true', label: '90% training max' }];
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
    <section class="setting">
      <h2 class="setting-title">Current maxes</h2>
      <p class="hint">For fixing a typo. Changes apply to block ${state.blocks.length} right away.</p>
      <form class="max-form" id="max-form" novalidate>
        ${LIFTS.map((l) => maxField(l, fmt(b.max[l.id]))).join('')}
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

// ---------- Sheets ----------

const sessionAt = (index) => block().log[ui.week][index];

function logSet(session, set, reps) {
  session.reps[set] = reps;
  if (reps !== null) block().lastTrained = todayISO();
  save();
}

function openReps(index, set) {
  const session = sessionAt(index);
  const target = prescription(session.kind, ui.week).reps;
  const test = isTestSet(session, ui.week, set);
  const current = session.reps[set];
  ui.sheet = { index, set };
  document.getElementById('reps-title').textContent = `${liftOf(session).name}, set ${set + 1}`;
  document.getElementById('reps-note').textContent = test
    ? `Target ${target}. Count every clean rep you got.`
    : `Target ${plural(target, 'rep')}. How many did you get?`;
  // Test sets can run long, so they get a wider range.
  document.getElementById('rep-grid').innerHTML = Array.from({ length: target + (test ? 11 : 6) }, (_, n) => `
    <button class="rep${n === target ? ' is-target' : ''}" data-action="reps-pick" data-reps="${n}"
      aria-pressed="${n === current}">${n}</button>`).join('');
  repsSheet.showModal();
}

function openWeight(index) {
  const session = sessionAt(index);
  const lift = liftOf(session);
  const target = targetWeight(workingMax(block().max[lift.id], state), session.kind, ui.week, state.round);
  ui.sheet = { index, target };
  document.getElementById('weight-title').textContent = `${lift.name}, ${session.day}`;
  document.getElementById('weight-note').textContent = `Target ${fmt(target)} ${state.unit}. Change it if you loaded something different.`;
  document.getElementById('weight-unit').textContent = state.unit;
  weightInput.value = fmt(session.weight ?? target);
  weightSheet.showModal();
}

function saveWeight(value) {
  const session = sessionAt(ui.sheet.index);
  session.weight = value === null || value === ui.sheet.target ? null : tidy(value);
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
    data = upgrade(JSON.parse(await file.text()));
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
    const v = parseFloat(raw);
    if (!(v > 0)) return null;
    max[l.id] = previous && raw === fmt(previous[l.id]) ? previous[l.id] : tidy(v);
  }
  return max;
}

const FORMS = {
  'setup-form'(form) {
    const max = readMaxes(form);
    if (!max) return toast('Enter a max above 0 for all three lifts.');
    state.blocks.push(newBlock(max, todayISO()));
    save();
    requestPersist();
    Object.assign(ui, { week: 0, open: undefined });
    render();
    scrollTop();
  },
  'review-form'(form) {
    const b = block();
    const suggested = Object.fromEntries(LIFTS.map((l) => [l.id, evaluateLift(b, l.id, state.unit).suggested]));
    const max = readMaxes(form, suggested);
    if (!max) return toast('Enter a max above 0 for all three lifts.');
    b.finished = todayISO();
    state.blocks.push(newBlock(max, todayISO(), { deload: form.elements.deload.checked }));
    save();
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
    const saved = upgrade(result.remote?.state);
    const useSaved = saved && saved.blocks.length > 0 && (state.blocks.length === 0 || confirm(
      `GitHub has a saved log with ${plural(saved.blocks.length, 'block')}. Replace this phone's log with it?\n\nCancel keeps this phone's log and saves it to GitHub instead.`));
    if (useSaved) {
      // Written locally only: the log just came from GitHub, so there is nothing new to send back.
      state = saved;
      writeLocal();
      requestPersist();
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
  'max-form'(form) {
    const max = readMaxes(form, block().max);
    if (!max) return toast('Enter a max above 0 for all three lifts.');
    block().max = max;
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
    render();
  },
  session(el) {
    const i = Number(el.dataset.index);
    ui.open = ui.open === i ? null : i;
    render();
  },
  skip(el) {
    sessionAt(Number(el.dataset.index)).skipped = true;
    save();
    ui.open = defaultOpen(block(), ui.week);
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
    const index = Number(el.dataset.index);
    const i = Number(el.dataset.set);
    const session = sessionAt(index);
    // One tap logs a normal set at target; the test set always asks how many reps.
    if (session.reps[i] === null && !isTestSet(session, ui.week, i)) {
      logSet(session, i, prescription(session.kind, ui.week).reps);
      render();
    } else {
      openReps(index, i);
    }
  },
  'reps-pick'(el) {
    logSet(sessionAt(ui.sheet.index), ui.sheet.set, Number(el.dataset.reps));
    repsSheet.close();
    render();
  },
  'reps-clear'() {
    logSet(sessionAt(ui.sheet.index), ui.sheet.set, null);
    repsSheet.close();
    render();
  },
  'sheet-close'(el) {
    el.closest('dialog').close();
  },
  weight(el) {
    openWeight(Number(el.dataset.index));
  },
  'weight-save'() {
    const v = parseFloat(weightInput.value);
    if (!(v > 0)) return toast('Enter a weight above 0.');
    saveWeight(v);
  },
  'weight-reset'() {
    saveWeight(null);
  },
  'add-deload'() {
    setDeload(block(), true);
    save();
    Object.assign(ui, { week: DELOAD_WEEK, open: undefined });
    render();
    toast('Deload week added to this block.');
  },
  'remove-deload'() {
    if (!setDeload(block(), false)) return toast("You've already logged part of the deload week, so it stays.");
    save();
    Object.assign(ui, { week: null, open: undefined });
    render();
    toast('Deload week removed.');
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
  'sync-disconnect'() {
    sync.disconnect();
    render();
    toast('Disconnected. Your log stays on this phone and on GitHub.');
  },
  erase() {
    if (!confirm("Erase every block on this phone? This can't be undone.")) return;
    state = { ...emptyState(state.unit), round: state.round, trainingMax: state.trainingMax };
    // Disconnect first so the empty log never overwrites the copy on GitHub.
    sync.disconnect();
    writeLocal();
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
  }
});

weightInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  // Without this, the same Enter also presses the weight button that gets focus back after the sheet closes.
  e.preventDefault();
  ACTIONS['weight-save']();
});

restoreInput.addEventListener('change', () => {
  const file = restoreInput.files[0];
  if (file) restore(file);
});

render();
if (state.blocks.length) requestPersist();

// Warns once per rejected key; a successful save or reconnect re-arms the warning.
let keyWarned = false;
sync.init({
  getState: () => state,
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
