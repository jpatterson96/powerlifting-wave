// Saves the training log to a private GitHub repository a few seconds after every change,
// so it survives a lost, reset or replaced phone. GitHub keeps every saved version as a commit.

export const REPO = 'jpatterson96/powerlifting-wave-data';
const API = `https://api.github.com/repos/${REPO}`;
const FILE = 'data.json';
const KEY = 'powerlifting-wave-sync';
const DELAY = 4000;

let cfg = load();
let hooks = { getState: () => null, onStatus: () => {} };
let timer = null;
let running = false;
let queued = false;
let status = initialStatus();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    // Sync settings are rebuilt on the next connect if storage is unavailable.
  }
}

function initialStatus() {
  if (!cfg.token) return 'off';
  return cfg.dirty ? 'pending' : 'synced';
}

function setStatus(next) {
  status = next;
  hooks.onStatus(status);
}

export const getStatus = () => status;
export const lastSynced = () => cfg.lastSynced ?? null;
export const isConnected = () => Boolean(cfg.token);

class HttpError extends Error {
  constructor(res) {
    super(`GitHub answered ${res.status}`);
    this.status = res.status;
  }
}

function request(token, path, options = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

function toBase64(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(encoded) {
  const binary = atob(encoded.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

// Returns { sha, state } for the saved log, or null when nothing has been saved yet.
async function readRemote(token) {
  const res = await request(token, `/contents/${FILE}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res);
  const file = await res.json();
  let state = null;
  try {
    state = JSON.parse(fromBase64(file.content));
  } catch {
    // An unreadable file is overwritten on the next save; its old version stays in GitHub's history.
  }
  return { sha: file.sha, state };
}

function localStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function writeRemote(token, sha, text) {
  const stamp = localStamp();
  const res = await request(token, `/contents/${FILE}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Log update ${stamp}`, content: toBase64(text), ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new HttpError(res);
  return (await res.json()).content.sha;
}

async function push() {
  if (!cfg.token) return;
  if (running) {
    queued = true;
    return;
  }
  clearTimeout(timer);
  running = true;
  cfg.dirty = false;
  store();
  setStatus('saving');
  try {
    const text = JSON.stringify(hooks.getState(), null, 2);
    try {
      cfg.sha = await writeRemote(cfg.token, cfg.sha, text);
    } catch (err) {
      // 409/422 mean the file changed since this phone last saved. This phone's log wins.
      if (err.status !== 409 && err.status !== 422) throw err;
      const remote = await readRemote(cfg.token);
      cfg.sha = await writeRemote(cfg.token, remote?.sha, text);
    }
    cfg.lastSynced = new Date().toISOString();
    store();
    setStatus(cfg.dirty ? 'pending' : 'synced');
  } catch (err) {
    cfg.dirty = true;
    store();
    if ([401, 403, 404].includes(err.status)) setStatus('bad-key');
    else setStatus(err.status ? 'error' : 'offline');
  } finally {
    running = false;
  }
  if (queued) {
    queued = false;
    push();
  }
}

// Call after every local save.
export function changed() {
  if (!cfg.token) return;
  cfg.dirty = true;
  store();
  if (status !== 'saving') setStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(push, DELAY);
}

export function saveNow() {
  if (!cfg.token) return;
  cfg.dirty = true;
  push();
}

// Checks the key, then reports what is already saved on GitHub so the app can offer to restore it.
export async function connect(token) {
  let remote;
  try {
    const repo = await request(token, '');
    if (!repo.ok) {
      return { ok: false, message: `That key can't open ${REPO}. Make sure it has Contents read and write access to that repository.` };
    }
    remote = await readRemote(token);
  } catch (err) {
    // An HTTP error here means the key reached the repository but isn't allowed to read its files.
    if (err.status) {
      return { ok: false, message: `That key can see ${REPO} but can't read its files. Give it Contents read and write access.` };
    }
    return { ok: false, message: "Couldn't reach GitHub. Check your connection and try again." };
  }
  cfg = { token, sha: remote?.sha ?? null, dirty: false, lastSynced: remote ? new Date().toISOString() : null };
  store();
  setStatus('synced');
  return { ok: true, remote };
}

// Reads the log saved on GitHub so changes made away from this phone can be loaded onto it.
// Refuses while this phone has changes of its own still waiting to save, so neither side is lost.
export async function fetchSaved() {
  if (!cfg.token) return { ok: false, message: 'Connect to GitHub first.' };
  if (cfg.dirty || running) return { ok: false, message: 'This phone still has changes saving to GitHub. Try again in a few seconds.' };
  try {
    const remote = await readRemote(cfg.token);
    if (!remote?.state) return { ok: false, message: 'There is no readable log saved on GitHub yet.' };
    cfg.sha = remote.sha;
    store();
    return { ok: true, state: remote.state };
  } catch (err) {
    if ([401, 403, 404].includes(err.status)) {
      setStatus('bad-key');
      return { ok: false, message: 'GitHub rejected the access key. Disconnect, then connect with a new key.' };
    }
    return { ok: false, message: "Couldn't reach GitHub. Check your connection and try again." };
  }
}

export function disconnect() {
  clearTimeout(timer);
  cfg = {};
  store();
  setStatus('off');
}

export function init(appHooks) {
  hooks = appHooks;
  const retry = () => {
    if (cfg.token && cfg.dirty) push();
  };
  window.addEventListener('online', retry);
  // iOS can suspend the app soon after it leaves the screen, so save straight away instead of waiting.
  document.addEventListener('visibilitychange', retry);
  retry();
}
