// The app's own keypad for weights, so the phone's keyboard never comes up over a sheet.
// The number is kept as the text typed ("12." stays "12." until the next key) and these rules say what
// each key does to it. Nothing here touches the page.

import { tidy } from './logic.js';

// Four whole digits is more than anyone loads; two decimals cover 1.25 kg plates.
const MAX_WHOLE = 4;
export const DECIMALS = { weight: 2, plates: 1 };

// `key` is a digit, '.' or 'back'. A `fresh` number is the one the sheet opened with, shown as if
// selected: typing replaces it and backspace clears it. `decimals` is how many digits may follow the
// point: one for plates a side, whose tenth is the small plates (2.5 is 45 + 45 + 25).
export function press(text, key, { fresh = false, decimals = DECIMALS.weight } = {}) {
  const base = fresh ? '' : text;
  if (key === 'back') return base.slice(0, -1);
  if (key === '.') {
    if (!decimals || base.includes('.')) return base;
    return base ? `${base}.` : '0.';
  }
  if (!/^[0-9]$/.test(key)) return base;
  if (base === '0') return key;
  const [whole, fraction] = base.split('.');
  const room = fraction === undefined ? whole.length < MAX_WHOLE : fraction.length < decimals;
  return room ? base + key : base;
}

// The typed text as a number, or null when nothing usable has been typed ("" or ".").
export function typed(text) {
  const n = parseFloat(text);
  return Number.isFinite(n) ? tidy(n) : null;
}

// One step up (direction 1) or down (-1) from the number shown, never below zero. Nothing typed counts as 0.
export function nudge(value, step, direction) {
  return Math.max(0, tidy((value ?? 0) + direction * step));
}
