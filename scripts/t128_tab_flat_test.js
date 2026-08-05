/**
 * T128 顶部 Tab 平级导航修复 — 专项测试（已按用户纠正更新）
 *
 * 背景：用户反馈顶部 5 个 tab（汇联/世界/首页/电影/动漫）被错误实现为多页面跳转
 *   （全屏覆盖层盖住固定 tab 栏 + 自带「← 标题」返回头）。修复后：
 *
 *  A. 代码层：online.js 提供 getContentTop；goToNav 给覆盖层加 sfv-browse--page
 *     并写入 overlay.style.top（内容区置于固定 tab 栏下方）；goBack 在页面模式
 *     下不再切 tab / 关浏览层（平级无返回语义）。
 *  B. 运行时：mock DOM 串起 online.js + router + 全部 page，模拟点击「电影」tab：
 *     - 覆盖层显示且带 sfv-browse--page（隐藏自带返回+标题头，不再像独立页面）
 *     - overlay.style.top 写入正值（内容区在固定 tab 栏下方，不覆盖它）
 *     - 模拟 Escape：goBack 为 no-op（顶层 tab 页不切 tab、不关闭）
 *  C. 详情页自带返回按钮：page-media-grid.js 的 showDetail 注入 .sfv-detail-back。
 *
 * 用户进一步纠正（2026-08-03 18:18）：「首页」不是新建独立分页，而是影视空间既有首页
 *   （home.js 渲染的主 DOM）。因此首页 nav 改走 online.goHome()：关闭覆盖层、刷新影视首页，
 *   不再进入 page-home.js 占位页。
 */
var fs = require('fs');
var vm = require('vm');

var onlineJs = fs.readFileSync('public/video/online.js', 'utf8');
var routerJs = fs.readFileSync('public/video/router.js', 'utf8');
var gridJs   = fs.readFileSync('public/video/page-media-grid.js', 'utf8');
var movieJs  = fs.readFileSync('public/video/page-movie.js', 'utf8');
var animeJs  = fs.readFileSync('public/video/page-anime.js', 'utf8');
var homeJs   = fs.readFileSync('public/video/page-home.js', 'utf8');
var discoverJs = fs.readFileSync('public/video/page-discover.js', 'utf8');
var worldJs  = fs.readFileSync('public/video/page-world.js', 'utf8');

var pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// ---------------------------------------------------------------- mock DOM
var idMap = {};
function makeStyle() {
  return {
    _p: {},
    setProperty: function (k, v) { this._p[k] = v; },
    removeProperty: function (k) { delete this._p[k]; },
    getPropertyValue: function (k) { return this._p[k] || ''; }
  };
}
function makeNode(tag) {
  var set = new Set();
  var node = {
    tagName: tag, _text: '', type: '', _children: [], _parent: null,
    _attr: {}, _listeners: {}, style: makeStyle(),
    classList: {
      add: function (c) { set.add(c); },
      remove: function (c) { set.delete(c); },
      toggle: function (c, f) { if (f === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else { f ? set.add(c) : set.delete(c); } },
      contains: function (c) { return set.has(c); }
    },
    appendChild: function (c) { c._parent = node; node._children.push(c); if (c.id) idMap[c.id] = c; return c; },
    removeChild: function (c) { var i = node._children.indexOf(c); if (i >= 0) node._children.splice(i, 1); return c; },
    setAttribute: function (k, v) { node._attr[k] = v; },
    getAttribute: function (k) { return (k in node._attr) ? node._attr[k] : null; },
    addEventListener: function (t, fn) { (node._listeners[t] = node._listeners[t] || []).push(fn); },
    closest: function (sel) { var cls = sel.replace(/^\./, ''); var n = node; while (n) { if (n.classList && n.classList.contains(cls)) return n; n = n._parent; } return null; },
    getBoundingClientRect: function () { return { top: 0, bottom: 48, left: 0, right: 120, width: 120, height: 48 }; },
    querySelectorAll: function () { return []; },
    fire: function (t, ev) { (node._listeners[t] || []).slice().forEach(function (fn) { fn(ev); }); }
  };
  Object.defineProperty(node, 'className', {
    get: function () { return Array.from(set).join(' '); },
    set: function (v) { set.clear(); String(v || '').split(/\s+/).forEach(function (c) { if (c) set.add(c); }); }
  });
  Object.defineProperty(node, 'textContent', {
    get: function () { return node._text; },
    set: function (v) { node._text = String(v == null ? '' : v); }
  });
  Object.defineProperty(node, 'innerHTML', {
    get: function () { return ''; },
    set: function () { node._children = []; }
  });
  Object.defineProperty(node, 'parentNode', { get: function () { return node._parent; } });
  Object.defineProperty(node, 'id', {
    get: function () { return node._id || ''; },
    set: function (v) { node._id = v; if (v) idMap[v] = node; }
  });
  return node;
}

var doc = makeNode('html');
doc.readyState = 'complete';
doc.getElementById = function (id) { return idMap[id] || null; };
doc.createElement = function (tag) { return makeNode(tag); };
doc.querySelectorAll = function () { return []; };
doc.addEventListener = function (t, fn) { (doc._listeners[t] = doc._listeners[t] || []).push(fn); };
doc.body = makeNode('body'); doc.body.className = 'video-space-active';
doc.documentElement = makeNode('html');
doc.head = makeNode('head');
// 固定 tab 栏节点（getContentTop 依赖它定位内容区顶部）
var navEl = makeNode('nav'); navEl.id = 'sfv-nav';
var searchArea = makeNode('div'); searchArea.id = 'search-area';
idMap['sfv-nav'] = navEl; idMap['search-area'] = searchArea;

var sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.document = doc;
sandbox.StellaflixVideo = {};
sandbox.addEventListener = function (t, fn) { (sandbox._listeners = sandbox._listeners || {})[t] = (sandbox._listeners[t] || []).concat(fn); };
sandbox.setTimeout = function () { return 0; };
sandbox.fireKey = function (ev) { ((sandbox._listeners || {})['keydown'] || []).slice().forEach(function (fn) { fn(ev); }); };
vm.createContext(sandbox);

['online.js', 'router.js', 'page-media-grid.js', 'page-movie.js', 'page-anime.js',
 'page-home.js', 'page-discover.js', 'page-world.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync('public/video/' + f, 'utf8'), sandbox, { filename: f });
});
var SFV = sandbox.StellaflixVideo;

// mock 影视首页渲染函数，用于验证 goHome() 会刷新首页
var homeRenderCalled = false;
SFV.home = { render: function () { homeRenderCalled = true; } };

// ---------------------------------------------------------------- A. 代码层
console.log('\n=== A. 代码层：平级 tab 修复 + 首页回归既有影视首页 ===\n');
assert(/function getContentTop\s*\(/.test(onlineJs), 'online.js 定义 getContentTop（内容区顶部偏移）');
assert(/function goHome\s*\(/.test(onlineJs), 'online.js 定义 goHome()');
assert(/case 'home':[\s\S]*?goHome\(\)/.test(onlineJs),
       'nav home 调用 goHome() 而非 goToNav');
assert(onlineJs.indexOf("goToNav('home')") === -1,
       'online.js 不再出现 goToNav(\'home\')');
assert(onlineJs.indexOf("overlay.classList.add('sfv-browse--page')") !== -1,
       'goToNav 给覆盖层加 sfv-browse--page（隐藏返回+标题头）');
assert(/overlay\.style\.top\s*=\s*getContentTop\(\)\s*\+\s*'px'/.test(onlineJs),
       'goToNav 写入 overlay.style.top（内容区置于固定 tab 栏下方）');
// 旧的多页面返回语义应已移除：页面模式下不得 router.go('home') / close() 顶层 tab
assert(onlineJs.indexOf("SFV.router.go('home')") === -1, 'goBack 页面模式不再切到 home（平级无返回）');
assert(/if \(uiMode === 'page'\)\s*\{\s*var p = SFV\.router \?/.test(onlineJs),
       'goBack 页面模式：仅详情 back 生效，顶层 tab 为 no-op');
assert(onlineJs.indexOf("if (activePageId === 'home') { close();") === -1,
       'goBack 页面模式不再对 home 顶层页调用 close()');

// ---------------------------------------------------------------- B. 运行时：模拟点击「电影」tab
console.log('\n=== B. 运行时：点击电影 tab → 平级内容切换 ===\n');
(function () {
  // 构造一个 .sfv-nav-item（data-sfv-nav=movie）作为点击 target
  var navItem = makeNode('button'); navItem.className = 'sfv-nav-item'; navItem.setAttribute('data-sfv-nav', 'movie');
  var clickEv = { target: navItem, preventDefault: function () {}, stopPropagation: function () {} };
  // 触发 document 上 bindNavItems 注册的 click 捕获监听
  (doc._listeners['click'] || []).forEach(function (fn) { fn(clickEv); });

  var overlay = idMap['sfv-browse'];
  assert(!!overlay, 'ensure() 已构建 #sfv-browse 覆盖层');
  assert(overlay && overlay.classList.contains('sfv-show'), '覆盖层已显示（sfv-show）');
  assert(overlay && overlay.classList.contains('sfv-browse--page'),
         '覆盖层带 sfv-browse--page（自带返回+标题头被隐藏，不再像独立页面）');
  assert(overlay && /^\d+px$/.test(overlay.style.top || ''),
         'overlay.style.top 写入正值（内容区置于固定 tab 栏下方，不覆盖它）');
  assert((SFV.router && SFV.router.currentId && SFV.router.currentId()) === 'movie',
         'router 当前页为 movie（内容区已切换）');

  // 模拟 Escape：顶层 tab 页应 no-op（不切 tab、不关闭）
  var beforeId = SFV.router.currentId();
  sandbox.fireKey({ key: 'Escape', keyCode: 27, preventDefault: function () {}, stopPropagation: function () {} });
  assert(overlay.classList.contains('sfv-show'), 'Escape 后覆盖层仍显示（未关闭浏览层）');
  assert(SFV.router.currentId() === beforeId, 'Escape 后仍为同一 tab（未切到其它页）');
})();

// ---------------------------------------------------------------- C. 详情页自带返回按钮
console.log('\n=== C. 详情页自带返回按钮（层级导航）===\n');
assert(gridJs.indexOf('SFV.DetailView.build(') === -1,
       'page-media-grid.js showDetail 不再调用已删除的 SFV.DetailView.build(...（Phase 1 删除详情模块）');
assert(gridJs.indexOf('SFV.online.renderDetail(') !== -1,
       'page-media-grid.js showDetail 路由到 v2 详情页（renderDetail 单一汇聚点 → SFV.detailV2.build）');
assert(gridJs.indexOf('详情页即将上线') === -1,
       'page-media-grid.js showDetail 不再降级为「即将上线」轻提示（v2 已上线）');

// ---------------------------------------------------------------- D. 运行时：点击「首页」tab 回到真正影视首页
console.log('\n=== D. 运行时：点击首页 tab → 关闭覆盖层并刷新影视首页 ===\n');
(function () {
  // 先进入电影 tab，让覆盖层显示
  var movieItem = makeNode('button'); movieItem.className = 'sfv-nav-item'; movieItem.setAttribute('data-sfv-nav', 'movie');
  (doc._listeners['click'] || []).forEach(function (fn) { fn({ target: movieItem, preventDefault: function () {}, stopPropagation: function () {} }); });
  var overlay = idMap['sfv-browse'];
  assert(overlay && overlay.classList.contains('sfv-show'), '前置：电影 tab 已打开覆盖层');

  // 点击首页 tab
  homeRenderCalled = false;
  var homeItem = makeNode('button'); homeItem.className = 'sfv-nav-item'; homeItem.setAttribute('data-sfv-nav', 'home');
  (doc._listeners['click'] || []).forEach(function (fn) { fn({ target: homeItem, preventDefault: function () {}, stopPropagation: function () {} }); });

  assert(overlay && !overlay.classList.contains('sfv-show'), '首页 tab 关闭 #sfv-browse 覆盖层');
  assert(homeRenderCalled, 'goHome() 调用 SFV.home.render() 刷新影视首页');
})();

// ---------------------------------------------------------------- 汇总
console.log('\n=== 汇总 ===');
console.log('T128: ' + pass + ' pass / ' + fail + ' fail');
if (fail > 0) process.exit(1);
