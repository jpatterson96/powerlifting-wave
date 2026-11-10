// Rest timer between sets. It counts down to a stored end time, so it stays right after the phone sleeps
// or the app is closed and reopened. iOS only plays sound from an audio context unlocked by a tap, so
// prime() runs on every set tap.

const KEY = 'powerlifting-wave-rest';
// Gone this long after it finished, the timer was forgotten, not ignored.
const STALE_MS = 5 * 60 * 1000;

const box = document.getElementById('rest');
const timeEl = document.getElementById('rest-time');
const labelEl = document.getElementById('rest-label');
const nextEl = document.getElementById('rest-next');
const fillEl = document.getElementById('rest-fill');

let timer = read();
let mode = 'sound';
let audio = null;
let lock = null;
let ticking = null;
let rang = false;

function read() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    return t && typeof t.end === 'number' && typeof t.total === 'number' ? t : null;
  } catch {
    return null;
  }
}

function write() {
  try {
    if (timer) localStorage.setItem(KEY, JSON.stringify(timer));
    else localStorage.removeItem(KEY);
  } catch {
    // The timer still runs for this visit without storage.
  }
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function tone(at, length) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(audio.destination);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

// Three tones when rest is over, and nothing before then.
function ring() {
  if (mode !== 'sound' || !audio || audio.state !== 'running') return;
  for (let i = 0; i < 3; i++) tone(audio.currentTime + i * 0.28, 0.2);
}

// `wanted` is checked again when a request resolves, so a stop that lands mid-request still lets the screen sleep.
let wanted = false;
let requesting = false;

async function holdScreen(on) {
  wanted = on;
  try {
    if (on && !lock && !requesting && document.visibilityState === 'visible' && navigator.wakeLock) {
      requesting = true;
      const sentinel = await navigator.wakeLock.request('screen');
      requesting = false;
      if (!wanted) {
        await sentinel.release();
        return;
      }
      lock = sentinel;
      sentinel.addEventListener('release', () => { if (lock === sentinel) lock = null; });
    } else if (!on && lock) {
      const held = lock;
      lock = null;
      await held.release();
    }
  } catch {
    // Wake lock is a nice-to-have; older iOS versions refuse it.
    requesting = false;
  }
}

function paint() {
  if (!timer) return;
  const left = Math.ceil((timer.end - Date.now()) / 1000);
  if (left <= -STALE_MS / 1000) {
    stop();
    return;
  }
  const done = left <= 0;
  box.classList.toggle('is-done', done);
  timeEl.textContent = clock(Math.max(0, left));
  labelEl.textContent = done ? 'Rest done' : 'Rest';
  fillEl.style.transform = `scaleX(${done ? 1 : 1 - left / timer.total})`;
  if (done && !rang) {
    rang = true;
    ring();
    holdScreen(false);
  }
}

function show() {
  box.hidden = false;
  document.body.classList.add('is-resting');
  nextEl.textContent = timer.next;
  clearInterval(ticking);
  ticking = setInterval(paint, 250);
  paint();
}

export function setMode(value) {
  mode = value;
  if (mode === 'off') stop();
}

// Creates or wakes the audio context inside a tap so the end-of-rest tones are allowed to play.
export function prime() {
  if (mode !== 'sound') return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running') audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
}

export function start(seconds, next) {
  if (mode === 'off') return;
  timer = { end: Date.now() + seconds * 1000, total: seconds, next };
  rang = false;
  write();
  show();
  holdScreen(true);
}

// Negative seconds take time off, down to zero, which ends the rest. Rest already over has nothing to take off.
export function add(seconds) {
  if (!timer) return;
  const left = Math.max(0, timer.end - Date.now());
  if (seconds < 0 && left === 0) return;
  const after = Math.max(0, left + seconds * 1000);
  timer = { ...timer, end: Date.now() + after, total: Math.max(timer.total, Math.ceil(after / 1000)) };
  rang = false;
  write();
  paint();
  holdScreen(after > 0);
}

export function stop() {
  timer = null;
  write();
  clearInterval(ticking);
  box.hidden = true;
  box.classList.remove('is-done');
  document.body.classList.remove('is-resting');
  holdScreen(false);
}

export function running() {
  return timer !== null;
}

// A timer left over from before the app was closed picks up where it is now, without replaying tones.
export function resume() {
  if (!timer || mode === 'off') return stop();
  rang = timer.end - Date.now() <= 0;
  show();
  if (!rang) holdScreen(true);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !timer) return;
  // iOS pauses audio while the app is away; waking it here lets the end-of-rest tones play if it allows.
  if (audio && audio.state !== 'running') audio.resume().catch(() => {});
  paint();
  if (!rang) holdScreen(true);
});
