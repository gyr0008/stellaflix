/*
 * T158 验证：加载真实 online-shared.js，验证
 *  - cleanupOrphanFloaters() 移除 body 上所有 .sf-filter-fab 并清空 S._filterFab
 *  - ensureFilterUi() 重建前去重，多次调用只留一个 FAB
 * vm + 简易 DOM 桩，不依赖浏览器。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = 'C:/Users/Administrator/Desktop/Mineradio-Extended-1.1.2-extended.1';

// ---- 简易 DOM 桩 ----
function makeClassList(node) {
  return {
    add: function (c) { if (!node._has(c)) node._classes.push(c); },
    remove: function (c) { node._classes = node._classes.filter(function (x) { return x !== c; }); },
    contains: function (c) { return node._has(c); },
    toggle: function (c, on) { if (on === undefined) on = !node._has(c); if (on) this.add(c); else this.remove(c); }
  };
}
function makeNode(tag) {
  var n = {
    tagName: tag, _classes: [], parentNode: null, children: [],
    style: {}, _listeners: {},
    _has: function (c) { return this._classes.indexOf(c) >= 0; },
    set className(v) { this._classes = String(v).split(/\s+/).filter(Boolean); },
    get className() { return this._classes.join(' '); },
    classList: null,
    setAttribute: function () {},
    addEventListener: function (t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    appendChild: function (child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this; this.children.push(child); return child;
    },
    removeChild: function (child) {
      var i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null; return child;
    },
    querySelectorAll: function (sel) {
      var token = String(sel).replace(/^\./, '');
      var out = [];
      (function walk(node) {
        node.children.forEach(function (c) {
          if (c._has(token)) out.push(c);
          walk(c);
        });
      })(this);
      return out;
    },
    querySelector: function () { return null; },
    get textContent() { return this._text || ''; },
    set textContent(v) { this._text = v; },
    focus: function () {}
  };
  n.classList = makeClassList(n);
  return n;
}

var body = makeNode('body');
var documentStub = {
  body: body,
  createElement: function (t) { return makeNode(t); },
  getElementById: function (id) {
    if (id === 'sfv-search-page') return makeNode('div');
    return null; // chips bar 等缺失 → 相关早退分支安全
  },
  querySelector: function () { return null; }
};

// SFV 桩：onlineCore 必须存在（加载期校验），SearchFilter 提供 createFab（ensureFilterUi 用）
var SFV = { onlineCore: { _containsEither: function(){}, _typeMatches: function(){} } };
SFV.SearchFilter = {
  createFab: function (label, onClick) {
    var b = makeNode('button');
    b.className = 'sf-filter-fab';
    if (typeof onClick === 'function') b.addEventListener('click', onClick);
    return b;
  },
  renderChips: function () {},
  open: function () {},
  svg: function () { return ''; }
};

var sandbox = {
  window: null,
  document: documentStub,
  console: console,
  StellaflixVideo: SFV,
  setTimeout: function () {},
  clearTimeout: function () {},
  Promise: Promise,
  parseInt: parseInt
};
sandbox.window = sandbox;
sandbox.global = sandbox;

// 加载真实 online-shared.js
var src = fs.readFileSync(path.join(ROOT, 'public/video/online-shared.js'), 'utf8');
vm.runInNewContext(src, sandbox, { filename: 'online-shared.js' });

var S = SFV.onlineShared;
var failures = 0;
function check(name, cond) {
  if (cond) { console.log('  PASS: ' + name); }
  else { console.log('  FAIL: ' + name); failures++; }
}

console.log('--- T158 场景验证 ---');

// 场景1：body 残留 FAB → cleanup 后清空
var fab1 = makeNode('button'); fab1.className = 'sf-filter-fab'; body.appendChild(fab1);
S._filterFab = fab1;
check('setup: 残留 FAB 已挂载', body.querySelectorAll('.sf-filter-fab').length === 1);
S.cleanupOrphanFloaters();
check('cleanup 后无残留 .sf-filter-fab', body.querySelectorAll('.sf-filter-fab').length === 0);
check('cleanup 后 S._filterFab 已清空', S._filterFab === null);

// 场景2：两个残留 FAB（多实例）→ 全部清除
var a = makeNode('button'); a.className = 'sf-filter-fab'; body.appendChild(a);
var b = makeNode('button'); b.className = 'sf-filter-fab'; body.appendChild(b);
S._filterFab = a;
check('setup: 两个残留 FAB', body.querySelectorAll('.sf-filter-fab').length === 2);
S.cleanupOrphanFloaters();
check('cleanup 后两个 FAB 全清', body.querySelectorAll('.sf-filter-fab').length === 0);

// 场景3：ensureFilterUi 重建前去重，只留一个
S.ensureFilterUi();
var after1 = body.querySelectorAll('.sf-filter-fab').length;
S.ensureFilterUi(); // 第二次应去重
var after2 = body.querySelectorAll('.sf-filter-fab').length;
check('ensureFilterUi 创建一个 FAB', after1 === 1);
check('ensureFilterUi 重复调用不增实例', after2 === 1);
check('ensureFilterUi 后 S._filterFab 指向该节点', S._filterFab && S._filterFab.parentNode === body);

console.log('');
if (failures === 0) { console.log('T158 ALL PASS'); process.exit(0); }
else { console.log('T158 FAILURES: ' + failures); process.exit(1); }
