/**
 * Phase 2 online.js 接线集成测试（真实代码路径）
 *
 * 在同一 vm 沙箱内加载：6 个 Kazumi 模块 + kazumi-bridge.js + online.js，
 * 配模拟 DOM + 模拟网络/XPath，验证：
 *   1. 搜索合并：CMS10 结果 + Kazumi 结果进入同一网格（2 张卡片）
 *   2. Kazumi 卡片带 sfv-card--kazumi 标记
 *   3. 点击 Kazumi 卡片 → openKazumiDetail → renderDetail（Phase 1.5 toast 占位，不再抓章节）
 *      → SFV.ui.toast 弹出「详情页开发中，敬请期待」
 *
 * 不 mock online.js 本身，也尽量不 mock 桥接层（只 mock 最底层网络与 XPath）。
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
FakeNode.prototype.removeChild = function (c) {
  const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c;
};
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
function makeEl(tag) {
  const n = new FakeNode(tag);
  attachClassList(n);
  ALL_NODES.push(n);
  return n;
}

FakeNode.prototype.closest = function (sel) {
  var node = this;
  while (node) {
    if (sel[0] === '[') { if (node.getAttribute && node.getAttribute(sel.slice(1, -1)) != null) return node; }
    else if (sel[0] === '.') { if (node._classes && node._classes.has(sel.slice(1))) return node; }
    else if (sel[0] === '#') { if (node.id === sel.slice(1)) return node; }
    node = node.parentNode;
  }
  return null;
};

const ALL_NODES = [];
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
  createTextNode: function (t) { const n = makeEl('#text'); n.textContent = String(t); return n; },
  body: makeEl('body'),
  documentElement: makeEl('html'),
  getElementById: () => null,
  _docListeners: {},
  addEventListener: function (t, fn) { (g.document._docListeners[t] = g.document._docListeners[t] || []).push(fn); }
};
g.globalThis = g; g.window = g; g.self = g;
g.module = undefined;
g.addEventListener = () => {};
g.scrollTo = function () {}; // 真实浏览器有，桩补齐（unlockBodyScroll 用到）
g.scheduleShelfRebuild = () => {};

const ctx = vm.createContext(g);

// ---- 加载顺序：kazumi 模块 + bridge + online ----
const files = [
  'kazumi/rule-schema.js', 'kazumi/url-utils.js', 'kazumi/http-client.js',
  'kazumi/xpath-engine.js', 'kazumi/rule-engine.js', 'kazumi/index.js',
  'kazumi-bridge-core.js', 'kazumi-bridge.js', 'online-core.js', 'online-shared.js', 'online-search-render.js', 'online-search.js', 'online-collections.js', 'online-track.js', 'online-nav.js', 'online-detail.js', 'online-actions.js', 'online.js'
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(VIDEO, f), 'utf8'), ctx, { filename: f });
}

// ---- 预置 SFV 桩（online.js 依赖） ----
const CMS_ITEM = {
  key: 's1:42', title: 'CMS Movie', pic: 'https://cms/p.jpg', year: '2024',
  variants: [{ sourceId: 's1', vodId: '42' }]
};
const SFV = g.StellaflixVideo;
SFV.state = { isVideo: () => true, setSpace: () => {}, EVENT: 'spacechange' };
SFV.sources = {
  getEnabledSources: () => [{ id: 's1', name: 'CMS', api: 'https://cms.example.com' }],
  getSources: () => [{ id: 's1', name: 'CMS', api: 'https://cms.example.com' }],
  search: (kw) => Promise.resolve({ items: [CMS_ITEM], errors: [] }),
  detail: () => Promise.resolve({ ok: true, plays: [] })
};
SFV.source = { open: () => {}, resolve: () => ({ ok: true, kind: 'hls' }) };
SFV.player = {};
SFV.model = {
  getFlag: () => ({}), toggleFlag: () => {}, setMeta: () => {}, addHistory: () => {},
  getProgress: () => ({}), getKeysByFlag: () => [], resolveList: () => [], getHistory: () => []
};
SFV.home = { toast: () => {} };

// ---- mock 最底层 ----
g.KazumiHttpClient.get = () => Promise.resolve('<html>mocked</html>');
g.KazumiHttpClient.post = () => Promise.resolve('<html>mocked</html>');
g.KazumiXPathEngine.parseSearch = () => ({
  items: [{ name: 'Kazumi Film', src: '/detail/777' }], diagnostics: []
});
g.KazumiXPathEngine.parseChapters = () => ({
  roads: [{ name: '线路A', data: ['https://c.x/a.m3u8', 'https://c.x/b.m3u8'], identifier: ['第1集', '第2集'] }],
  diagnostics: []
});

// 预导入一条 Kazumi 规则并确认启用
SFV.kazumi.importRule({
  name: 'TestRule', type: 'movie', baseURL: 'https://example.com',
  searchURL: '/search?wd=@keyword',
  searchList: '//div', searchName: '//a/text()', searchResult: '//a',
  chapterRoads: '//div', chapterResult: '//a'
});

// ---- 测试工具 ----
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }
function findByClass(node, cls) {
  if (!node || !node.children) return null;
  for (const ch of node.children) {
    if (ch._classes && ch._classes.has(cls)) return ch;
    const deep = findByClass(ch, cls);
    if (deep) return deep;
  }
  return null;
}
function findAllByClass(node, cls, out) {
  out = out || [];
  if (!node || !node.children) return out;
  for (const ch of node.children) {
    if (ch._classes && ch._classes.has(cls)) out.push(ch);
    findAllByClass(ch, cls, out);
  }
  return out;
}

(async function () {
  console.log('=== Phase 2 online.js 接线集成测试 ===\n');

  // ---- 注入搜索页 DOM 桩（取代已废弃的浏览层 inline 搜索栏）----
  const byId = {};
  function injectEl(id, tag) {
    const n = makeEl(tag);
    n.id = id;
    byId[id] = n;
    return n;
  }
  injectEl('sfv-search-page', 'div');
  injectEl('sfv-search-input', 'input');
  injectEl('sfv-search-result-area', 'div');
  injectEl('sfv-history-drop', 'div');
  injectEl('sfv-history-drop-list', 'div');
  g.document.getElementById = (id) => (id in byId ? byId[id] : null);

  // 间谍：记录 SFV.ui.toast 调用（详情页占位 toast）
  const toastCalls = [];
  const origToast = SFV.ui.toast;
  SFV.ui.toast = function (msg) { toastCalls.push(msg); if (origToast) origToast(msg); };

  // 打开影视浏览层（创建 overlay，供详情渲染宿主）
  SFV.online.open();
  const overlay = findByClass(g.document.body, 'sfv-browse');
  ok(!!overlay, 'online.open() 创建了浏览层 (sfv-browse)');
  ok(overlay && overlay._classes.has('sfv-show'), '浏览层带 sfv-show（已显示）');

  // 打开全页搜索并触发新搜索流（doInlineSearch 取代旧 doSearch / 浏览层搜索栏）
  SFV.online.openSearchPage();
  ok(byId['sfv-search-page']._classes.has('sfv-search-open'), 'openSearchPage 给 #sfv-search-page 加 sfv-search-open');
  SFV.online.doInlineSearch('hero');

  // 等待 Promise.all 解析
  await new Promise(r => setTimeout(r, 80));

  const resultArea = byId['sfv-search-result-area'];
  const grid = findByClass(resultArea, 'sfv-grid');
  ok(!!grid, '搜索后结果区渲染出网格 (sfv-grid)');
  if (grid) {
    const cards = grid.children.filter(c => c._classes.has('sfv-card'));
    ok(cards.length === 2, '网格含 2 张卡片（CMS 1 + Kazumi 1），实得 ' + cards.length);
    const kz = cards.filter(c => c._classes.has('sfv-card--kazumi'));
    ok(kz.length === 1, '其中 1 张带 Kazumi 标记 (sfv-card--kazumi)');

    // 点击 Kazumi 卡片 → openKazumiDetail → renderDetail（Phase 1.5 toast 占位，不再抓章节）
    if (kz.length) {
      kz[0].click();
      await new Promise(r => setTimeout(r, 30));
      ok(toastCalls.some(function (m) { return typeof m === 'string' && m.indexOf('敬请期待') >= 0; }),
        '点击 Kazumi 卡片触发了详情页占位 toast（详情页开发中，敬请期待）');

      // ---- 导航逐级返回回归（修复：详情跨级跳回首页）----
      // 前置状态：点击卡片已令 _detailOrigin='search'、pushView([detail])、overlay 显示、搜索页隐藏。
      ok(!!overlay && overlay._classes.has('sfv-show'), '点击卡片后详情层显示（sfv-show）');
      ok(!byId['sfv-search-page']._classes.has('sfv-search-open'), '进入详情时搜索页已隐藏（未跨级回首页）');
      // 触发返回（详情左上返回钮 / ESC 均经 SFV.online.goBack）
      SFV.online.goBack();
      ok(byId['sfv-search-page']._classes.has('sfv-search-open'), '返回后复原搜索结果页（sfv-search-open 重新点亮）');
      ok(!(overlay && overlay._classes.has('sfv-show')), '返回后详情层隐藏（离开详情）');
      const gridAfter = findByClass(resultArea, 'sfv-grid');
      ok(!!gridAfter, '返回后搜索结果网格仍在（结果未清空，确为逐级回到上一级）');
    }
  }

  // ---- D4 回归：搜索页 × 仅关闭搜索页，绝不关闭整个应用 ----
  (function testD4CloseButton() {
    // 间谍：记录是否触发了"关闭应用"路径（desktopWindow.close / closeWindow）
    var appClosed = false;
    g.closeWindow = function () { appClosed = true; };
    g.desktopWindow = { close: function () { appClosed = true; } };
    // 构造一个真实可命中 [data-sfv-search-quit] 的 × 按钮（挂在 document.body 下，供 closest 回溯）
    var xBtn = makeEl('button');
    xBtn.className = 'sfv-search-appbar-close';
    xBtn.setAttribute('data-sfv-search-quit', '');
    g.document.body.appendChild(xBtn);
    // 派发一次 document 级 click（与 doc.addEventListener('click', ..., true) 捕获阶段等价）
    var ev = { target: xBtn, preventDefault: function () {}, stopPropagation: function () {} };
    (g.document._docListeners.click || []).forEach(function (fn) { fn(ev); });
    ok(!byId['sfv-search-page']._classes.has('sfv-search-open'), 'D4: 点击 × 后搜索页被关闭（closeSearchPage 生效）');
    ok(!appClosed, 'D4: 点击 × 未触发关闭整个应用（desktopWindow.close / closeWindow 未被调用）');
  })();

  // ---- D3 回归：分类→详情→返回，分类滚动位置应保留（render 不再强制 scrollTop=0）----
  (function testD3ScrollPreserve() {
    var Sd = SFV.onlineShared;
    // 隔离渲染器：仅验证 render() 的滚动保存/恢复契约，不依赖 renderCategory/renderDetail 的 DOM 构建
    Sd.renderCategory = function () {};
    Sd.renderDetail = function () {};
    var catView = { mode: 'category' };
    Sd.uiMode = 'view';
    Sd.stack = [catView];
    Sd.current = catView;
    Sd.bodyEl.scrollTop = 842;                 // 模拟用户在分类页滚动到的位置
    Sd.pushView({ mode: 'detail', from: 'category' });
    ok(Sd.bodyEl.scrollTop === 0, 'D3: 进入详情时滚动归零（新视图默认顶部）');
    ok(catView._scroll === 842, 'D3: 离开分类时已记录其滚动位置');
    Sd.goBack();
    ok(Sd.bodyEl.scrollTop === 842, 'D3: 返回分类后滚动位置复原（修复前恒为 0）');
  })();

  // ---- D5 回归：页面 tab → 详情 → 返回，应回到发起分页而非整层关闭回首页 ----
  (function testD5PageDetailReturn() {
    var Sd = SFV.onlineShared;
    // 桩：goToNav 返回发起页所需依赖（router.js 未载入测试沙箱，用桩模拟）
    var navPainted = null;
    SFV.nav = { paintActive: function (k) { navPainted = k; } };
    var routerGoCalls = [];
    SFV.router = { currentId: function () { return 'movie'; }, go: function (id) { routerGoCalls.push(id); } };
    SFV.pageBgDiy = { sync: function () {} };
    // 隔离渲染器（仅验证导航契约，不依赖 renderDetail 的 DOM 构建）
    Sd.renderDetail = function () {};
    Sd.renderCategory = function () {};
    // 模拟处于电影分页（uiMode='page'），并设置发起页
    Sd.uiMode = 'page';
    Sd.activePageId = 'movie';
    Sd._returnPageId = null;
    Sd.stack = [];
    Sd.current = null;
    // 从分页进入详情：openDetailFromMeta 内部 ensureOverlayShown 据 uiMode='page' 记 _returnPageId
    Sd.openDetailFromMeta({ key: 's1:99', title: 'D5 Movie', sourceId: 's1' });
    ok(Sd._returnPageId === 'movie', 'D5: 从页面 tab 进入详情时记录了发起页 _returnPageId=movie');
    ok(Sd.stack.length === 1 && Sd.stack[0].mode === 'detail', 'D5: 详情已压入视图栈');
    // 模拟返回
    Sd.goBack();
    ok(routerGoCalls.length === 1 && routerGoCalls[0] === 'movie', 'D5: 返回时经 router.go 重建发起页(movie)，而非 close 回首页');
    ok(Sd._returnPageId === null, 'D5: 返回后 _returnPageId 已清空');
    ok(Sd.uiMode === 'page', 'D5: 返回后 uiMode 恢复为 page（停留在分页）');
    ok(navPainted === 'movie', 'D5: 返回时高亮了发起分页 tab');
  })();

  console.log('\n--------------------------------');
  console.log('Phase 2 online wiring: ' + pass + ' pass / ' + fail + ' fail');
  if (fail) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('✅ All online wiring integration tests passed!');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(1); });
