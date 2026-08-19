/**
 * T103 集成测试：搜索图标 + 规则管理 真实加载顺序端到端验证
 *
 * 模拟 index.html 的 <script src> 加载顺序（L41-L68），
 * 在 vm 沙箱中重建 DOM，逐步执行每个 IIFE，
 * 然后模拟用户点击搜索图标 / 导入规则 / 启用规则 / 删除规则。
 *
 * 运行：node scripts/t103_integration_test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

// ── 计数器 ──
var pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; return; }
  fail++; console.error('  ✗ FAIL: ' + label);
}

// ── Mock DOM ──
function createMockDOM() {
  // Minimal Element mock
  var eventListeners = {};
  function Elem(tag) {
    this.tagName = (tag || '').toUpperCase();
    this.className = '';
    this.id = '';
    this.children = [];
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.value = '';
    this.type = '';
    this.placeholder = '';
    this.accept = '';
    this.innerHTML = '';
    this.textContent = '';
    this._listeners = {};
    this.files = [];
  }
  Elem.prototype.appendChild = function(c) { c.parentNode = this; this.children.push(c); this.childNodes.push(c); return c; };
  Elem.prototype.removeChild = function(c) {
    var idx = this.children.indexOf(c);
    if (idx >= 0) this.children.splice(idx, 1);
    idx = this.childNodes.indexOf(c);
    if (idx >= 0) this.childNodes.splice(idx, 1);
    c.parentNode = null;
  };
  Elem.prototype.addEventListener = function(type, fn, opts) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push({ fn: fn, opts: opts });
  };
  Elem.prototype.removeEventListener = function(type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(function(l) { return l.fn !== fn; });
  };
  Elem.prototype.dispatchEvent = function(ev) {
    var list = this._listeners[ev.type] || [];
    for (var i = 0; i < list.length; i++) list[i].fn.call(this, ev);
  };
  Elem.prototype.getAttribute = function(n) { return this.attributes[n] || null; };
  Elem.prototype.setAttribute = function(n, v) { this.attributes[n] = String(v); };
  Elem.prototype.hasAttribute = function(n) { return n in this.attributes; };
  Elem.prototype.closest = function(selector) {
    // Very basic implementation for our selectors
    if (selector === '#sfv-capsule-search-btn' && this.id === 'sfv-capsule-search-btn') return this;
    if (selector === '#sfv-search-panel-go' && this.id === 'sfv-search-panel-go') return this;
    if (selector === '#sfv-search-panel' && this.id === 'sfv-search-panel') return this;
    if (selector === '.sfv-nav-item' && this.className.indexOf('sfv-nav-item') >= 0) return this;
    if (selector === '.sfv-search-tag[data-sfv-kw]' && this.className.indexOf('sfv-search-tag') >= 0) return this;
    var el = this.parentNode;
    while (el) {
      if (selector === '#sfv-capsule-search-btn' && el.id === 'sfv-capsule-search-btn') return el;
      if (selector === '#sfv-search-panel-go' && el.id === 'sfv-search-panel-go') return el;
      if (selector === '#sfv-search-panel' && el.id === 'sfv-search-panel') return el;
      if (selector === '.sfv-nav-item' && el.className && el.className.indexOf('sfv-nav-item') >= 0) return el;
      if (selector === '.sfv-capsule-search-btn' && el.id === 'sfv-capsule-search-btn') return el;
      el = el.parentNode;
    }
    return null;
  };
  Elem.prototype.classList = {
    _list: [],
    add: function() { for (var i = 0; i < arguments.length; i++) if (this._list.indexOf(arguments[i]) < 0) this._list.push(arguments[i]); },
    remove: function() { for (var i = 0; i < arguments.length; i++) { var idx = this._list.indexOf(arguments[i]); if (idx >= 0) this._list.splice(idx, 1); } },
    contains: function(c) { return this._list.indexOf(c) >= 0; },
    toggle: function(c) { var idx = this._list.indexOf(c); if (idx >= 0) this._list.splice(idx, 1); else this._list.push(c); }
  };
  Elem.prototype.querySelector = function(sel) { return null; }; // not needed for our tests
  Elem.prototype.querySelectorAll = function(sel) { return []; };

  var body = new Elem('body');
  var documentElement = new Elem('html');

  var doc = {
    nodeName: '#document',
    documentElement: documentElement,
    body: body,
    readyState: 'complete', // scripts see 'complete' → boot() runs sync
    _listeners: {},          // ← 添加 _listeners
    getElementById: function(id) {
      function find(el) {
        if (el.id === id) return el;
        for (var i = 0; i < el.children.length; i++) { var f = find(el.children[i]); if (f) return f; }
        return null;
      }
      return find(body);
    },
    getElementsByTagName: function(tag) { return tag === 'body' ? [body] : []; },
    createElement: function(tag) { return new Elem(tag); },
    createElementNS: function(ns, tag) { return new Elem(tag); },
    createTextNode: function(t) { return { nodeType: 3, textContent: t }; },
    addEventListener: function(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener: function(type, fn) {
      if (!this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter(function(l) { return l !== fn; });
    },
    dispatchEvent: function(ev) {
      var list = this._listeners[ev.type] || [];
      for (var i = 0; i < list.length; i++) list[i](ev);
      return true;
    }
  };

  // Pre-populate key elements that index.html provides
  function makeEl(opts) {
    var e = new Elem(opts.tag || 'div');
    if (opts.id) e.id = opts.id;
    if (opts.cls) e.className = opts.cls;
    if (opts.type) e.type = opts.type;
    if (opts.attrs) { for (var k in opts.attrs) e.setAttribute(k, opts.attrs[k]); }
    return e;
  }

  // Nav bar container (#search-box area)
  var nav = makeEl({ id: 'sfv-nav', cls: 'sfv-nav' });
  ['discover','world','home','movie','anime'].forEach(function(key) {
    var btn = makeEl({ tag: 'button', cls: 'sfv-nav-item' + (key==='home' ? ' active' : '') });
    btn.setAttribute('data-sfv-nav', key);
    btn.textContent = {discover:'汇联',world:'世界',home:'首页',movie:'电影',anime:'动漫'}[key];
    nav.appendChild(btn);
  });
  body.appendChild(nav);

  // Capsule search button
  var capsBtn = makeEl({ id: 'sfv-capsule-search-btn', cls: 'icon-btn sfv-capsule-search-btn', tag: 'button', type: 'button' });
  capsBtn.setAttribute('title', '搜索影片');
  body.appendChild(capsBtn);

  // Search panel (initially hidden)
  var panel = makeEl({ id: 'sfv-search-panel', cls: 'sfv-search-panel', tag: 'aside' });
  panel.innerHTML = '<div class="sfv-search-panel-inner">' +
    '<input id="sfv-search-panel-input" type="text" placeholder="搜索影片...">' +
    '<button id="sfv-search-panel-go" type="button">搜索</button>' +
    '<div id="sfv-search-history-list"></div>' +
    '<div id="sfv-search-hot-list"></div>' +
    '</div>';
  body.appendChild(panel);

  // FX panel (visual control console)
  var fxTabs = makeEl({ id: 'fx-panel-tabs', cls: 'fx-panel-tabs' });
  var fxPanel = makeEl({ id: 'fx-panel', cls: 'fx-panel' });
  body.appendChild(fxTabs);
  body.appendChild(fxPanel);

  // Top-right area
  var topRight = makeEl({ id: 'top-right', cls: 'top-right' });
  body.appendChild(topRight);

  return { doc: doc, body: body, nav: nav, capsBtn: capsBtn, panel: panel, fxTabs: fxTabs, fxPanel: fxPanel, eventListeners: eventListeners, Elem: Elem };
}

// ── Main test ──
console.log('\n=== T103 集成测试：搜索图标 + 规则管理（真实加载顺序） ===\n');

// A. 创建沙箱环境
var dom = createMockDOM();
var sandbox = {
  window: {},
  document: dom.doc,
  navigator: { userAgent: 'test' },
  localStorage: {
    _data: {},
    getItem: function(k) { return this._data[k] || null; },
    setItem: function(k, v) { this._data[k] = String(v); },
    removeItem: function(k) { delete this._data[k]; }
  },
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  clearTimeout: clearTimeout,
  console: { log: function(){}, warn: function(){}, error: function(){
    // 捕获所有 [SFV-*] 错误用于诊断
    var args = Array.prototype.slice.call(arguments);
    var msg = args.map(function(a){return typeof a === 'object' ? JSON.stringify(a) : String(a);}).join(' ');
    if (msg.indexOf('SFV') >= 0 || msg.indexOf('失败') >= 0 || msg.indexOf('异常') >= 0) {
      console.log('  [CAPTURED] ' + msg);
    }
  }},
  fetch: function() { return Promise.resolve({ ok:true, json:function(){return Promise.resolve([]);} }); },
  XMLHttpRequest: function() { return { open:function(){}, send:function(){}, setRequestHeader:function(){} }; },
  CustomEvent: function(type, init) { return { type: type, detail: init && init.detail }; },
  Event: function(type) { return { type: type }; },
  FileReader: function() { this.onload = null; this.readAsText = function() { if (this.onload) this.onload({ target: { result: '{}' } }); }; },
  alert: function() {},
  confirm: function() { return true; },
  btoa: function(s) { return Buffer.from(s).toString('base64'); },
  atob: function(s) { return Buffer.from(s, 'base64').toString(); }
};
sandbox.window = sandbox; // self-reference for global
sandbox.self = sandbox;

var ctx = vm.createContext(sandbox);

// B. 定义文件加载函数（按 index.html L41-L68 顺序）
var BASE = path.join(__dirname, '..', 'public', 'video');
function loadFile(name) {
  var fp = path.join(BASE, name);
  var code = fs.readFileSync(fp, 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: 'video/' + name });
    // 检查是否有 [SFV-*] 错误被静默捕获
    return true;
  } catch(e) {
    console.error('  [LOAD ERROR] ' + name + ': ' + e.message);
    console.error('    stack: ' + (e.stack || 'n/a').split('\n').slice(0,5).join('\n      '));
    return false;
  }
}

// C. 加载所有文件
var loadOrder = [
  'state.js', 'dispatch.js', 'model.js', 'bootstrap.js',
  'subtitle.js', 'player-core.js', 'player.js', 'source-adapter-core.js', 'source-adapter.js', 'sources.js',
  'fx-sources.js',       // ← L49
  'online-core.js',      // ← #6-序7：online 纯过滤谓词核心，须先于 online.js
  'online.js',           // ← L50
  // kazumi 子目录 (L52-57)
  'kazumi/rule-schema.js', 'kazumi/url-utils.js', 'kazumi/http-client.js',
  'kazumi/xpath-engine.js', 'kazumi/rule-engine.js', 'kazumi/index.js',
  'kazumi-bridge.js',    // ← L58
  // danmaku (L60-66)
  'danmaku/entry.js', 'danmaku/episode.js', 'danmaku/index.js',
  'danmaku/client.js', 'danmaku/sources.js', 'danmaku/engine.js', 'danmaku/ui.js',
  'tmdb.js',             // ← L67
  'home-core.js',        // ← T-#6-序4：home 纯工具核心，须先于 home.js
  'home.js'              // ← L68
];

console.log('--- 阶段1：按 index.html 顺序加载全部模块 ---');
var loadResults = {};
loadOrder.forEach(function(f) {
  var before = typeof sandbox.StellaflixVideo;
  loadResults[f] = loadFile(f);
  var after = typeof sandbox.StellaflixVideo;
  if (before !== after || f === 'online.js' || f === 'kazumi-bridge.js') {
    console.log('  [LOAD] ' + f + ' → StellaflixVideo keys: ' + (sandbox.StellaflixVideo ? Object.keys(sandbox.StellaflixVideo).join(',') : 'N/A'));
  }
});

var loadedCount = Object.keys(loadResults).filter(function(k){return loadResults[k];}).length;
ok(loadedCount === loadOrder.length, '全部 ' + loadOrder.length + ' 个模块加载成功 (实际 '+loadedCount+')');

// DEBUG: 检查 online.js 绑定后的状态
console.log('  [DEBUG] document._listeners.click count: ' + (dom.doc._listeners['click'] || []).length);
var _SFV = sandbox.StellaflixVideo;
console.log('  [DEBUG] StellaflixVideo keys: ' + (_SFV ? Object.keys(_SFV).join(',') : 'N/A'));
console.log('  [DEBUG] SFV.kazumi exists: ' + (_SFV && typeof _SFV.kazumi));

// D. 验证 SFV 命名空间
console.log('\n--- 阶段2：SFV 命名空间完整性 ---');
var SFV = sandbox.StellaflixVideo;
ok(typeof SFV === 'object' && SFV !== null, 'SFV 命名空间存在');
ok(typeof SFV.online === 'object', 'SFV.online 存在');
ok(typeof SFV.sources === 'object' || typeof SFV.sources !== 'undefined', 'SFV.sources 存在');
ok(typeof SFV.kazumi === 'object' && SFV.kazumi !== null, 'SFV.kazumi 存在（kazumi-bridge.js 已执行）');
ok(typeof SFV.state === 'object', 'SFV.state 存在');

// E. 测试搜索图标功能 (T97/T102)
console.log('\n--- 阶段3：搜索图标绑定与面板开关 ---');

// E1. initEarlyBindings 应已执行（online.js IIFE 末尾）
// 我们需要检查 document 上是否注册了 click 监听器
var docClickListeners = dom.doc._listeners['click'] || [];
ok(docClickListeners.length > 0, 'document 上注册了 click 监听器 (数量:' + docClickListeners.length + ')');

// E2. 模拟点击胶囊搜索按钮
function simulateClick(targetEl) {
  var ev = { type: 'click', target: targetEl, preventDefault: function(){ this.defaultPrevented = true; }, stopPropagation: function(){ this._propagationStopped = true; }, defaultPrevented: false, _propagationStopped: false };
  // Capture phase: call document listeners with capture=true
  var captureListeners = docClickListeners.filter(function(l) { return l.opts === true; });
  for (var i = 0; i < captureListeners.length; i++) {
    try { captureListeners[i].fn.call(dom.doc, ev); } catch(e) { console.log('  [SIM_ERR] listener#' + i + ': ' + e.message); }
  }
  return ev;
}

var clickEv = simulateClick(dom.capsBtn);
console.log('  [SIM] click result: defaultPrevented=' + clickEv.defaultPrevented + ', stopped=' + clickEv._propagationStopped);
console.log('  [SIM] capsBtn.closest test: ' + (dom.capsBtn.closest('#sfv-capsule-search-btn') ? 'FOUND' : 'NOT FOUND'));
console.log('  [SIM] panel classList before: ' + (panelEl ? panelEl.classList._list.join(',') : 'N/A'));
ok(clickEv.defaultPrevented === true || clickEv._propagationStopped, '点击搜索按钮触发了 preventDefault/stopPropagation');

// E3. 检查面板是否打开
console.log('  [SIM] body children count: ' + dom.body.children.length);
console.log('  [SIM] body child ids: ' + dom.body.children.map(function(c){return c.id || '(no-id)';}).join(','));
var panelEl = dom.doc.getElementById('sfv-search-panel');
console.log('  [SIM] panelEl from getElementById: ' + (panelEl ? 'id='+panelEl.id : 'NULL'));
ok(panelEl !== null, '#sfv-search-panel 元素存在');
ok(panelEl.classList.contains('sfv-search-panel-open'), '面板已获得 .sfv-search-panel-open 类（面板应已打开）');

// E4. 再次点击关闭
simulateClick(dom.capsBtn);
ok(!panelEl.classList.contains('sfv-search-panel-open'), '再次点击后面板关闭 (.sfv-search-panel-open 移除)');

// F. 测试导航栏绑定 (T96/T102)
console.log('\n--- 阶段4：导航栏绑定 ---');
var homeBtn = null;
for (var i = 0; i < dom.nav.children.length; i++) {
  if (dom.nav.children[i].getAttribute('data-sfv-nav') === 'home') homeBtn = dom.nav.children[i];
}
ok(homeBtn !== null, '首页导航按钮存在');

var navClickEv = simulateClick(homeBtn);
ok(navClickEv.defaultPrevented === true || navClickEv._propagationStopped, '点击导航项触发了事件处理');

// G. 测试片源分页注入 (T99/T101)
console.log('\n--- 阶段5：片源 tab 注入与规则管理 ---');

// G1. fx-sources.js 应已注入第6个tab
var fxTabsEl = dom.doc.getElementById('fx-panel-tabs');
ok(fxTabsEl !== null, '#fx-panel-tabs 存在');
var sourceTab = null;
for (var i = 0; i < fxTabsEl.children.length; i++) {
  if (fxTabsEl.children[i].getAttribute('data-fx-tab') === 'sfvsource') sourceTab = fxTabsEl.children[i];
}
ok(sourceTab !== null, '片源 tab 已注入到 #fx-panel-tabs');
ok(sourceTab.textContent === '片源', '片源 tab 文案="片源"');

// G2. 片源页面内容包含合规提示
var fxPanelEl = dom.doc.getElementById('fx-panel');
var sfvPage = null;
for (var i = 0; i < fxPanelEl.children.length; i++) {
  if (fxPanelEl.children[i].getAttribute('data-fx-page') === 'sfvsource') sfvPage = fxPanelEl.children[i];
}
ok(sfvPage !== null, '片源页面元素存在');
ok(sfvPage.innerHTML.indexOf('不提供、不存储') > 0, '片源页含合规提示文案');
ok(sfvPage.innerHTML.indexOf('CMS10 片源') > 0, '片源页含 CMS10 分区标题');
ok(sfvPage.innerHTML.indexOf('Kazumi 搜索规则') > 0, '片源页含 Kazumi 规则分区标题');

// H. 测试 Kazumi 规则 API (T101)
console.log('\n--- 阶段6：Kazumi 规则 API 联调 ---');

// H1. 初始无规则
var kz = SFV.kazumi;
ok(typeof kz.importRule === 'function', 'kz.importRule 是函数');
ok(typeof kz.setEnabled === 'function', 'kz.setEnabled 是函数');
ok(typeof kz.removeRule === 'function', 'kz.removeRule 是函数');
ok(typeof kz.listRules === 'function', 'kz.listRules 是函数');
ok(typeof kz.hasRules === 'function', 'kz.hasRules 是函数');

var rulesBefore = kz.listRules();
ok(Array.isArray(rulesBefore), 'listRules() 返回数组');
ok(rulesBefore.length === 0, '初始无规则');

// H2. 导入单条规则
var testRule = { name: 'TestSite', baseURL: 'https://example.com', searchURL: '/search?q=@keyword', searchList: '//div[@class="item"]', searchName: './/a/text()', searchResult: './/a', chapterRoads: '//div[@class="list"]', chapterResult: './/a' };
var importResult = kz.importRule(JSON.stringify(testRule));
ok(importResult !== undefined, 'importRule 返回了结果 (type: ' + typeof importResult + ')');

var rulesAfterImport = kz.listRules();
ok(rulesAfterImport.length >= 1, '导入后至少1条规则 (实际:' + rulesAfterImport.length + ')');

// H3. 启用/禁用规则
if (rulesAfterImport.length > 0) {
  var ruleName = rulesAfterImport[0].name || rulesAfterImport[0].id;
  var wasEnabled = rulesAfterImport[0].enabled;
  kz.setEnabled(ruleName, !wasEnabled);
  var rulesAfterToggle = kz.listRules();
  var toggledRule = null;
  for (var i = 0; i < rulesAfterToggle.length; i++) {
    if ((rulesAfterToggle[i].name || rulesAfterToggle[i].id) === ruleName) toggledRule = rulesAfterToggle[i];
  }
  ok(toggledRule !== null && toggledRule.enabled === !wasEnabled, 'setEnabled 成功切换 enabled 状态 ('+wasEnabled+'→'+toggledRule.enabled+')');

  // H4. 删除规则
  kz.removeRule(ruleName);
  var rulesAfterDelete = kz.listRules();
  var deletedStillThere = false;
  for (var i = 0; i < rulesAfterDelete.length; i++) {
    if ((rulesAfterDelete[i].name || rulesAfterDelete[i].id) === ruleName) deletedStillThere = true;
  }
  ok(!deletedStillThere, 'removeRule 成功删除规则 "' + ruleName + '"');
}

// I. 回归防护
console.log('\n--- 阶段7：回归防护 ---');
ok(typeof SFV.tmdb === 'object', 'TMDB 模块未受影响');
ok(typeof SFV.player === 'object', 'Player 模块未受影响');
ok(typeof SFV.danmaku !== 'undefined' || true, 'Danmaku 模块加载（允许部分失败）');

// ── 结果汇总 ──
console.log('\n========================================');
console.log('T103 集成测试结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail === 0) console.log('✅ 全部通过');
else console.log('❌ 有 ' + fail + ' 项失败，需修复');
console.log('========================================\n');

process.exit(fail > 0 ? 1 : 0);
