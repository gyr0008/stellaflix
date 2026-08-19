/* verify-fx-archive-boot.cjs — regression guard for the load-order FATAL boot bug.
 *
 * Scenario: a stored user FX archive exists in localStorage at boot, which forces
 *   readUserFxArchives() -> normalizeFxArchiveSnapshot() to call normalizeCoverResolution
 *   at music.js TOP-LEVEL (legacy loads BEFORE 04c-lyrics.js).
 *
 * Before the fix, normalizeCoverResolution lived only in 04c-lyrics.js (loaded later), so the
 * top-level call threw `normalizeCoverResolution is not defined`, aborting ALL subsequent
 * top-level declarations -> home page never loaded, every function was dead.
 *
 * After the fix, normalizeCoverResolution (+ its 3 dependents) is defined in legacy-music.js
 * (loaded first), so the top-level boot resolves it cleanly.
 *
 * NOTE: this deliberately seeds localStorage (the shared _loadorder_harness returns null, which
 * hides this path because readUserFxArchives() parses '[]' and never calls normalizeFxArchiveSnapshot).
 *
 * Usage: node scripts/verify-fx-archive-boot.cjs
 * Exit: 0 pass, 1 fail. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '..', 'public', 'assets');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const FILES = ['equalizer-core.js', '02-equalizer-glue.js', 'music.js', 'globals-bridge.js',
  '04a-three-host.js', '04b-shelf-3d.js', '04c-lyrics.js', '04d-audio-beat.js', '04e-audio-engine.js', '08-fx-visual.js'];

function resolveFile(f) {
  const inAssets = path.join(ASSET_DIR, f);
  if (fs.existsSync(inAssets)) return inAssets;
  return path.join(PUBLIC_DIR, f);
}

// ---- minimal DOM / THREE stubs (mirror _loadorder_harness philosophy) ----
function makeChain(name) {
  const fn = function () { return makeChain(name + '()'); };
  return new Proxy(fn, {
    get(t, p) {
      if (p === 'then') return undefined;
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'x' || p === 'y' || p === 'z' || p === 'w') return 0;
      if (p === 'length') return 0;
      if (p === 'style') return styleStub;
      if (p === 'classList') return classListStub;
      if (p === 'forEach') return function () {};
      if (p === 'catch') return function () { return makeChain(name + '.catch'); };
      return makeChain(name + '.' + String(p));
    },
    set() { return true; },
    apply() { return makeChain(name + '()'); },
    construct() { return makeChain('new ' + name); },
  });
}
const styleStub = makeChain('style');
const classListStub = { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } };
const ctxStub = new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (p === 'canvas') return makeEl();
    return function () {};
  },
  set() { return true; },
});
function makeEl() {
  const base = {
    style: styleStub, classList: classListStub,
    appendChild() {}, removeChild() {}, remove() {}, insertBefore() {}, replaceChild() {}, replaceWith() {},
    contains() { return false; }, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    closest() { return null; }, querySelectorAll() { return []; }, querySelector() { return null; },
    getContext() { return ctxStub; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {}, toDataURL() { return ''; }, title: '', disabled: false, tabIndex: 0, width: 0, height: 0,
    dataset: {}, parentNode: null, firstChild: null, nextSibling: null, childNodes: [],
  };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) {
        if ((p === 'parentNode' || p === 'firstChild' || p === 'nextSibling') && t[p] === null) t[p] = makeEl();
        return t[p];
      }
      return makeChain('el.' + String(p));
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const domReadyCbs = [];
const documentStub = {
  readyState: 'loading',
  getElementById() { return makeEl(); }, querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener(type, fn) { if (type === 'DOMContentLoaded') domReadyCbs.push(fn); },
  removeEventListener() {},
  elementFromPoint() { return null; }, body: makeEl(), documentElement: makeEl(), pointerLockElement: null,
};

// SEED: a representative saved user FX archive so normalizeFxArchiveSnapshot actually executes
// at boot (the exact path that previously threw `normalizeCoverResolution is not defined`).
const seededStore = JSON.stringify([
  {
    name: 'Regression Test Archive', savedAt: Date.now(), createdAt: Date.now(),
    snapshot: {
      preset: 0, coverResolution: 1.2, intensity: 1.0, depth: 0.8, point: 1.0, speed: 1.0, twist: 0.1,
      color: 1.0, scatter: 0.1, bgFade: 0.5, bloomStrength: 0.5, lyricGlowStrength: 0.4, lyricScale: 1.0,
      lyricOffsetX: 0, lyricOffsetY: 0, lyricOffsetZ: 0, lyricTiltX: 0, lyricTiltY: 0, lyricLetterSpacing: 0,
      lyricLineHeight: 1.0, lyricWeight: 700, lyricColor: '#ffffff', lyricHighlightColor: '#00f5d4',
      lyricGlowColor: '#00f5d4', lyricFont: 'default', shelf: 'off', shelfCameraMode: 'dynamic',
      shelfPresence: 'auto', shelfSize: 1.0, shelfOffsetX: 0, shelfOffsetY: 0, shelfOffsetZ: 0, shelfAngleY: 0,
      shelfOpacity: 1, shelfBgOpacity: 0.9, shelfAccentColor: '#00f5d4', cam: 'off', visualPresetSchema: 'v1',
    },
  },
]);

const sandbox = {
  THREE: new Proxy({}, { get: (t, p) => makeChain('THREE.' + String(p)) }),
  document: documentStub, console,
  performance: { now: () => 0 },
  localStorage: { getItem: () => seededStore, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(''), blob: () => Promise.resolve({}) }),
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, navigator: {}, location: {}, addEventListener() {}, removeEventListener() {},
  Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
  Symbol, Promise, Proxy, Set, Map, parseInt, parseFloat, isNaN, isFinite, Uint8Array, Float32Array,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

let failed = false;
for (const f of FILES) {
  const fp = resolveFile(f);
  if (!fs.existsSync(fp)) { console.log(`[SKIP] ${f} missing`); continue; }
  try { vm.runInContext(fs.readFileSync(fp, 'utf8'), ctx, { filename: f }); console.log(`[OK]   ${f}`); }
  catch (e) { failed = true; console.log(`[FAIL] ${f}: ${e.constructor.name}: ${e.message}`); }
}

// Fire DOMContentLoaded AFTER all scripts (real order) to exercise the deferred bootstrap path too.
if (domReadyCbs.length) {
  for (const cb of domReadyCbs) {
    try { cb(); } catch (e) { failed = true; console.log(`[DOM FAIL] ${e.constructor.name}: ${e.message}`); }
  }
}

console.log(failed
  ? '\nRESULT: FAIL — top-level boot threw (load-order hazard PRESENT)'
  : '\nRESULT: PASS — top-level boot clean with a stored FX archive (normalizeCoverResolution resolved)');
process.exit(failed ? 1 : 0);
