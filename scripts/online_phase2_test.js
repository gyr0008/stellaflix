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
  body: makeEl('body'),
  documentElement: makeEl('html'),
  getElementById: () => null,
  addEventListener: () => {}
};
g.globalThis = g; g.window = g; g.self = g;
g.module = undefined;
g.addEventListener = () => {};
g.scheduleShelfRebuild = () => {};

const ctx = vm.createContext(g);

// ---- 加载顺序：kazumi 模块 + bridge + online ----
const files = [
  'kazumi/rule-schema.js', 'kazumi/url-utils.js', 'kazumi/http-client.js',
  'kazumi/xpath-engine.js', 'kazumi/rule-engine.js', 'kazumi/index.js',
  'kazumi-bridge.js', 'online.js'
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

  // 间谍：记录 SFV.ui.toast 调用（详情页占位 toast）
  const toastCalls = [];
  const origToast = SFV.ui.toast;
  SFV.ui.toast = function (msg) { toastCalls.push(msg); if (origToast) origToast(msg); };

  // 打开影视浏览层
  SFV.online.open();
  const overlay = findByClass(g.document.body, 'sfv-browse');
  ok(!!overlay, 'online.open() 创建了浏览层 (sfv-browse)');
  ok(overlay && overlay._classes.has('sfv-show'), '浏览层带 sfv-show（已显示）');

  // 触发搜索：填充输入 + 点击搜索按钮
  const input = findByClass(overlay, 'sfv-browse-search-input');
  const btn = findByClass(overlay, 'sfv-browse-search-btn');
  ok(!!input && !!btn, '找到搜索输入框与搜索按钮');
  input.value = 'hero';
  btn.click();

  // 等待 Promise.all 解析
  await new Promise(r => setTimeout(r, 80));

  const body = findByClass(overlay, 'sfv-browse-body');
  const grid = findByClass(body, 'sfv-grid');
  ok(!!grid, '搜索后渲染出网格 (sfv-grid)');
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
    }
  }

  console.log('\n--------------------------------');
  console.log('Phase 2 online wiring: ' + pass + ' pass / ' + fail + ' fail');
  if (fail) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('✅ All online wiring integration tests passed!');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(1); });
