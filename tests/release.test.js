import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the version the app shows is the cache sw.js fills', () => {
  const cache = read('sw.js').match(/const CACHE = '(wave-v\d+)'/)?.[1];
  const version = read('app.js').match(/const VERSION = '(wave-v\d+)'/)?.[1];
  assert.ok(cache, 'sw.js names its cache');
  assert.equal(version, cache);
});
