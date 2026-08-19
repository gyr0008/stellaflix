/*
 * T157 验证：影视态全部分页的搜索按钮穿透修复
 * 加载真实 online-nav.js + nav.js，用 DOM 桩验证：
 *   1) goToNav('movie'/'collections') / openPage('history') / open({}) 均给 body 加 sfv-browse-active、
 *      且不再残留 sfv-collections-active；
 *   2) close() 移除 sfv-browse-active；
 *   3) #sfv-nav 顶栏搜索按钮点击 → 调用 _sfvTryToggleSearch（即打开影视全页搜索）。
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Administrator/Desktop/Mineradio-Extended-1.1.2-extended.1';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- 假 DOM ----
function makeClassList(el) {
  return {
    add() { for (const c of arguments) if (el._classes.indexOf(c) < 0) el._classes.push(c); },
    remove() { for (const c of arguments) { const i = el._classes.indexOf(c); if (i >= 0) el._classes.splice(i, 1); } },
    contains(c) { return el._classes.indexOf(c) >= 0; },
    toggle(c, force) {
      const has = el._classes.indexOf(c) >= 0;
      const want = force === undefined ? !has : !!force;
      if (want && !has) el._classes.push(c);
      if (!want && has) { const i = el._classes.indexOf(c); el._classes.splice(i, 1); }
      return want;
    },
  };
}
function makeStyle() {
  const store = {};
  return {
    setProperty(k, v) { store[k] = v; },
    removeProperty(k) { delete store[k]; },
    _store: store,
  };
}
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _classes: [],
    id: '',
    type: '',
    title: '',
    textContent: '',
    innerHTML: '',
    style: makeStyle(),
    children: [],
    attrs: {},
    _listeners: {},
    classList: null,
    appendChild(c) { this.children.push(c); if (c && c.id) registry[c.id] = c; return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    closest() { return null; },
    querySelectorAll(sel) {
      const cls = String(sel).replace(/^\./, '');
      const out = [];
      const walk = (n) => { for (const c of n.children) { if (c._classes && c._classes.indexOf(cls) >= 0) out.push(c); walk(c); } };
      walk(this);
      return out;
    },
    querySelector(sel) {
      const cls = String(sel).replace(/^\./, '');
      let found = null;
      const walk = (n) => { for (const c of n.children) { if (!found && c._classes && c._classes.indexOf(cls) >= 0) found = c; else walk(c); } };
      walk(this);
      return found;
    },
    click() {
      const hs = this._listeners.click || [];
      const ev = { preventDefault() {}, stopPropagation() {} };
      for (const h of hs) h.call(this, ev);
    },
  };
  el.classList = makeClassList(el);
  return el;
}

const registry = {};
const body = makeEl('body');
const documentElement = makeEl('html');
const document = {
  body,
  documentElement,
  readyState: 'complete',
  createElement: (t) => makeEl(t),
  getElementById: (id) => registry[id] || null,
  addEventListener() {},
};

// ---- SFV 共享状态桩 ----
const toggleSearchMock = { called: 0 };
const sandbox = {};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.console = console;
sandbox.setTimeout = setTimeout;
sandbox.localStorage = { getItem: () => null, setItem: () => {} };
sandbox.scrollTo = () => {};
sandbox.showToast = () => {};
sandbox.document = document;
sandbox.addEventListener = () => {};

const S = {
  d: () => document,
  el: (tag, cls, text) => { const e = makeEl(tag); if (cls) e.classList.add(cls); if (text != null) e.textContent = text; return e; },
  isVideoSpace: () => true,
  closeSearchPage() { this._closeSearchCalled = (this._closeSearchCalled || 0) + 1; },
  router: { go() {}, setHost() {} },
  pageBgDiy: { sync() {} },
  nav: { paintActive() {} },
  state: { EVENT: 'spacechange', setSpace() {} },
  openLocal() {}, openUrlPrompt() {}, openSources() {},
  searchInput: null,
  toast() {},
  hasSources: () => null,
  sourceById: () => null,
  backToTop: { init() {} },
  browse3d: { isActive: () => false, deactivate() {} },
  home: { render() {} },
};
const OC = {};
const SFV = {
  onlineShared: S,
  onlineCore: OC,
  router: S.router,
  pageBgDiy: S.pageBgDiy,
  state: S.state,
  backToTop: S.backToTop,
  browse3d: S.browse3d,
  home: S.home,
  // 注意：SFV.nav 不预置（保持 undefined），让 nav.js 的 IIFE 正常构建；
  // 若预置则触发 nav.js 顶部幂等守卫 `if (SFV.nav) return;` 而跳过挂载。
};
sandbox.StellaflixVideo = SFV;
sandbox._sfvTryToggleSearch = function () { toggleSearchMock.called++; };

vm.createContext(sandbox);

// ---- 加载真实模块 ----
vm.runInContext(read('public/video/online-nav.js'), sandbox, { filename: 'online-nav.js' });
vm.runInContext(read('public/video/nav.js'), sandbox, { filename: 'nav.js' });

// 导航搜索按钮需经 SFV.online.toggleSearchPage 兜底，也挂上
SFV.online = { toggleSearchPage() { toggleSearchMock.called++; } };

// ---- 断言工具 ----
let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}
function has(cls) { return body.classList.contains(cls); }

console.log('--- T157 场景验证 ---');
// 注：online-nav.js 将生命周期函数导出到 SFV.onlineNav（也部分注册到 S=SFV.onlineShared，
// 但 open/close 仅挂在 SFV.onlineNav）。统一用 SFV.onlineNav 作为 API。
const api = SFV.onlineNav;

assert('goToNav 存在', typeof api.goToNav === 'function');
assert('openPage 存在', typeof api.openPage === 'function');
assert('open 存在', typeof api.open === 'function');
assert('close 存在', typeof api.close === 'function');

// 场景1：电影分页（page 模式）
api.goToNav('movie');
assert('goToNav(movie) → body 含 sfv-browse-active', has('sfv-browse-active'));
assert('goToNav(movie) → 不再残留 sfv-collections-active', !has('sfv-collections-active'));

// 场景2：片单分页（fullscreen 模式）
api.goToNav('collections');
assert('goToNav(collections) → body 含 sfv-browse-active', has('sfv-browse-active'));
assert('goToNav(collections) → 不再残留 sfv-collections-active', !has('sfv-collections-active'));

// 场景3：观看历史（router page 模式）
api.openPage('history', '观看历史');
assert('openPage(history) → body 含 sfv-browse-active', has('sfv-browse-active'));

// 场景4：category 浏览（汇联/世界，open 无 mode 走 else 分支，避免 render 依赖）
api.open({});
assert('open({}) → body 含 sfv-browse-active', has('sfv-browse-active'));

// 场景5：退出浏览层 → 移除 sfv-browse-active
api.close();
assert('close() → body 移除 sfv-browse-active', !has('sfv-browse-active'));

// 场景6：顶栏搜索按钮点击 → 触发搜索
// 注：nav.js 在浏览器靠 DOMContentLoaded 触发 autoMount；vm 桩中 DOMContentLoaded 不触发，
// 故此处显式 mount 以模拟挂载（真实 Electron 环境由 DOMContentLoaded 自动完成）。
if (SFV.nav && typeof SFV.nav.mount === 'function') SFV.nav.mount(document.body);
const searchBtn = document.getElementById('sfv-nav-search-btn');
assert('顶栏搜索按钮 #sfv-nav-search-btn 已挂载', !!searchBtn);
if (searchBtn) {
  const before = toggleSearchMock.called;
  searchBtn.click();
  assert('点击顶栏搜索按钮 → 触发 _sfvTryToggleSearch/toggleSearchPage', toggleSearchMock.called === before + 1);
}

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
