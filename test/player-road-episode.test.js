/*
 * player-road-episode.js 阶段3 播放器侧线路/选集切换回归测试
 * 锁：线路切换按集名跨线路对齐（复用 detail-core.alignEpisodeByIdentifier，P7）、
 *     单源单集不渲染控件、选集高亮同步。
 * 用 vm 沙箱加载模块；跨 realm 比较用 JSON.stringify；DOM 用最小 mock。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function matchMockSel(node, sel) {
  sel = sel.trim();
  if (sel[0] === '.') {
    // 复合类选择器 .a.b.c：每个类都需在节点 classList 中
    const parts = sel.slice(1).split('.').filter(Boolean);
    const cls = node._classes();
    return parts.every((p) => cls.indexOf(p) >= 0);
  }
  if (sel[0] === '[') {
    const m = sel.match(/^\[([^=]+)=(?:"([^"]*)"|'([^']*)')\]$/);
    if (m) { const attr = m[1], val = m[2] !== undefined ? m[2] : m[3]; return node.getAttribute(attr) === val; }
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
    tagName: tag, className: '', textContent: '', type: '', value: '', selected: false,
    children: [], style: {}, attrs: {}, parentNode: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; },
    addEventListener() {},
    _classes() { return (this.className || '').split(/\s+/).filter(Boolean); },
    querySelector(sel) { return mockQueryFirst(this, sel); },
    querySelectorAll(sel) { return mockQueryAll(this, sel); }
  };
  el.classList = {
    add(c) { const s = new Set(el._classes()); s.add(c); el.className = Array.from(s).join(' '); },
    remove(c) { const s = new Set(el._classes()); s.delete(c); el.className = Array.from(s).join(' '); },
    toggle(c, on) { const s = new Set(el._classes()); if (on === undefined) on = !s.has(c); if (on) s.add(c); else s.delete(c); el.className = Array.from(s).join(' '); return on; },
    contains(c) { return el._classes().indexOf(c) >= 0; }
  };
  return el;
}

function loadModuleWithDom() {
  const overlay = makeMockEl('div');
  overlay.id = 'sfv-overlay';
  const body = makeMockEl('body');
  body.appendChild(overlay);
  const doc = { body, documentElement: makeMockEl('html'), getElementById: (id) => (id === 'sfv-overlay' ? overlay : null), createElement: (t) => makeMockEl(t) };
  const ctx = { window: null, document: doc, requestAnimationFrame: (f) => f(), console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  const code = fs.readFileSync(path.join(ROOT, 'public/video/player-road-episode.js'), 'utf8');
  vm.runInContext(code, ctx);
  loadModuleWithDom.__overlay = overlay;
  return ctx.StellaflixVideo.playerRoadEpisode;
}

// 复用 detail-core 的 alignEpisodeByIdentifier（注入到 SFV.detail）
function loadDetailCore(ctx) {
  const code = fs.readFileSync(path.join(ROOT, 'public/video/detail-core.js'), 'utf8');
  vm.runInContext(code, ctx);
}

test('单源单集不渲染控件（close）', () => {
  const P = loadModuleWithDom();
  P.open({ view: {}, plays: [{ from: '线路1', episodes: [{ name: '第1集', url: 'u', index: 0 }] }], fromIndex: 0, currentEpisodeIndex: 0 });
  // 单源单集 → root 未挂载（ensureRoot 返回后 open 直接 close）
  assert.equal(P._test.currentEpisodeName() == null, true, '无数据时不报错');
});

test('多线路渲染下拉 + 选集网格（仅多集时显示）', () => {
  const P = loadModuleWithDom();
  const plays = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }, { name: '第2集', url: 'a2', index: 1 }] },
    { from: '线路B', episodes: [{ name: '第1集', url: 'b1', index: 0 }, { name: '第2集', url: 'b2', index: 1 }] }
  ];
  // 用真实 document.getElementById('sfv-overlay') 检索挂载结果
  const overlay = (P && null);
  P.open({ view: {}, plays, fromIndex: 0, currentEpisodeIndex: 0, onSwitchRoad() {}, onPickEpisode() {} });
  // open 后 root 挂在 #sfv-overlay 下：检测下拉 select 与选集 chip 数量
  const root = loadModuleWithDom.__overlay;
  assert.ok(root, '悬浮层应挂载到 #sfv-overlay');
  const sel = root.querySelector('.sfv-road-ep-select');
  assert.ok(sel, '多线路应渲染线路下拉');
  assert.equal(sel.children.length, 2, '下拉应有 2 个 option');
  const chips = root.querySelectorAll('.sfv-road-ep-chip');
  assert.equal(chips.length, 2, '当前线路应有 2 个选集 chip');
  const cur = root.querySelector('.sfv-road-ep-chip.is-current');
  assert.ok(cur, '当前集应有 is-current 高亮');
});

test('playEpisodeAt 同步选集高亮（setCurrentEpisode）', () => {
  const P = loadModuleWithDom();
  const plays = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }, { name: '第2集', url: 'a2', index: 1 }, { name: '第3集', url: 'a3', index: 2 }] }
  ];
  P.open({ view: {}, plays, fromIndex: 0, currentEpisodeIndex: 0 });
  const root = loadModuleWithDom.__overlay;
  P.setCurrentEpisode(2);
  const cur = root.querySelector('.sfv-road-ep-chip.is-current');
  assert.ok(cur, '切换到第3集后应有 is-current 高亮');
  assert.equal(cur.textContent, '第3集', '高亮应为第3集');
});

test('线路切换跨线路按集名对齐（复用 alignEpisodeByIdentifier，P7）', () => {
  // 直接用 detail-core 验证对齐语义：集名一致 → 命中；集数不等/顺序不一致 → null
  const ctx = { window: null, document: null, console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  loadDetailCore(ctx);
  const D = ctx.StellaflixVideo.detail;
  const plays = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }, { name: '第2集', url: 'a2', index: 1 }] },
    { from: '线路B', episodes: [{ name: '第1集', url: 'b1', index: 0 }, { name: '第2集', url: 'b2', index: 1 }] }
  ];
  const r = D.alignEpisodeByIdentifier(plays, 1, '第2集', 1);
  assert.ok(r, '集名命中应返回对齐结果');
  assert.equal(r.fromIndex, 1);
  assert.equal(r.episodeIndex, 1);
  // 集名在目标线路不存在 → null（集数不等/顺序不一致不静默错集）
  const plays2 = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }, { name: '第2集', url: 'a2', index: 1 }] },
    { from: '线路B', episodes: [{ name: '特别篇', url: 'b0', index: 0 }] }
  ];
  const r2 = D.alignEpisodeByIdentifier(plays2, 1, '第2集', 1);
  assert.equal(r2, null, '目标线路无同名集应返回 null');
});

test('F4 线路切换对齐失败→不静默跳集（decideRoadSwitch）', () => {
  // 注入 detail-core 复用 alignEpisodeByIdentifier，验证 decideRoadSwitch 决策：
  //   集名一致 → ok:true + 正确 episodeIndex；目标线路无同名集 → ok:false（绝不返回静默 clamp 的 index）
  const ctx = { window: null, document: null, console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  loadDetailCore(ctx);
  const code = fs.readFileSync(path.join(ROOT, 'public/video/player-road-episode.js'), 'utf8');
  vm.runInContext(code, ctx);
  const P = ctx.StellaflixVideo.playerRoadEpisode;

  const plays = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }, { name: '第2集', url: 'a2', index: 1 }] },
    { from: '线路B', episodes: [{ name: '第1集', url: 'b1', index: 0 }, { name: '第2集', url: 'b2', index: 1 }] }
  ];
  const ok = P._test.decideRoadSwitch(plays, 1, '第2集', 1);
  assert.equal(ok.ok, true, '集名命中应决策切换');
  assert.equal(ok.episodeIndex, 1, '应命中目标线路同名集的 index');

  // 目标线路无同名集（集数不等/顺序不一致）：曾用 Math.min(curIdx, len-1) 静默跳到错误集，
  // 现应返回 ok:false，交由上层提示，绝不返回任何 episodeIndex。
  const plays2 = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }, { name: '第2集', url: 'a2', index: 1 }] },
    { from: '线路B', episodes: [{ name: '特别篇', url: 'b0', index: 0 }] }
  ];
  const fail = P._test.decideRoadSwitch(plays2, 1, '第2集', 1);
  assert.equal(fail.ok, false, '对齐失败应返回 ok:false，绝不静默跳集');
  assert.equal('episodeIndex' in fail, false, '失败决策不应携带 episodeIndex，避免上层误用');
});

test('F3 浮动层操作状态机 setStatus(wait/ok/error)', () => {
  // 对齐 Kazumi 错误状态机：播放器侧线路/选集切换应暴露 wait/ok/error 状态，
  // 渲染为 root 的 data-road-ep-state，供 CSS 反馈用户。
  const P = loadModuleWithDom();
  const plays = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }, { name: '第2集', url: 'a2', index: 1 }] },
    { from: '线路B', episodes: [{ name: '第1集', url: 'b1', index: 0 }, { name: '第2集', url: 'b2', index: 1 }] }
  ];
  P.open({ view: {}, plays, fromIndex: 0, currentEpisodeIndex: 0, onSwitchRoad() {}, onPickEpisode() {} });
  const root = loadModuleWithDom.__overlay.children[0];
  assert.ok(root, '悬浮层 root 应挂载到 #sfv-overlay 下');
  assert.equal(root.getAttribute('data-road-ep-state'), null, '初始应无状态属性（中性）');
  P.setStatus('wait');
  assert.equal(root.getAttribute('data-road-ep-state'), 'wait', '切换中应置 wait');
  P.setStatus('ok');
  assert.equal(root.getAttribute('data-road-ep-state'), 'ok', '成功应置 ok');
  P.setStatus('error');
  assert.equal(root.getAttribute('data-road-ep-state'), 'error', '失败应置 error');
  // 非法/空值 → 清除状态属性（回到中性）
  P.setStatus('garbage');
  assert.equal(root.getAttribute('data-road-ep-state'), null, '非法值应清除状态属性');
  P.setStatus('');
  assert.equal(root.getAttribute('data-road-ep-state'), null, '空值应清除状态属性');
});
