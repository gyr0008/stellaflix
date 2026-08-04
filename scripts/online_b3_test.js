/*
 * B-3 online.js UI 打磨逻辑测试
 * 真实加载 public/video/online.js（vm 沙箱 + mock DOM），验证：
 *   - setNote 三色（info/warn/error）
 *   - doSearch busy 防重复提交 + 源数提示
 *   - 搜索失败/部分失败着色
 *   - 空片源 warn 提示
 * 不改动被测源码。
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// ---- mock DOM ----
class MockEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this._cls = new Set();
    this.style = {};
    this._listeners = {};
    this.attributes = {};
    this._text = '';
    this.disabled = false;
    this.parentNode = null;
    this.value = '';
  }
  get className() { return Array.from(this._cls).join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const s = this._cls;
    return {
      add: (...c) => c.forEach(x => s.add(x)),
      remove: (...c) => c.forEach(x => s.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !s.has(c); f ? s.add(c) : s.delete(c); return f; },
      contains: c => s.has(c)
    };
  }
  set textContent(v) { this._text = v; this.children = []; }
  get textContent() { return this._text; }
  appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(t, fn) {
    (this._listeners[t] = this._listeners[t] || []).push(fn);
    // 测试钩子：捕获搜索输入/按钮引用
    if (this._cls.has('sfv-browse-search-input')) sandbox.__searchInput = this;
    if (this._cls.has('sfv-browse-search-btn')) sandbox.__searchBtn = this;
  }
  dispatch(t, ev) { (this._listeners[t] || []).forEach(fn => fn(ev || {})); }
}

function findByClass(node, cls) {
  if (!node) return null;
  if (node._cls && node._cls.has(cls)) return node;
  for (const c of (node.children || [])) { const f = findByClass(c, cls); if (f) return f; }
  return null;
}

const sandbox = {};
sandbox.console = console;
sandbox.setTimeout = () => 0;
sandbox.addEventListener = () => {};
sandbox.document = {
  createElement: (tag) => new MockEl(tag),
  body: new MockEl('body')
};
sandbox.window = sandbox;
sandbox.StellaflixVideo = {};

// SFV.state / home 桩
sandbox.StellaflixVideo.state = { isVideo: () => true, setSpace: () => {}, EVENT: 'spacechange' };
sandbox.StellaflixVideo.home = { toast: () => {} };

// sources 桩：可注入解析结果
let searchCalls = 0;
let pendingResolve = null, pendingReject = null;
function makeSources(activeCount, mode) {
  return {
    getEnabledSources: () => {
      const arr = [];
      for (let i = 0; i < activeCount; i++) arr.push({ id: 's' + i, name: 'S' + i });
      return arr;
    },
    search: (kw, opts) => {
      searchCalls++;
      return new Promise((res, rej) => { pendingResolve = res; pendingReject = rej; });
    },
    detail: () => Promise.resolve({ ok: true, plays: [] })
  };
}

const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'online.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'online.js' });

const SFV = sandbox.StellaflixVideo;
async function run() {
  // ===== 场景 1：有 2 个片源，搜索中提示含源数 + busy 防重 =====
  SFV.sources = makeSources(2);
  searchCalls = 0; pendingResolve = pendingReject = null;
  SFV.online.open();
  const note = findByClass(sandbox.document.body, 'sfv-browse-note');
  assert(!!note, 'setNote: noteEl exists after open');

  // 第一次点击搜索
  sandbox.__searchInput.value = '测试';
  sandbox.__searchBtn.dispatch('click');
  assert(searchCalls === 1, 'doSearch: first click triggers search once');
  assert(/搜索中…（共 2 个片源/.test(note.textContent), 'doSearch: note shows source count (共 2 个片源)');
  assert(note._cls.has('sfv-browse-note--info'), 'doSearch: searching note is info type');
  assert(sandbox.__searchBtn.disabled === true, 'doSearch: search button disabled while busy');
  assert(sandbox.__searchInput.disabled === true, 'doSearch: search input disabled while busy');

  // 第二次点击（busy 期间）应被防重
  sandbox.__searchBtn.dispatch('click');
  assert(searchCalls === 1, 'doSearch: second click blocked by busy guard (still 1 call)');

  // 解析为「完全失败」——着色 error
  pendingResolve({
    noSource: false,
    errors: [{ name: 'S0', reason: '超时' }],
    items: []
  });
  await new Promise(r => setTimeout(r, 5));
  assert(note._cls.has('sfv-browse-note--error'), 'doSearch: total-failure note is error type');
  assert(/搜索失败：S0\(超时\)/.test(note.textContent), 'doSearch: error note shows source name+reason');
  assert(sandbox.__searchBtn.disabled === false, 'doSearch: button re-enabled after resolve');

  // ===== 场景 2：部分失败（有 items 但带 errors）→ warn =====
  searchCalls = 0; pendingResolve = null;
  SFV.online.open(); // 重新 open 重置栈
  sandbox.__searchInput.value = '测试2';
  sandbox.__searchBtn.dispatch('click');
  pendingResolve({ errors: [{ name: 'S1', reason: 'x' }], items: [{ title: 'a', variants: [] }] });
  await new Promise(r => setTimeout(r, 5));
  assert(note._cls.has('sfv-browse-note--warn'), 'doSearch: partial-failure note is warn type');
  assert(/部分片源不可用：S1/.test(note.textContent), 'doSearch: partial note lists unavailable source');

  // ===== 场景 3：空片源 → renderSearch warn =====
  SFV.sources = makeSources(0);
  SFV.online.open();
  const note2 = findByClass(sandbox.document.body, 'sfv-browse-note');
  assert(note2._cls.has('sfv-browse-note--warn'), 'empty-source: renderSearch note is warn type');
  assert(/尚未添加任何片源/.test(note2.textContent), 'empty-source: prompt to add source shown');

  // ===== 场景 4：搜索未输入关键词直接返回（不触发请求）=====
  searchCalls = 0; SFV.sources = makeSources(2);
  SFV.online.open();
  sandbox.__searchInput.value = '   ';
  sandbox.__searchBtn.dispatch('click');
  assert(searchCalls === 0, 'doSearch: blank keyword triggers no request');

  console.log('\nB-3 online.js: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error('TEST CRASHED:', e); process.exit(1); });
