/*
 * T156c 验证：片单页子视图 Esc 返回行为
 *  - 新建/重命名片单夹弹窗打开时：isFolderDialogOpen/closeFolderDialog 正确切换，Esc 应关弹窗而非退页
 *  - 「我的片单 · 管理」视图：back() 返回 true（退到概览），下一次 back() 在顶层才返回 false
 *
 * 用 vm + DOM 桩加载真实 page-collections.js，避免浏览器依赖，验证逻辑而非渲染。
 */
'use strict';
var vm = require('vm');
var fs = require('fs');
var path = require('path');

var file = path.resolve(__dirname, '../public/video/page-collections.js');
var code = fs.readFileSync(file, 'utf8');

// -------- 最小 DOM 桩 --------
function makeClassList() {
  var set = {};
  return {
    add: function () { for (var i = 0; i < arguments.length; i++) set[arguments[i]] = true; },
    remove: function () { for (var i = 0; i < arguments.length; i++) delete set[arguments[i]]; },
    toggle: function (c, on) { if (on === undefined) on = !set[c]; if (on) set[c] = true; else delete set[c]; return !!set[c]; },
    contains: function (c) { return !!set[c]; }
  };
}
var document = { _byId: {}, body: null, documentElement: null };

function makeEl(tag) {
  var node = {
    tagName: tag, _cls: '', _children: [], _listeners: {}, _text: '', _html: '', parentNode: null,
    style: { setProperty: function () {}, removeProperty: function () {}, top: '', left: '', width: '', position: '', overflow: '', display: '' },
    dataset: {},
    get className() { return this._cls; },
    set className(v) { this._cls = v || ''; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v == null ? '' : String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this._children = []; },
    appendChild: function (c) { this._children.push(c); c.parentNode = this; return c; },
    removeChild: function (c) { var i = this._children.indexOf(c); if (i >= 0) this._children.splice(i, 1); c.parentNode = null; return c; },
    addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    setAttribute: function (k, v) { this['attr_' + k] = v; },
    getAttribute: function (k) { return this['attr_' + k]; },
    querySelector: function () { return makeEl('div'); },
    querySelectorAll: function () { return []; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 }; },
    animate: function () { return {}; },
    focus: function () {},
    click: function () { var self = this; (this._listeners['click'] || []).forEach(function (f) { f({ target: self, stopPropagation: function () {}, preventDefault: function () {} }); }); }
  };
  node.classList = makeClassList();
  Object.defineProperty(node, 'id', {
    get: function () { return this._id; },
    set: function (v) { this._id = v; if (v) document._byId[v] = this; }
  });
  return node;
}
document.body = makeEl('body');
document.documentElement = makeEl('html');
document.createElement = function (tag) { return makeEl(tag); };
document.getElementById = function (id) { return document._byId[id] || null; };

// -------- SFV 桩 --------
var registeredPage = null;
var SFV = {
  collections: {
    getTabs: function () { return [{ id: 'featured', label: '推荐' }, { id: 'mine', label: '我的片单' }]; },
    getByTab: function () { return []; },
    getItems: function () { return Promise.resolve([]); },
    listUserFolders: function () { return [{ id: 'f1', name: '片单A', items: [] }]; },
    createUserFolder: function () {},
    renameUserFolder: function () {},
    deleteUserFolder: function () {}
  },
  router: {
    register: function (p) { registeredPage = p; },
    go: function () {},
    current: function () { return registeredPage; },
    currentId: function () { return 'collections'; }
  },
  online: {
    reopenCollections: function () {},
    openDetailFromMeta: function () {}
  },
  tmdb: { getMovieLogos: function () { return Promise.resolve([]); }, logoUrl: function () { return ''; } },
  detail: { pickBestLogo: function () { return null; } }
};

// -------- 沙箱 --------
var sandbox = {
  window: null, document: document, console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  Promise: Promise, MutationObserver: function () {},
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
  getComputedStyle: function () { return { gap: '19px' }; },
  confirm: function () { return true; }
};
sandbox.window = sandbox;
sandbox.window.StellaflixVideo = SFV;
sandbox.window.document = document;
sandbox.window.addEventListener = function () {};
sandbox.window.getComputedStyle = sandbox.getComputedStyle;
sandbox.window.confirm = sandbox.confirm;
sandbox.window.MutationObserver = sandbox.MutationObserver;
sandbox.global = sandbox.window;

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'page-collections.js' });

// -------- 断言工具 --------
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  PASS: ' + name); } else { fail++; console.log('  FAIL: ' + name); } }

// -------- 场景 1：弹窗 ESC 行为 --------
console.log('[场景1] 新建/重命名弹窗 Esc');
var PC = SFV.pageCollections;
ok('isFolderDialogOpen 初始为 false', PC.isFolderDialogOpen() === false);
PC.showFolderDialog(null);
ok('showFolderDialog 后 isFolderDialogOpen 为 true', PC.isFolderDialogOpen() === true);
PC.closeFolderDialog();
ok('closeFolderDialog 后 isFolderDialogOpen 为 false', PC.isFolderDialogOpen() === false);

// -------- 场景 2：管理视图 Esc 返回概览（而非退出片单页） --------
console.log('[场景2] 片单管理视图 Esc 返回');
var host = makeEl('div');
PC.mount(host, {}); // 默认进 featured 占位
// 切到「我的片单」tab
function findByAttr(root, key, val) {
  if (!root || !root._children) return null;
  for (var i = 0; i < root._children.length; i++) {
    var n = root._children[i];
    if (n['attr_' + key] === val) return n;
    var deep = findByAttr(n, key, val);
    if (deep) return deep;
  }
  return null;
}
function findByText(root, txt) {
  if (!root || !root._children) return null;
  for (var i = 0; i < root._children.length; i++) {
    var n = root._children[i];
    if (n._text === txt && /button/i.test(n.tagName)) return n;
    var deep = findByText(n, txt);
    if (deep) return deep;
  }
  return null;
}
var mineTab = findByAttr(host, 'data-sfv-ctab', 'mine');
ok('找到「我的片单」tab 按钮', !!mineTab);
mineTab.click(); // activeTab='mine' + renderTab(host,'mine')
var manageBtn = findByText(host, '管理');
ok('mine tab 渲染出「管理」按钮', !!manageBtn);
manageBtn.click(); // mineManageOpen=true + renderMineManage
ok('管理视图下 isFolderDialogOpen 仍为 false（未开弹窗）', PC.isFolderDialogOpen() === false);
var r1 = registeredPage.back();
ok('管理视图下 back() 返回 true（退到概览，不退页）', r1 === true);
var overviewManageBtn = findByText(host, '管理');
ok('back() 后重新渲染出「管理」按钮（已回到概览）', !!overviewManageBtn);
var r2 = registeredPage.back();
ok('概览（顶层）back() 返回 false（交由外壳关闭片单页）', r2 === false);

// -------- 场景 3：弹窗优先于管理视图 --------
console.log('[场景3] 管理视图内再开弹窗 → 首次 Esc 关弹窗');
// 重新进入管理视图
var m2 = findByText(host, '管理');
m2.click();
registeredPage.back(); // 回到概览
var m3 = findByText(host, '管理');
m3.click(); // 再次进入管理
PC.showFolderDialog(null); // 管理视图内打开「新建片单夹」弹窗
ok('管理视图内弹窗打开 isFolderDialogOpen 为 true', PC.isFolderDialogOpen() === true);
// 模拟 online-nav Esc 拦截：先判弹窗
if (PC.isFolderDialogOpen()) PC.closeFolderDialog();
ok('Esc 优先关弹窗后 isFolderDialogOpen 为 false（仍在管理视图）', PC.isFolderDialogOpen() === false);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
