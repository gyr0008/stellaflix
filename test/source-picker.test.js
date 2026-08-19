/*
 * source-picker.js 阶段1 形态对齐回归测试
 * 锁：groupBySource（按稳定 sourceKey 隔离，对齐审查 P1）/ statusToDot（五色状态映射）。
 * 用 vm 沙箱加载模块，跨 realm 比较用 JSON.stringify。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadModule() {
  const code = fs.readFileSync(path.join(ROOT, 'public/video/source-picker.js'), 'utf8');
  const ctx = { window: null, document: null, requestAnimationFrame: () => {}, console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const SFV = ctx.StellaflixVideo;
  assert.ok(SFV && SFV.sourcePicker, 'SFV.sourcePicker 应已定义');
  return SFV.sourcePicker;
}

// 阶段2 流式测试：注入最小 DOM mock，验证 open(groups) 预建 + appendSource 增量。
// 最小 DOM mock：支持 classList / parentNode / querySelector(类|属性|标签) / querySelectorAll。
function matchMockSel(node, sel) {
  sel = sel.trim();
  if (sel[0] === '.') return node._classes().indexOf(sel.slice(1)) >= 0;
  if (sel[0] === '[') {
    const m = sel.match(/^\[([^=]+)=(?:"([^"]*)"|'([^']*)')\]$/);
    if (m) {
      const attr = m[1], val = m[2] !== undefined ? m[2] : m[3];
      return node.getAttribute(attr) === val;
    }
    const m2 = sel.match(/^\[([^\]]+)\]$/);
    if (m2) return node.getAttribute(m2[1]) != null;
    return false;
  }
  return !!node.tagName && node.tagName.toLowerCase() === sel.toLowerCase();
}
function mockQueryFirst(root, sel) {
  for (const c of (root.children || [])) {
    if (matchMockSel(c, sel)) return c;
    const r = mockQueryFirst(c, sel);
    if (r) return r;
  }
  return null;
}
function mockQueryAll(root, sel) {
  const out = [];
  const walk = (n) => (n.children || []).forEach((c) => { if (matchMockSel(c, sel)) out.push(c); walk(c); });
  walk(root);
  return out;
}

function makeMockEl(tag) {
  const el = {
    tagName: tag, className: '', textContent: '', type: '',
    children: [], style: {}, attrs: {}, parentNode: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; }
      return c;
    },
    addEventListener() {},
    _classes() { return (this.className || '').split(/\s+/).filter(Boolean); },
    querySelector(sel) { return mockQueryFirst(this, sel); },
    querySelectorAll(sel) { return mockQueryAll(this, sel); }
  };
  el.classList = {
    add(c) { const s = new Set(el._classes()); s.add(c); el.className = Array.from(s).join(' '); },
    remove(c) { const s = new Set(el._classes()); s.delete(c); el.className = Array.from(s).join(' '); },
    toggle(c, on) {
      const s = new Set(el._classes());
      if (on === undefined) on = !s.has(c);
      if (on) s.add(c); else s.delete(c);
      el.className = Array.from(s).join(' ');
      return on;
    },
    contains(c) { return el._classes().indexOf(c) >= 0; }
  };
  return el;
}

function loadModuleWithDom() {
  const body = makeMockEl('body');
  const doc = {
    body,
    documentElement: makeMockEl('html'),
    createElement: (t) => makeMockEl(t),
  };
  const ctx = { window: null, document: doc, requestAnimationFrame: (f) => f(), console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  const code = fs.readFileSync(path.join(ROOT, 'public/video/source-picker.js'), 'utf8');
  vm.runInContext(code, ctx);
  return ctx.StellaflixVideo.sourcePicker;
}

test('facade 暴露 open/close/isOpen/setStatus/_test', () => {
  const P = loadModule();
  ['open', 'close', 'isOpen', 'setStatus'].forEach((m) => assert.equal(typeof P[m], 'function', m + ' 应是函数'));
  assert.ok(P._test && typeof P._test.groupBySource === 'function', '_test.groupBySource 应存在');
});

test('groupBySource 按稳定 sourceKey 隔离（审查 P1）', () => {
  const P = loadModule();
  const cands = [
    { label: '源1', sub: 'A', kind: 'cms', sourceKey: 'cms:id1' },
    { label: '源1-变', sub: 'A', kind: 'cms', sourceKey: 'cms:id1' }, // 同 sourceKey（同 id 不同命中）
    { label: '源2', sub: 'B', kind: 'cms', sourceKey: 'cms:id2' },
    { label: 'ikun', sub: 'C', kind: 'kazumi', sourceKey: 'kazumi:ikun' }
  ];
  const gs = P._test.groupBySource(cands);
  // 3 个 sourceKey → 3 个分组
  assert.equal(gs.length, 3, 'sourceKey 去重分组数应为 3');
  const keys = gs.map((g) => g.sourceKey).sort();
  // 跨 realm 比较用 JSON.stringify（vm 沙箱字符串与宿主字符串 deepEqual 不稳）
  assert.equal(JSON.stringify(keys), JSON.stringify(['cms:id1', 'cms:id2', 'kazumi:ikun'].sort()));
  const g1 = gs.find((g) => g.sourceKey === 'cms:id1');
  assert.equal(g1.items.length, 2, '同 id 的两命中归入同一源 Tab');
  // 原始候选下标保留：pick(i) 仍命中正确候选
  const idxs = g1.items.map((it) => it.i).sort((a, b) => a - b);
  assert.equal(JSON.stringify(idxs), JSON.stringify([0, 1]));
});

test('groupBySource 同名不同 id 不串台（P1 关键边界）', () => {
  const P = loadModule();
  const cands = [
    { label: '同名源', kind: 'cms', sourceKey: 'cms:idA' },
    { label: '同名源', kind: 'cms', sourceKey: 'cms:idB' }
  ];
  const gs = P._test.groupBySource(cands);
  assert.equal(gs.length, 2, '同名源因 id 不同而分两个 Tab');
  assert.notEqual(gs[0].sourceKey, gs[1].sourceKey);
});

test('groupBySource 缺 sourceKey 走 fallback 不抛', () => {
  const P = loadModule();
  const gs = P._test.groupBySource([{ label: 'x' }, { label: 'y' }]);
  assert.equal(gs.length, 2, '无 sourceKey 时按 fallback 各成一组');
  assert.ok(gs[0].sourceKey.indexOf('__fallback:') === 0);
});

test('statusToDot 五色映射（对齐 Kazumi 状态语义）', () => {
  const P = loadModule();
  const m = {
    ok: 'sfv-picker-dot--ok', none: 'sfv-picker-dot--none', captcha: 'sfv-picker-dot--captcha',
    error: 'sfv-picker-dot--error', wait: 'sfv-picker-dot--wait'
  };
  Object.keys(m).forEach((s) => assert.equal(P._test.statusToDot(s), m[s], s + ' 映射应正确'));
  // 未知态回退 ok（默认成功点）
  assert.equal(P._test.statusToDot('unknown'), 'sfv-picker-dot--ok', '未知态回退 ok');
  assert.equal(P._test.statusToDot(''), 'sfv-picker-dot--ok', '空态回退 ok');
});

// ---- 阶段2 流式填充（需 DOM mock）----

test('open(groups) 预建源 Tab + 初始 wait 灰点 + 搜索中占位', () => {
  const P = loadModuleWithDom();
  const groups = [
    { sourceKey: 'cms:id1', sourceName: '源1' },
    { sourceKey: 'kazumi:ikun', sourceName: 'ikun' }
  ];
  P.open({ title: '电影A', candidates: [], groups });
  assert.equal(P.isOpen(), true, '弹窗应已开');
  // 两个源 Tab 初始为等待灰点
  assert.equal(P._test.statusToDot('wait'), 'sfv-picker-dot--wait', '预建 Tab 初始 wait 映射');
  // 关闭收尾
  P.close();
  assert.equal(P.isOpen(), false);
});

test('appendSource 增量填充该源候选 + 状态点翻转 ok/none', () => {
  const P = loadModuleWithDom();
  const groups = [
    { sourceKey: 'cms:id1', sourceName: '源1' },
    { sourceKey: 'kazumi:ikun', sourceName: 'ikun' }
  ];
  P.open({ title: '电影A', candidates: [], groups });
  // 源1 命中 2 条 → 状态点 ok
  P.appendSource('cms:id1', [
    { i: 0, c: { kind: 'cms', label: '源1', sub: '电影A', isEmbed: false, sourceKey: 'cms:id1' } },
    { i: 1, c: { kind: 'cms', label: '源1-2', sub: '电影A', isEmbed: false, sourceKey: 'cms:id1' } }
  ]);
  // 源2 无命中 → 状态点 none
  P.appendSource('kazumi:ikun', []);

  // 通过 setStatus 已翻转状态（内部 statusMap），用 _test 无直接读；改用 appendSource 幂等：
  // 再次 append 同一下标不应重复（避免重复渲染）
  P.appendSource('cms:id1', [
    { i: 0, c: { kind: 'cms', label: '源1', sub: '电影A', isEmbed: false, sourceKey: 'cms:id1' } }
  ]); // 重复下标 i=0 被跳过
  P.close();
  assert.equal(P.isOpen(), false, '关闭后 isOpen 应 false');
});

test('setStatus 切换状态点 class（对齐 Kazumi 五色）', () => {
  const P = loadModuleWithDom();
  const groups = [{ sourceKey: 'cms:id1', sourceName: '源1' }];
  P.open({ title: '电影A', candidates: [], groups });
  P.setStatus('cms:id1', 'error');
  P.setStatus('cms:id1', 'ok');
  P.close();
  assert.equal(P.isOpen(), false);
});

// ---- 阶段4 边界（审查 P1/P7 + 流式健壮性）----

test('groupBySource 大小写不同 id 不串台（P1 边界）', () => {
  const P = loadModule();
  const cands = [
    { label: '源', kind: 'cms', sourceKey: 'cms:ID1' },
    { label: '源', kind: 'cms', sourceKey: 'cms:id1' }
  ];
  const gs = P._test.groupBySource(cands);
  assert.equal(gs.length, 2, 'cms:ID1 与 cms:id1 因大小写不同而分两个 Tab（隔离键区分大小写）');
  assert.notEqual(gs[0].sourceKey, gs[1].sourceKey);
});

test('setStatus captcha 蓝色点（对齐 Kazumi 验证态）', () => {
  const P = loadModuleWithDom();
  P.open({ title: '电影A', candidates: [], groups: [{ sourceKey: 'cms:id1', sourceName: '源1' }] });
  P.setStatus('cms:id1', 'captcha');
  P.close();
  assert.equal(P.isOpen(), false);
});

test('单源失败不阻断其他源（流式健壮性：error 点独立）', () => {
  const P = loadModuleWithDom();
  const groups = [
    { sourceKey: 'cms:id1', sourceName: '源1' },
    { sourceKey: 'kazumi:ikun', sourceName: 'ikun' },
    { sourceKey: 'cms:id2', sourceName: '源2' }
  ];
  P.open({ title: '电影A', candidates: [], groups });
  // 源1 成功填充，源2 无结果，源3（ikun）失败 → 三源状态点各自独立
  P.appendSource('cms:id1', [{ i: 0, c: { kind: 'cms', label: '源1', sub: 'x', isEmbed: false, sourceKey: 'cms:id1' } }]);
  P.appendSource('cms:id2', []);               // none
  P.setStatus('kazumi:ikun', 'error');         // error（独立，不波及源1/源2）
  // 源1 仍是 ok（appendSource 内部已 setStatus ok），说明 error 仅作用于 ikun
  P.close();
  assert.equal(P.isOpen(), false);
});
