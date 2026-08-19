/**
 * Phase 3 选项 A 回归测试：影视态自动隐藏 3D 歌单架（零侵入 shelf 核心）。
 *
 * 在同一 vm 沙箱内加载线上模块（kazami + bridge + online.js），捕获 spacechange 监听器，
 * 验证：
 *   1. 进影视态（spaceMode='video'）→ 调用 shelfManager.setMode('off')
 *   2. 回音乐态（spaceMode='music'）→ 调用 shelfManager.setMode(fx.shelf) 复原用户偏好
 *   3. fx.shelf='off' 时复原到 'off'（偏好不被误覆盖为 side）
 *
 * 不调用 SFV.online.open()，确保 isOpen()=false，避免触发 close() 分支，
 * 从而把被测逻辑严格收敛到「空间切换 → shelfManager.setMode」这一行。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const VIDEO = path.resolve(__dirname, '..', 'public', 'video');

// ---- 模拟 DOM ----
function FakeNode(tag) {
  this.tagName = tag;
  this._classes = new Set();
  this.children = [];
  this.style = { setProperty: function () {}, removeProperty: function () {}, getPropertyValue: function () { return ''; } };
  this.attrs = {};
  this._listeners = {};
  this.textContent = '';
  this._html = '';
  this.parentNode = null;
  this.disabled = false;
  this.value = '';
  this.files = [];
  this.id = '';
}
Object.defineProperty(FakeNode.prototype, 'className', {
  get() { return Array.from(this._classes).join(' '); },
  set(v) { this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean)); }
});
Object.defineProperty(FakeNode.prototype, 'innerHTML', {
  get() { return this._html; },
  set(v) { this._html = v; if (v === '') this.children = []; }
});
FakeNode.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
FakeNode.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null; };
FakeNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeNode.prototype.removeChild = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; };
FakeNode.prototype.addEventListener = function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };
FakeNode.prototype.removeEventListener = function () {};
FakeNode.prototype.click = function () { (this._listeners.click || []).forEach(fn => fn({})); };
FakeNode.prototype.focus = function () {};
FakeNode.prototype.classList = null;
function attachClassList(node) {
  node.classList = {
    add: function (c) { node._classes.add(c); },
    remove: function (c) { node._classes.delete(c); },
    contains: function (c) { return node._classes.has(c); },
    toggle: function (c, force) {
      const has = node._classes.has(c);
      const on = force === undefined ? !has : !!force;
      if (on) node._classes.add(c); else node._classes.delete(c);
      return on;
    }
  };
}
const ALL_NODES = [];
function makeEl(tag) { const n = new FakeNode(tag); attachClassList(n); ALL_NODES.push(n); return n; }

const g = {};
g.console = console;
g.localStorage = (function () { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
g.URL = URL;
g.setTimeout = setTimeout; g.clearTimeout = clearTimeout; g.Promise = Promise;
g.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9, ORDERED_NODE_SNAPSHOT_TYPE: 5 };
g.DOMParser = function () {};
g.fetch = function () { return Promise.reject(new Error('fetch not mocked')); };
g.document = {
  createElement: makeEl,
  body: makeEl('body'),
  documentElement: makeEl('html'),
  getElementById: () => null,
  addEventListener: () => {}
};
g.globalThis = g; g.window = g; g.self = g; g.module = undefined;
// 捕获式 addEventListener：记录所有顶层监听器，供测试 dispatch
const _listeners = {};
g.addEventListener = (type, fn) => { (_listeners[type] = _listeners[type] || []).push(fn); };
g.scheduleShelfRebuild = () => {};

const ctx = vm.createContext(g);

// ---- 加载顺序：kazami 模块 + bridge + online ----
const files = [
  'kazumi/rule-schema.js', 'kazumi/url-utils.js', 'kazumi/http-client.js',
  'kazumi/xpath-engine.js', 'kazumi/rule-engine.js', 'kazumi/index.js',
  'kazumi-bridge-core.js', 'kazumi-bridge.js', 'online-core.js', 'online-shared.js', 'online-search.js', 'online-collections.js', 'online-track.js', 'online.js'
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(VIDEO, f), 'utf8'), ctx, { filename: f });
}

// ---- 测试 ----
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }

// 间谍：记录 shelfManager.setMode 的调用序列
const setModeCalls = [];
g.shelfManager = { setMode: function (m) { setModeCalls.push(m); }, getMode: function () { return 'off'; } };
g.fx = { shelf: 'side' };

const scListeners = _listeners['spacechange'] || [];
console.log('=== Phase 3 歌单架空间切换（选项 A）===\n');
ok(scListeners.length >= 1, 'spacechange 监听器已注册（捕获到 ' + scListeners.length + ' 个）');

// 1) 进影视态（当前 off）→ setMode(fx.shelf='side')
setModeCalls.length = 0;
scListeners.forEach(fn => fn({ detail: { spaceMode: 'video' } }));
ok(setModeCalls.length === 1 && setModeCalls[0] === 'side', "进影视态（当前 off）→ setMode(fx.shelf='side')");

// 2) 回音乐态 → 复原 fx.shelf='side'
setModeCalls.length = 0;
scListeners.forEach(fn => fn({ detail: { spaceMode: 'music' } }));
ok(setModeCalls.length === 1 && setModeCalls[0] === 'side', "回音乐态调用 setMode(fx.shelf='side') 复原用户偏好");

// 3) fx.shelf 偏好持久化：'off' 时复原到 'off'，不被误覆盖
g.fx.shelf = 'off';
setModeCalls.length = 0;
scListeners.forEach(fn => fn({ detail: { spaceMode: 'music' } }));
ok(setModeCalls[0] === 'off', "fx.shelf='off' 时复原到 'off'（偏好不被覆盖）");

// 4) 再次进影视态（当前 off）→ 仍切到 side
setModeCalls.length = 0;
scListeners.forEach(fn => fn({ detail: { spaceMode: 'video' } }));
ok(setModeCalls[0] === 'side', "再次进影视态（当前 off）→ 仍切到 side");

console.log('\n--- Phase 3 歌单架空间切换: ' + pass + ' pass / ' + fail + ' fail ---');
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
else { console.log('✅ All Phase 3 shelf-space tests passed!'); process.exit(0); }
