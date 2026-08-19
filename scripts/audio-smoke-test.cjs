/* audio-smoke-test.cjs — safety net for the 01 (audio-engine) extraction.
   Loads the built classic scripts in REAL index.html order inside a vm sandbox
   (stubbing THREE / DOM / Web Audio / Worker), then exercises the audio engine's
   core call paths to catch REGRESSIONS the load-order harness (top-level only)
   cannot: initAudio() graph construction, gain ramps, and the tempo-analysis
   entry points. Runs BEFORE and AFTER the 04d extraction; must stay green.

   Usage: node scripts/audio-smoke-test.cjs
   Exit code: 0 = pass, 1 = fail. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '..', 'public', 'assets');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// Same load order as index.html (04e inserted after 04d, before 08).
const FILES = ['equalizer-core.js', '02-equalizer-glue.js', 'music.js', 'globals-bridge.js',
  '04a-three-host.js', '04b-shelf-3d.js', '04c-lyrics.js', '04d-audio-beat.js', '04e-audio-engine.js', '08-fx-visual.js'];

function resolveFile(f) {
  const inAssets = path.join(ASSET_DIR, f);
  if (fs.existsSync(inAssets)) return inAssets;
  return path.join(PUBLIC_DIR, f);
}

// ---- minimal DOM / THREE stubs (same philosophy as _loadorder_harness) ----
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
  // Mirror _loadorder_harness: readyState 'loading' so the legacy startup sequence
  // registers a DOMContentLoaded handler instead of firing synchronously at the
  // music.js top level (which would run BEFORE 04a/04b/04c/08 are loaded and trip).
  readyState: 'loading',
  getElementById() { return makeEl(); }, querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener(type, fn) { if (type === 'DOMContentLoaded') domReadyCbs.push(fn); },
  removeEventListener() {},
  elementFromPoint() { return null; }, body: makeEl(), documentElement: makeEl(), pointerLockElement: null,
};

// ---- Web Audio stubs ----
function makeAudioParam() {
  return {
    value: 0,
    setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
  };
}
function makeAudioNode() {
  const n = {
    connect() { return n; }, disconnect() {}, start() {}, stop() {},
    gain: makeAudioParam(), frequency: makeAudioParam(), Q: makeAudioParam(), detune: makeAudioParam(),
    // DynamicsCompressor params (createEqualizerAudioGraph sets limiter.threshold/knee/ratio/attack/release).
    threshold: makeAudioParam(), knee: makeAudioParam(), ratio: makeAudioParam(),
    attack: makeAudioParam(), release: makeAudioParam(),
    fftSize: 2048, smoothingTimeConstant: 0, frequencyBinCount: 1024,
    getByteFrequencyData() {}, getByteTimeDomainData() {}, getFloatFrequencyData() {},
    buffer: null, type: 'peaking',
  };
  return n;
}
class FakeAudioContext {
  constructor() { this.sampleRate = 44100; this.state = 'running'; this.destination = makeAudioNode(); }
  createMediaElementSource() { return makeAudioNode(); }
  createAnalyser() { return makeAudioNode(); }
  createGain() { return makeAudioNode(); }
  createBufferSource() { return makeAudioNode(); }
  createBiquadFilter() { return makeAudioNode(); }
  createDynamicsCompressor() { return makeAudioNode(); }
  createBuffer() { return { getChannelData() { return new Float32Array(1); } }; }
  decodeAudioData() { return Promise.resolve({ getChannelData() { return new Float32Array(1); } }); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
class FakeOfflineAudioContext extends FakeAudioContext {
  constructor() { super(); this.length = 1; this.numberOfChannels = 2; }
  startRendering() { return Promise.resolve({ getChannelData() { return new Float32Array(1); } }); }
}
class FakeAudio {
  constructor() { this.paused = true; this.volume = 1; this.currentTime = 0; this.muted = false; this.crossOrigin = null; }
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
  removeEventListener() {}
}
class FakeWorker { constructor() { this.onmessage = null; this.onerror = null; } postMessage() {} terminate() {} }
class FakeBlob { constructor() {} }
const fakeUrl = { createObjectURL() { return 'blob:fake'; }, revokeObjectURL() {} };

const sandbox = {
  THREE: new Proxy({}, { get: (t, p) => makeChain('THREE.' + String(p)) }),
  document: documentStub, console,
  performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(''), blob: () => Promise.resolve({}) }),
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, navigator: {}, location: {},
  addEventListener() {}, removeEventListener() {},
  AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext,
  OfflineAudioContext: FakeOfflineAudioContext, webkitOfflineAudioContext: FakeOfflineAudioContext,
  Audio: FakeAudio, Worker: FakeWorker, Blob: FakeBlob, URL: fakeUrl,
  Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
  Symbol, Promise, Proxy, Set, Map, parseInt, parseFloat, isNaN, isFinite, Uint8Array, Float32Array,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

// ---- load scripts in order ----
let loadFailed = false;
for (const f of FILES) {
  const fp = resolveFile(f);
  if (!fs.existsSync(fp)) { console.log(`[SKIP] ${f} missing`); continue; }
  try { vm.runInContext(fs.readFileSync(fp, 'utf8'), ctx, { filename: f }); }
  catch (e) { loadFailed = true; console.log(`[LOAD FAIL] ${f}: ${e.message}`); }
}

// Fire DOMContentLoaded AFTER every classic script has executed (real browser order:
// music → globals-bridge → host → 04b → 04c → 08). This defers runStartupSequence()
// until fx / scene / lyrics modules are present, reproducing the real boot path.
if (domReadyCbs.length) {
  console.log(`--- firing ${domReadyCbs.length} DOMContentLoaded handler(s) ---`);
  for (const cb of domReadyCbs) {
    try { cb(); }
    catch (e) { loadFailed = true; console.log(`[DOM FAIL] handler threw: ${e.message}`); }
  }
}

// ---- assertions ----
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== audio smoke test ===');
const G = sandbox; // globals live on the sandbox

// 1) core audio globals are defined
['initAudio', 'primeManualAudioPlayback', 'rampAudioOutputGain', 'setAudioOutputGainImmediate',
 'ensureMusicTempo', 'getMusicTempoWorkerUrl', 'scheduleBeatAnalysis'].forEach((fn) => {
  check(`global ${fn} is a function`, typeof G[fn] === 'function');
});

// 2) prime playback element, then build the audio graph
try {
  G.primeManualAudioPlayback();
  check('primeManualAudioPlayback set audio element', G.audio != null);
  G.initAudio();
  check('initAudio() built graph', G.audioReady === true && G.audioCtx != null && G.analyser != null && G.gainNode != null,
    `audioReady=${G.audioReady} audioCtx=${G.audioCtx != null} analyser=${G.analyser != null} gainNode=${G.gainNode != null}`);
} catch (e) {
  check('initAudio() did not throw', false, e.message);
}

// 3) gain ramp should not throw and should move the gain param
try {
  G.rampAudioOutputGain(0.5, 120);
  G.setAudioOutputGainImmediate(0.8);
  check('gain ramp functions executed', true);
} catch (e) {
  check('gain ramp functions executed', false, e.message);
}

// 4) tempo-analysis entry points callable without throwing
try {
  G.ensureMusicTempo();
  check('ensureMusicTempo() did not throw', true);
} catch (e) {
  check('ensureMusicTempo() did not throw', false, e.message);
}
try {
  G.scheduleBeatAnalysis('song-1', 'https://example.com/a.mp3', 'tok', { title: 't' });
  check('scheduleBeatAnalysis() did not throw', true);
} catch (e) {
  check('scheduleBeatAnalysis() did not throw', false, e.message);
}

console.log(`\nRESULT: ${fail === 0 && !loadFailed ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed${loadFailed ? ' (load errors)' : ''}`);
process.exit(fail === 0 && !loadFailed ? 0 : 1);
