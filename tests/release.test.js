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

test('the page runs only its own scripts and talks only to GitHub', () => {
  const policy = read('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy, 'index.html sets a Content-Security-Policy');
  const directives = Object.fromEntries(policy.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(directives['default-src'], ["'none'"]);
  assert.deepEqual(directives['script-src'], ["'self'"]);
  assert.deepEqual(directives['connect-src'], ['https://api.github.com']);
});
