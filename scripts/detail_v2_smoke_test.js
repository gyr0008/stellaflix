// Phase 2 v2 详情页冒烟测试：验证 detail-v2.js build() 不抛错、
// DOM 结构正确、追片状态切换生效。使用极简 DOM mock（无 jsdom 依赖）。
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

// ---------------- 极简 DOM mock ----------------
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _classes: {},
    _children: [],
    parentNode: null,
    style: {},
    _html: '',
    textContent: '',
    _listeners: {},
    dataset: {},
  };
  Object.defineProperty(el, 'className', {
    get() { return Object.keys(el._classes).filter(k => el._classes[k]).join(' '); },
    set(v) { el._classes = {}; String(v).split(/\s+/).forEach(c => { if (c) el._classes[c] = true; }); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = v; },
  });
  el.classList = {
    add: c => { el._classes[c] = true; },
    remove: c => { delete el._classes[c]; },
    toggle: c => { if (el._classes[c]) delete el._classes[c]; else el._classes[c] = true; },
    contains: c => !!el._classes[c],
  };
  el.appendChild = child => { child.parentNode = el; el._children.push(child); return child; };
  el.insertBefore = (node, ref) => {
    node.parentNode = el;
    const i = el._children.indexOf(ref);
    if (i < 0) el._children.push(node); else el._children.splice(i, 0, node);
    return node;
  };
  el.removeChild = child => {
    const i = el._children.indexOf(child);
    if (i >= 0) el._children.splice(i, 1);
    child.parentNode = null;
    return child;
  };
  el.addEventListener = (type, fn) => { (el._listeners[type] = el._listeners[type] || []).push(fn); };
  el.dispatchEvent = ev => { (el._listeners[ev.type] || []).forEach(fn => fn(ev)); };
  el.querySelector = sel => findOne(el, sel);
  el.querySelectorAll = sel => findAll(el, sel);
  el.contains = node => {
    if (node === el) return true;
    return el._children.some(c => c.contains && c.contains(node));
  };
  return el;
}
function matchSel(el, sel) {
  if (sel.charAt(0) === '.') return !!el._classes[sel.slice(1)];
  return el.tagName === sel.toUpperCase();
}
function findOne(root, sel) {
  for (const c of root._children) {
    if (matchSel(c, sel)) return c;
    const deep = c.querySelector ? c.querySelector(sel) : null;
    if (deep) return deep;
  }
  return null;
}
function findAll(root, sel) {
  let out = [];
  for (const c of root._children) {
    if (matchSel(c, sel)) out.push(c);
    if (c.querySelectorAll) out = out.concat(c.querySelectorAll(sel));
  }
  return out;
}

// ---------------- 全局 mock ----------------
const overlay = makeEl('div');
overlay.className = 'sfv-browse';
const trackStore = {};
const flagStore = {};
const SFV = {
  ui: { toast() {} },
  model: {
    getTrackStatus: k => trackStore[k] || null,
    setTrackStatus: (k, s) => { trackStore[k] = s; },
    clearTrack: k => { delete trackStore[k]; },
    getFlag: k => flagStore[k] || { liked: false, inList: false },
    toggleFlag: (k, f) => {
      flagStore[k] = flagStore[k] || { liked: false, inList: false };
      flagStore[k][f] = !flagStore[k][f];
    },
  },
  tmdb: { hasKey: () => false, bestMatch: () => Promise.reject(), getDetailBundle: () => Promise.reject() },
  online: { openDetailFromMeta() {}, showPickFolderDialog() {} },
  collections: {},
};
const sandbox = {
  window: { SFV },
  document: {
    createElement: makeEl,
    querySelector: sel => (sel === '.sfv-browse' ? overlay : findOne(overlay, sel)),
    addEventListener() {},
    removeEventListener() {},
  },
  global: { setTimeout: fn => { fn(); return 0; } },
  setTimeout: fn => { fn(); return 0; },
  console,
  CustomEvent: function (type, init) { this.type = type; this.detail = (init && init.detail) || null; this.stopPropagation = function () {}; this.preventDefault = function () {}; },
  navigator: { clipboard: { writeText: () => Promise.reject() } },
};
sandbox.window.SFV = SFV;

// ---------------- 加载 detail-v2.js ----------------
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/../public/video/detail-v2.js', 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'detail-v2.js' });

const view = {
  key: 'test:key:1',
  title: '测试影片',
  year: '2024',
  pic: 'https://example.com/p.jpg',
  overview: '这是一段简介。',
};

test('detail-v2.build 返回根节点且结构完整', () => {
  const root = SFV.detailV2.build(view);
  assert.ok(root, 'build 返回根节点');
  assert.ok(root.classList.contains('sfv-detail-v2'), '根节点含 sfv-detail-v2');
  assert.ok(findOne(root, '.sfv-dv-poster'), '含首屏海报');
  assert.ok(findOne(root, '.sfv-dv-cta'), '含 CTA 行');

  const cta = findOne(root, '.sfv-dv-cta');
  assert.ok(findOne(cta, '.sfv-dv-play'), '含播放按钮');
  const heart = findOne(cta, '.sfv-dv-heart');
  assert.ok(heart, '含追片绿胶囊');
  assert.ok(findOne(cta, '.sfv-dv-glass'), '含次级玻璃按钮');
  assert.equal(findAll(cta, '.sfv-dv-glass').length, 3, '3 个次级玻璃按钮（加片单/收藏/分享）');

  const pop = findOne(cta, '.sfv-dv-pop');
  assert.ok(pop, '含状态弹窗');
  assert.equal(findAll(pop, '.sfv-dv-pop-item').length, 7, '弹窗 7 项（6 状态 + 清除）');

  const lower = findOne(root, '.sfv-dv-lower');
  assert.ok(lower, '含下区');
  assert.ok(!lower.classList.contains('open'), '下区默认不展开');
});

test('追片状态：初始未追 → 切在看 → 清除', () => {
  SFV.detailV2.build(view);
  const dv = sandbox.document.querySelector('.sfv-detail-v2');
  const cta = findOne(dv, '.sfv-dv-cta');
  const heart = findOne(cta, '.sfv-dv-heart');
  assert.ok(heart.innerHTML.indexOf('未追') >= 0, '初始显示「未追」');

  const pop = findOne(cta, '.sfv-dv-pop');
  const items = findAll(pop, '.sfv-dv-pop-item');
  items[1].dispatchEvent(new sandbox.CustomEvent('click')); // 在看
  assert.equal(trackStore[view.key], 'watching', 'trackStore 写入 watching');
  assert.ok(heart.innerHTML.indexOf('在看') >= 0, '绿胶囊标签更新为「在看」');

  const clearItem = findAll(pop, '.sfv-dv-pop-item').pop();
  clearItem.dispatchEvent(new sandbox.CustomEvent('click'));
  assert.equal(trackStore[view.key], undefined, '清除后 trackStore 移除');
  assert.ok(heart.innerHTML.indexOf('未追') >= 0, '清除后恢复「未追」');
});

test('teardown 移除根节点', () => {
  SFV.detailV2.build(view);
  assert.ok(sandbox.document.querySelector('.sfv-detail-v2'), 'build 后存在');
  SFV.detailV2.teardown();
  assert.equal(sandbox.document.querySelector('.sfv-detail-v2'), null, 'teardown 后移除');
});

test('build 同 key 幂等：返回同一根节点，不触发重建', () => {
  // v2 ▶ 按钮走 openDetailFromMeta → renderDetail → detailV2.build，
  // 同一页内重复触发必须幂等，避免 teardown+rebuild 的视觉闪烁。
  const r1 = SFV.detailV2.build(view);
  assert.ok(r1, '首次 build 返回根');
  const r2 = SFV.detailV2.build(view);
  assert.strictEqual(r2, r1, '同 key 二次 build 返回同一根（未重建）');
});
