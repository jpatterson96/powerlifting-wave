import { test } from 'node:test';
import assert from 'node:assert/strict';
import { press, typed, nudge } from '../pad.js';

const type = (keys, text = '', options) => keys.split('').reduce((t, k) => press(t, k, options), text);

test('digits build the number, one point at most, and a leading zero gives way', () => {
  assert.equal(type('125'), '125');
  assert.equal(type('12.5'), '12.5');
  assert.equal(type('12.5.5'), '12.55');
  assert.equal(type('05'), '5');
  assert.equal(type('00'), '0');
  assert.equal(type('0.5'), '0.5');
  assert.equal(press('', '.'), '0.');
  assert.equal(press('12', 'x'), '12');
});

test('backspace takes the last character off', () => {
  assert.equal(press('12.5', 'back'), '12.');
  assert.equal(press('1', 'back'), '');
  assert.equal(press('', 'back'), '');
});

test('a fresh number is replaced by what is typed and cleared by backspace', () => {
  assert.equal(press('120', '1', { fresh: true }), '1');
  assert.equal(press('120', '.', { fresh: true }), '0.');
  assert.equal(press('120', 'back', { fresh: true }), '');
});

test('plates a side take no decimals', () => {
  assert.equal(press('6', '.', { decimals: false }), '6');
  assert.equal(type('6.5', '', { decimals: false }), '65');
});

test('the number stops at four whole digits and two decimals', () => {
  assert.equal(type('12345'), '1234');
  assert.equal(type('1.255'), '1.25');
  assert.equal(type('1234.56'), '1234.56');
});

test('the typed text reads as a weight once it has a digit', () => {
  assert.equal(typed('125'), 125);
  assert.equal(typed('12.'), 12);
  assert.equal(typed('0.'), 0);
  assert.equal(typed(''), null);
  assert.equal(typed('.'), null);
});

test('a step moves the weight and never goes below zero', () => {
  assert.equal(nudge(120, 5, 1), 125);
  assert.equal(nudge(120, 5, -1), 115);
  assert.equal(nudge(2.5, 5, -1), 0);
  assert.equal(nudge(null, 2.5, 1), 2.5);
  assert.equal(nudge(0.1, 0.2, 1), 0.3);
});
