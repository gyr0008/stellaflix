/* 临时校验：按 index.html 脚本顺序用 vm 加载 public/video 全部 classic 脚本，
   验证 [#11] 新增/改动脚本无加载期 hazard，关键全局符号就绪，collectInfo() 不抛。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = __dirname.replace(/[\\/]scripts$/, '');
const PUBLIC = path.join(ROOT, 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

// 抽取所有 <script src="..."> 相对路径
const scripts = [];
const re = /<script\s+src="([^"]+)"/g;
let m;
while ((m = re.exec(html))) {
  const src = m[1];
  if (src.startsWith('video/') || src.startsWith('assets/')) {
    scripts.push(src);
  }
}
// video 脚本现已由 index.html 的 SFV_SCRIPTS 懒加载器动态注入；从加载器提取 URL 保持一致。
const loaderMatch = html.match(/var SFV_SCRIPTS = \[([\s\S]*?)\];/);
if (loaderMatch) {
  const lm = loaderMatch[1].match(/"([^"]+)"/g) || [];
  for (const s of lm) {
    const src = s.replace(/^"|"$/g, '');
    if (src.startsWith('video/') && scripts.indexOf(src) < 0) scripts.push(src);
  }
}

function makeChain(name) {
  const fn = function () { return makeChain(name + '()'); };
  return new Proxy(fn, {
    get(t, p) {
      if (p === 'then') return undefined;
      if (p === Symbol.toPrimitive) return () => 0;
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

function makeEl() {
  const base = {
    style: styleStub, classList: classListStub,
    appendChild() {}, removeChild() {}, remove() {}, insertBefore() {}, replaceChild() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    title: '', dataset: {}, parentNode: null, firstChild: null, nextSibling: null, childNodes: [],
  };
  return new Proxy(base, {
    get(t, p) { return (p in t) ? t[p] : makeChain('el.' + String(p)); },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const documentStub = {
  readyState: 'complete',
  getElementById() { return makeEl(); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener() {}, removeEventListener() {},
  body: makeEl(), documentElement: makeEl(),
};
const sandbox = {
  document: documentStub, console,
  performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  navigator: {}, location: {}, addEventListener() {}, removeEventListener() {},
  Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
  Symbol, Promise, Proxy, Set, Map, parseInt, parseFloat, isNaN, isFinite,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

let failed = false;
for (const src of scripts) {
  const fp = path.join(PUBLIC, src);
  if (!fs.existsSync(fp)) { console.log(`[SKIP] ${src} (missing on disk)`); continue; }
  const code = fs.readFileSync(fp, 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: src });
  } catch (e) {
    failed = true;
    console.log(`[FAIL] ${src} threw: ${e.constructor.name}: ${e.message}`);
  }
}

// 关键符号断言
const SFV = ctx.StellaflixVideo || {};
const checks = [
  ['SFV.videoInfo.open', !!(SFV.videoInfo && typeof SFV.videoInfo.open === 'function')],
  ['SFV.videoInfo.collectInfo', !!(SFV.videoInfo && typeof SFV.videoInfo.collectInfo === 'function')],
  ['global.sfvOpenTrackDetailOrVideoInfo', typeof ctx.sfvOpenTrackDetailOrVideoInfo === 'function'],
  ['SFV.sourceAdapterHls.getActiveHls', !!(SFV.sourceAdapterHls && typeof SFV.sourceAdapterHls.getActiveHls === 'function')],
  ['SFV.player.getCurrentMeta', !!(SFV.player && typeof SFV.player.getCurrentMeta === 'function')],
];
let symbolOk = true;
for (const [name, ok] of checks) {
  if (!ok) symbolOk = false;
  console.log(`[${ok ? 'OK' : 'MISS'}] ${name}`);
}

// collectInfo() 不应抛（SFV.player.getVideoEl 返回 null、无 HLS 实例时走默认值）
let collectOk = false;
try {
  const info = SFV.videoInfo.collectInfo();
  collectOk = !!(info && typeof info === 'object');
  console.log('[OK] collectInfo() returned object, title=' + JSON.stringify(info.title));
} catch (e) {
  console.log('[FAIL] collectInfo() threw: ' + e.message);
}

console.log('\nRESULT: ' + ((!failed && symbolOk && collectOk) ? 'PASS' : 'ISSUES'));
process.exit((!failed && symbolOk && collectOk) ? 0 : 1);
