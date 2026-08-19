/* load-order hazard harness — simulates browser classic-script global sharing.
   Stubs THREE / document / window so top-level sync init executes.
   requestAnimationFrame is a NO-OP (we must NOT run animate()). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ASSET_DIR = path.join(__dirname, 'public', 'assets');
const PUBLIC_DIR = path.join(__dirname, 'public');
// Real index.html order: equalizer-core.js (39) → 02-equalizer-glue.js (40) load BEFORE
// music.js (3219), then globals-bridge → 04a → 04b → 04c → 04d → 04e → 08 (3220-3226). equalizer-core
// defines window.MineradioEqualizer (defaultState/BAND_FREQUENCIES) used by 02 / the legacy
// startup sequence. 04b/04c/04d/04e must sit after host (uses scene/camera) and before 08 (08 stays last).
const FILES = ['equalizer-core.js', '02-equalizer-glue.js', 'music.js', 'globals-bridge.js', '04a-three-host.js', '04b-shelf-3d.js', '04c-lyrics.js', '04d-audio-beat.js', '04e-audio-engine.js', '08-fx-visual.js'];

// Resolve each classic script from its real on-disk location: most music assets live in
// public/assets/, but some (e.g. equalizer-core.js) sit at the public/ root.
function resolveFile(f) {
  const inAssets = path.join(ASSET_DIR, f);
  if (fs.existsSync(inAssets)) return inAssets;
  return path.join(PUBLIC_DIR, f);
}

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
const classListStub = {
  add() {}, remove() {}, toggle() { return false; }, contains() { return false; },
};

const ctxStub = new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient')
      return () => ({ addColorStop() {} });
    if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (p === 'canvas') return makeEl();
    return function () {};
  },
  set() { return true; },
});

function makeEl() {
  const base = {
    style: styleStub,
    classList: classListStub,
    appendChild() {}, removeChild() {}, remove() {},
    insertBefore() {}, replaceChild() {}, replaceWith() {}, contains() { return false; },
    insertAdjacentElement() {}, insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    closest() { return null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getContext() { return ctxStub; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {}, requestPointerLock() { return undefined; },
    toDataURL() { return ''; },
    title: '', disabled: false, tabIndex: 0, width: 0, height: 0,
    dataset: {},
    // parentNode is read by some DOM-mutation helpers (e.g. parent.insertBefore).
    // Real browsers always provide it; the stub returns a fresh safe element.
    parentNode: null,
    firstChild: null, nextSibling: null, childNodes: [],
  };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) {
        // lazily materialize parentNode / sibling links as safe elements
        if ((p === 'parentNode' || p === 'firstChild' || p === 'nextSibling') && t[p] === null) {
          t[p] = makeEl();
        }
        return t[p];
      }
      // Unknown DOM property → return a safe callable chain so access/method calls
      // never throw (this is a DOM stub gap, NOT a load-order global hazard).
      // Global ReferenceErrors are identifier lookups elsewhere and remain surfaced.
      return makeChain('el.' + String(p));
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const documentStub = {
  readyState: 'loading',
  getElementById() { return makeEl(); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener(type, fn) { if (type === 'DOMContentLoaded') domReadyCbs.push(fn); },
  removeEventListener() {},
  elementFromPoint() { return null; },
  body: makeEl(),
  documentElement: makeEl(),
  pointerLockElement: null,
};
const domReadyCbs = [];

const sandbox = {
  THREE: new Proxy({}, { get: (t, p) => makeChain('THREE.' + String(p)) }),
  document: documentStub,
  console,
  performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: () => 0, // NO-OP: never run animate()
  cancelAnimationFrame: () => {},
  // fetch stub: the sandbox lacks a global fetch (Node's is not injected into vm context).
  // refreshLoginStatus() etc. call fetch asynchronously; this keeps DOMContentLoaded clean.
  fetch: () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve({}),
  }),
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  navigator: {},
  location: {},
  addEventListener() {},
  removeEventListener() {},
  Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
  Symbol, Promise, Proxy, Set, Map, parseInt, parseFloat, isNaN, isFinite,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);

let failed = false;
for (const f of FILES) {
  const fp = resolveFile(f);
  if (!fs.existsSync(fp)) { console.log(`[SKIP] ${f} missing`); continue; }
  const code = fs.readFileSync(fp, 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: f });
    console.log(`[OK]   ${f} executed top-level without throwing`);
  } catch (e) {
    failed = true;
    console.log(`[FAIL] ${f} threw: ${e.constructor.name}: ${e.message}`);
    const frames = (e.stack || '').split('\n').filter(l => l.trim().startsWith('at '));
    console.log(`        ${frames.join('  <-  ')}`);
  }
}
console.log(failed ? '\nRESULT: HAZARD PRESENT (a script threw at top-level sync init)'
                   : '\nRESULT: NO TOP-LEVEL HAZARD (all scripts executed top-level cleanly)');

// Simulate DOMContentLoaded firing AFTER all classic scripts have executed
// (real browser order: music → globals-bridge → host → 08). This validates the
// deferred updateCamera() path runs with fx / applyFreeCameraToCamera available.
if (domReadyCbs.length) {
  console.log(`\n--- firing ${domReadyCbs.length} DOMContentLoaded handler(s) ---`);
  let domFailed = false;
  for (const cb of domReadyCbs) {
    try { cb(); }
    catch (e) {
      domFailed = true;
      console.log(`[DOM FAIL] handler threw: ${e.constructor.name}: ${e.message}`);
    }
  }
  console.log(domFailed
    ? 'DOMContentLoaded phase: at least one handler threw (may include stub artifacts)'
    : 'DOMContentLoaded phase: all handlers executed cleanly');
}
