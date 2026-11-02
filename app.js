import {
  LIFTS, WEEKS, HEAVY_WEEK, HEAVY_SET, ROUNDING, tidy, targetWeight, platesPerSide,
  newBlock, weekProgress, currentWeek, evaluateLift, convertState, isValidState,
} from './logic.js';

const KEY = 'powerlifting-wave';
const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const toastEl = document.getElementById('toast');
const repsSheet = document.getElementById('reps-sheet');
const weightSheet = document.getElementById('weight-sheet');
const weightInput = document.getElementById('weight-input');
const restoreInput = document.getElementById('restore-input');

let state = load();
const ui = { tab: 'train', reviewing: false, week: null, sheet: null };

// Colour, height and thickness for one side of the bar, heaviest plates biggest.
const PLATE_STYLE = {
  lb: { 45: ['blue', 56, 12], 35: ['yellow', 50, 11], 25: ['green', 44, 10], 10: ['white', 34, 8], 5: ['black', 28, 7], 2.5: ['chrome', 22, 6], 1.25: ['chrome', 18, 5] },
  kg: { 25: ['red', 56, 12], 20: ['blue', 56, 11], 15: ['yellow', 50, 10], 10: ['green', 44, 9], 5: ['white', 34, 8], 2.5: ['black', 28, 7], 1.25: ['chrome', 22, 5] },
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (isValidState(saved)) return saved;
  } catch {
    // Unreadable storage falls through to a fresh start.
  }
  return { v: 1, unit: 'lb', round: 5, blocks: [] };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast("Couldn't save. Free up space on your phone, then log the set again.");
  }
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

// Exaggerates the gap between 50% and 82.5% so the wave shape reads at small sizes.
const waveHeight = (pct, min, max) => min + ((pct - 0.5) / 0.325) * (max - min);

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2800);
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
  const bars = WEEKS.map((w, i) => {
    const h = waveHeight(w.pct, 34, 96);
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

function setupView() {
  return `<section class="setup">
    ${waveMark()}
    <h1 class="display">Powerlifting Wave</h1>
    <p class="lede">Enter your current one-rep max for each lift. Every working weight in the 4-week block comes from these numbers.</p>
    <fieldset class="setting">
      <legend class="setting-title">Units</legend>
      ${segmented('unit', unitOptions(), state.unit)}
    </fieldset>
    <form class="max-form" id="setup-form" novalidate>
      ${LIFTS.map((l) => maxField(l, '')).join('')}
      <button class="btn btn-wide" type="submit">Start block 1</button>
    </form>
    <button class="btn-quiet" data-action="restore">Restore a backup instead</button>
  </section>`;
}

function weekNote(week) {
  const w = WEEKS[week];
  if (week === HEAVY_WEEK) return `${w.note}. On the last set of each lift, do as many clean reps as you can. Extra reps raise your next maxes.`;
  if (week === WEEKS.length - 1) return `${w.note}. This week doesn't count toward your next increase.`;
  return `${w.note}.`;
}

function trainView() {
  const b = block();
  const n = state.blocks.length;
  if (ui.week === null) ui.week = currentWeek(b);
  const last = ui.week === WEEKS.length - 1;
  return `<header class="top">
      <h1 class="display">Block ${n}</h1>
      <p class="top-meta">Started ${shortDate(b.started)}</p>
    </header>
    ${waveNav(b)}
    <section class="week-head">
      <h2 class="week-title">${WEEKS[ui.week].name}</h2>
      <p class="week-note">${weekNote(ui.week)}</p>
    </section>
    ${LIFTS.map((l) => liftView(b, l)).join('')}
    ${last ? `<div class="block-end">
      <button class="btn btn-wide" data-action="review" data-key="review">Finish block</button>
      <p class="hint">See how the block went and set your maxes for block ${n + 1}.</p>
    </div>` : ''}`;
}

function waveNav(b) {
  return `<nav class="wave" aria-label="Weeks">${WEEKS.map((w, i) => {
    const p = weekProgress(b, i);
    return `<button class="wave-week" data-action="week" data-week="${i}" data-key="week-${i}" aria-pressed="${i === ui.week}"
        aria-label="Week ${i + 1}, ${w.name}, ${Math.round(p * 100)}% logged">
      <span class="wave-bar" style="--h:${waveHeight(w.pct, 18, 52).toFixed(1)}px;--fill:${p.toFixed(3)}"></span>
      <span class="wave-label">Week ${i + 1}</span>
      <span class="wave-pct">${tidy(w.pct * 100)}%</span>
    </button>`;
  }).join('')}</nav>`;
}

function liftView(b, lift) {
  const w = WEEKS[ui.week];
  const entry = b.log[ui.week][lift.id];
  const target = targetWeight(b.max[lift.id], ui.week, state.round);
  const shown = entry.weight ?? target;
  return `<article class="lift">
    <header class="lift-head">
      <h3 class="lift-name">${lift.name}</h3>
      <p class="lift-scheme">${w.sets} × ${w.reps} at ${tidy(w.pct * 100)}% of ${fmt(b.max[lift.id])}</p>
    </header>
    <button class="lift-weight" data-action="weight" data-lift="${lift.id}" data-key="weight-${lift.id}"
        aria-label="${lift.name}, ${fmt(shown)} ${state.unit}. Change weight">
      <span class="lift-num">${fmt(shown)}</span><span class="lift-unit">${state.unit}</span>
    </button>
    ${entry.weight !== null ? `<p class="lift-target">Target was ${fmt(target)}</p>` : ''}
    ${barbell(platesPerSide(shown, state.unit))}
    <div class="sets" role="group" aria-label="${lift.name} sets">
      ${entry.reps.map((r, i) => setLight(lift, i, r)).join('')}
    </div>
  </article>`;
}

function barbell(plates) {
  const caption = plates.length ? `Each side: ${plates.map(fmt).join(' + ')}` : 'Empty bar';
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
function setLight(lift, i, reps) {
  const w = WEEKS[ui.week];
  const heavy = ui.week === HEAVY_WEEK && i === HEAVY_SET;
  let cls = heavy ? 'set is-heavy' : 'set';
  let text = heavy ? `${w.reps}+` : String(w.reps);
  let label = `Set ${i + 1}, ${heavy ? `as many reps as you can, target ${w.reps}` : plural(w.reps, 'rep')}, not logged`;
  if (reps !== null) {
    cls += reps >= w.reps ? ' is-good' : ' is-short';
    text = reps > w.reps ? `${reps}<sup>+${reps - w.reps}</sup>` : String(reps);
    label = `Set ${i + 1}, ${reps} of ${w.reps} reps`;
  }
  return `<button class="${cls}" data-action="set" data-lift="${lift.id}" data-set="${i}" data-key="set-${lift.id}-${i}"
    aria-label="${label}">${text}</button>`;
}

function reviewReason(result) {
  if (result.passed) {
    const extra = result.extra ? `, plus ${plural(result.extra, 'extra rep')} on your heavy set` : '';
    return `Every rep hit${extra}. Add ${fmt(result.bump)} ${state.unit}.`;
  }
  const misses = result.misses.map((m) => {
    const parts = [];
    if (m.short) parts.push(`${plural(m.short, 'set')} short`);
    if (m.unlogged) parts.push(`${plural(m.unlogged, 'set')} not logged`);
    return `Week ${m.week + 1}: ${parts.join(' and ')}.`;
  });
  return `${misses.join(' ')} Repeat at the same max.`;
}

function reviewView() {
  const b = block();
  const n = state.blocks.length;
  return `<header class="top">
      <button class="btn-quiet back" data-action="review-back">Back to week 4</button>
      <h1 class="display">Finish block ${n}</h1>
    </header>
    <p class="lede">These are your maxes for block ${n + 1}. Change any number before you start.</p>
    <form class="review" id="review-form" novalidate>
      ${LIFTS.map((l) => {
        const result = evaluateLift(b, l.id, state.unit);
        return `<section class="review-lift">
          <h2 class="lift-name">${l.name}</h2>
          <p class="review-why${result.passed ? '' : ' is-held'}">${reviewReason(result)}</p>
          ${maxField({ ...l, name: `New max, was ${fmt(b.max[l.id])}` }, fmt(result.suggested))}
        </section>`;
      }).join('')}
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
    <section class="setting">
      <h2 class="setting-title">Current maxes</h2>
      <p class="hint">For fixing a typo. Changes apply to block ${state.blocks.length} right away.</p>
      <form class="max-form" id="max-form" novalidate>
        ${LIFTS.map((l) => maxField(l, fmt(b.max[l.id]))).join('')}
        <button class="btn" type="submit">Save maxes</button>
      </form>
    </section>
    <section class="setting">
      <h2 class="setting-title">Backup</h2>
      <p class="hint">Your log lives only on this phone. Every few weeks, save a backup to Files so a lost or reset phone doesn't take it with it.</p>
      <div class="button-row">
        <button class="btn" data-action="backup">Save backup</button>
        <button class="btn-quiet" data-action="restore">Restore backup</button>
      </div>
    </section>
    <section class="setting">
      <h2 class="setting-title">Erase all data</h2>
      <p class="hint">Deletes every block on this phone. Save a backup first if you might want it back.</p>
      <button class="btn-danger" data-action="erase">Erase all data</button>
    </section>`;
}

// ---------- Sheets ----------

function openReps(liftId, set) {
  const w = WEEKS[ui.week];
  const lift = LIFTS.find((l) => l.id === liftId);
  const current = block().log[ui.week][liftId].reps[set];
  const heavy = ui.week === HEAVY_WEEK && set === HEAVY_SET;
  ui.sheet = { liftId, set };
  document.getElementById('reps-title').textContent = `${lift.name}, set ${set + 1}`;
  document.getElementById('reps-note').textContent = heavy
    ? `Target ${w.reps}. Count every clean rep you got.`
    : `Target ${plural(w.reps, 'rep')}. How many did you get?`;
  document.getElementById('rep-grid').innerHTML = Array.from({ length: w.reps + 6 }, (_, n) => `
    <button class="rep${n === w.reps ? ' is-target' : ''}" data-action="reps-pick" data-reps="${n}"
      aria-pressed="${n === current}">${n}</button>`).join('');
  repsSheet.showModal();
}

function openWeight(liftId) {
  const b = block();
  const lift = LIFTS.find((l) => l.id === liftId);
  const target = targetWeight(b.max[liftId], ui.week, state.round);
  ui.sheet = { liftId, target };
  document.getElementById('weight-title').textContent = `${lift.name}, week ${ui.week + 1}`;
  document.getElementById('weight-note').textContent = `Target ${fmt(target)} ${state.unit}. Change it if you loaded something different.`;
  document.getElementById('weight-unit').textContent = state.unit;
  weightInput.value = fmt(b.log[ui.week][liftId].weight ?? target);
  weightSheet.showModal();
}

function saveWeight(value) {
  const entry = block().log[ui.week][ui.sheet.liftId];
  entry.weight = value === null || value === ui.sheet.target ? null : tidy(value);
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
    data = JSON.parse(await file.text());
  } catch {
    data = null;
  }
  if (!isValidState(data)) {
    toast("That file isn't a Powerlifting Wave backup.");
    return;
  }
  const replacing = state.blocks.length ? ' This replaces everything on this phone.' : '';
  if (!confirm(`Restore ${plural(data.blocks.length, 'block')} from this backup?${replacing}`)) return;
  state = data;
  save();
  requestPersist();
  Object.assign(ui, { tab: 'train', reviewing: false, week: null });
  render();
  toast('Backup restored.');
}

// ---------- Forms ----------

function readMaxes(form) {
  const max = {};
  for (const l of LIFTS) {
    const v = parseFloat(form.elements[l.id].value);
    if (!(v > 0)) return null;
    max[l.id] = tidy(v);
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
    ui.week = 0;
    render();
  },
  'review-form'(form) {
    const max = readMaxes(form);
    if (!max) return toast('Enter a max above 0 for all three lifts.');
    block().finished = todayISO();
    state.blocks.push(newBlock(max, todayISO()));
    save();
    Object.assign(ui, { reviewing: false, week: 0 });
    render();
    window.scrollTo(0, 0);
    toast(`Block ${state.blocks.length} started.`);
  },
  'max-form'(form) {
    const max = readMaxes(form);
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
    window.scrollTo(0, 0);
  },
  week(el) {
    ui.week = Number(el.dataset.week);
    render();
  },
  set(el) {
    const { lift, set } = el.dataset;
    const i = Number(set);
    const entry = block().log[ui.week][lift];
    const heavy = ui.week === HEAVY_WEEK && i === HEAVY_SET;
    // One tap logs a normal set at target; the heavy set always asks how many reps.
    if (entry.reps[i] === null && !heavy) {
      entry.reps[i] = WEEKS[ui.week].reps;
      save();
      render();
    } else {
      openReps(lift, i);
    }
  },
  'reps-pick'(el) {
    block().log[ui.week][ui.sheet.liftId].reps[ui.sheet.set] = Number(el.dataset.reps);
    save();
    repsSheet.close();
    render();
  },
  'reps-clear'() {
    block().log[ui.week][ui.sheet.liftId].reps[ui.sheet.set] = null;
    save();
    repsSheet.close();
    render();
  },
  'sheet-close'(el) {
    el.closest('dialog').close();
  },
  weight(el) {
    openWeight(el.dataset.lift);
  },
  'weight-save'() {
    const v = parseFloat(weightInput.value);
    if (!(v > 0)) return toast('Enter a weight above 0.');
    saveWeight(v);
  },
  'weight-reset'() {
    saveWeight(null);
  },
  review() {
    ui.reviewing = true;
    render();
    window.scrollTo(0, 0);
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
  erase() {
    if (!confirm("Erase every block on this phone? This can't be undone.")) return;
    state = { v: 1, unit: state.unit, round: state.round, blocks: [] };
    save();
    Object.assign(ui, { tab: 'train', reviewing: false, week: null });
    render();
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
      // On the setup screen, swap labels in place so typed maxes aren't lost.
      Object.assign(state, { unit: value, round: ROUNDING[value][0] });
      for (const u of view.querySelectorAll('.field-unit')) u.textContent = value;
    } else {
      state = convertState(state, value);
      render();
      toast(`Switched to ${value === 'kg' ? 'kilograms' : 'pounds'}.`);
    }
    save();
  } else if (name === 'round') {
    state.round = Number(value);
    save();
    render();
  }
});

weightInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ACTIONS['weight-save']();
});

restoreInput.addEventListener('change', () => {
  const file = restoreInput.files[0];
  if (file) restore(file);
});

render();
if (state.blocks.length) requestPersist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
