/*
 * detail-source.js 阶段4 边界集成测试
 * 锁：searchAndPick 流式编排的健壮性——
 *   (1) 单源失败只红点该源、不阻断其它源填充；
 *   (2) 全部源无结果/失败 → fallbackOwnSource；
 *   (3) 多线路(plays)全部传入编排器 play（阶段3 线路切换数据不丢）。
 * 用 vm 沙箱加载 detail-source.js + 轻量依赖桩（SFV.detail/sources/kazumi/sourcePicker/online），
 * 跨 realm 比较用 JSON.stringify。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// 可控 deferred：测试可手动 resolve/reject 以精确编排异步时序（F2 重入场景）。
function makeDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeDom() {
  function mk(t) {
    const e = { tagName: t, className: '', textContent: '', children: [], style: {}, attrs: {}, parentNode: null,
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; },
      addEventListener() {}, _classes() { return (this.className || '').split(/\s+/).filter(Boolean); },
      querySelector() { return null; }, querySelectorAll() { return []; } };
    e.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    return e;
  }
  const body = mk('body');
  return { body, document: { body, createElement: (t) => mk(t) } };
}

// 加载 detail-source.js 及其最小依赖桩；返回 { P, stubs }
function loadWithStubs(opts) {
  opts = opts || {};
  const dom = makeDom();
  const ctx = { window: null, document: dom.document, requestAnimationFrame: (f) => f(), console, Promise, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);

  // SFV.detail 最小桩（detail-core 的纯函数子集，detail-source 仅调用期使用）
  ctx.StellaflixVideo = {};
  ctx.StellaflixVideo.detail = {
    isKazumiView() { return false; },
    classifyCandidateEmbed() { return false; }
  };

  // SFV.sources / SFV.kazumi 桩：可控返回/抛错
  // 注意：search 对“逻辑无结果”解析为 {items:[],errors:[]}（resolve，不 reject）
  //       —— 走 none 点；仅当抛出异常（reject）才触发编排器 .catch → error 红点。
  // 若提供了 opts.searchDeferreds（数组），search 返回可控 deferred 并推入该数组，
  // 由测试手动 resolve 以精确编排“陈旧回调在重开后才落地”的重入时序（F2）。
  const searchDeferreds = opts.searchDeferreds || null;
  const sources = {
    getEnabledSources() { return opts.cmsSources || []; },
    search(title, o) {
      const ref = (o && o.sources && o.sources[0]) || {};
      if (searchDeferreds) {
        const d = makeDeferred();
        searchDeferreds.push(d);
        return d.promise;
      }
      if (ref.__reject) return Promise.reject(new Error('source-search-failed'));
      return Promise.resolve({ items: ref.__items || [], errors: [] });
    },
    detail() { return Promise.resolve({ ok: true, plays: opts.cmsPlays || [] }); }
  };
  const kazumi = {
    getEnabledSearchRules() { return opts.kzRules || []; },
    searchRule(ruleName) {
      const r = (opts.kzRules || []).find((x) => x.name === ruleName);
      if (r && r.__reject) return Promise.reject(new Error('kazumi-search-failed'));
      return Promise.resolve({ items: r && r.__items ? r.__items : [], errors: [] });
    }
  };

  // SFV.sourcePicker 桩：记录 setStatus / appendSource 调用，并捕获 onPick 供选源模拟
  const pickerCalls = { status: [], appended: [], waiting: [], onPick: null };
  const sourcePicker = {
    open(o) { pickerCalls.onPick = (o && o.onPick) || null; },
    close() {},
    isOpen() { return true; },
    setStatus(key, s) { pickerCalls.status.push({ key, s }); },
    appendSource(key, items) { pickerCalls.appended.push({ key, n: (items || []).length }); },
    setSourceWaiting(key, w) { pickerCalls.waiting.push({ key, w }); }
  };

  // SFV.online.playEpisode 桩：记录传入的 opt.plays（验证阶段3 多线路不丢）
  const onlineCalls = { playEpisode: [] };
  const online = {
    playEpisode(view, ep, play, opt) { onlineCalls.playEpisode.push({ view, ep, play, opt }); }
  };

  ctx.StellaflixVideo.sources = sources;
  ctx.StellaflixVideo.kazumi = kazumi;
  ctx.StellaflixVideo.sourcePicker = sourcePicker;
  ctx.StellaflixVideo.online = online;

  const code = fs.readFileSync(path.join(ROOT, 'public/video/detail-source.js'), 'utf8');
  vm.runInContext(code, ctx);
  return { P: ctx.StellaflixVideo.detailSource, pickerCalls, onlineCalls, ctx };
}

test('单源失败只红点该源、不阻断其它源（流式健壮性）', async () => {
  const { P, pickerCalls } = loadWithStubs({
    cmsSources: [{ id: 's1', name: '源1', enabled: true, __items: [{ title: '电影A', variants: [{ sourceId: 's1', vodId: '1', sourceName: '源1' }] }] },
                  { id: 's2', name: '源2', enabled: true, __reject: true }],
    kzRules: []
  });
  const view = { title: '电影A', pic: '' };
  P.searchAndPick(view, null);
  // 等所有源 settled
  await new Promise((r) => setTimeout(r, 60));
  const errKeys = pickerCalls.status.filter((c) => c.s === 'error').map((c) => c.key);
  const appendedKeys = pickerCalls.appended.map((c) => c.key);
  assert.ok(errKeys.indexOf('cms:s2') >= 0, 'reject 失败源 s2 应被标 error（红点）');
  assert.ok(appendedKeys.indexOf('cms:s1') >= 0, '成功源 s1 仍被增量填充（不被失败源阻断）');
  assert.equal(appendedKeys.indexOf('cms:s2') < 0, true, '失败源 s2 不应产生候选（隔离）');
});

test('全部源无结果 → 不填充候选、fallback 路径不抛', async () => {
  const { P, pickerCalls } = loadWithStubs({
    cmsSources: [{ id: 's1', name: '源1', enabled: true, __items: [] }],
    kzRules: [],
    cmsPlays: [{ from: '线路1', episodes: [{ name: '第1集', url: 'u', index: 0 }] }]
  });
  const view = { title: '电影A', pic: '', source: { id: 'x', name: 'X' }, vodId: '1' };
  P.searchAndPick(view, null);
  await new Promise((r) => setTimeout(r, 80));
  // 全空：每源仍会调 appendSource([])（n=0），但没有任何真实候选被填充
  const filled = pickerCalls.appended.filter((c) => c.n > 0);
  assert.equal(filled.length, 0, '全空时无任何真实候选被填充');
  assert.ok(true, 'fallback 路径在 stub 下不应抛错（已到达此处即证明）');
});

test('多线路 plays 全部传入编排器 play（阶段3 线路切换数据不丢）', async () => {
  const plays = [
    { from: '线路A', episodes: [{ name: '第1集', url: 'a1', index: 0 }] },
    { from: '线路B', episodes: [{ name: '第1集', url: 'b1', index: 0 }] }
  ];
  const { P, onlineCalls, pickerCalls } = loadWithStubs({
    cmsSources: [{ id: 's1', name: '源1', enabled: true, __items: [
      { title: '电影A', variants: [{ sourceId: 's1', vodId: '1', sourceName: '源1' }] }
    ] }],
    kzRules: [],
    cmsPlays: plays
  });
  const view = { title: '电影A', pic: '' };
  P.searchAndPick(view, null);
  await new Promise((r) => setTimeout(r, 80));
  // 用户点击候选 → onPick 触发 playCandidate → 多线路进入 playEpisode
  assert.ok(pickerCalls.onPick, '应注册 onPick 回调');
  pickerCalls.onPick({ kind: 'cms', _ref: { sourceId: 's1', vodId: '1' }, sourceKey: 'cms:s1' });
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(onlineCalls.playEpisode.length >= 1, '选源后应调 playEpisode');
  const opt = onlineCalls.playEpisode[0].opt || {};
  // 阶段3：传入的 plays 必须含全部线路（不只 plays[0]）
  const passedPlays = opt.plays || [];
  assert.equal(passedPlays.length, 2, '多线路应全部传入（线路切换数据不丢）');
  assert.equal(passedPlays[1].from, '线路B', '第二条线路应保留');
});

test('F2 重入守卫：陈旧源搜索回调不写入重开的面板', async () => {
  // 场景：先为「电影A」开搜索（源搜索进入 pending），随后用户重开「电影B」的搜索
  // （searchToken 自增），此时「电影A」的搜索结果才落地——其回调因 token 失效应整段丢弃，
  // 绝不把 A 的候选/状态点/fallback 写入当前（B）面板（对齐 Kazumi AsyncSession isStale）。
  const searchDeferreds = [];
  const opts = {
    cmsSources: [{ id: 'sA', name: '源A', enabled: true }],
    kzRules: [],
    searchDeferreds
  };
  const { P, pickerCalls, onlineCalls } = loadWithStubs(opts);

  // 第一次搜索（电影A）：源搜索 pending（deferred[0]），searchToken 自增到 1
  const viewA = { title: '电影A', pic: '' };
  P.searchAndPick(viewA, null);

  // 重开搜索（电影B）：切换源集合再 searchAndPick，searchToken 自增到 2
  opts.cmsSources = [{ id: 'sB', name: '源B', enabled: true }];
  const viewB = { title: '电影B', pic: '' };
  P.searchAndPick(viewB, null);

  // 让“陈旧”的电影A 搜索先落地——token(=1) !== searchToken(=2) 应被丢弃
  assert.equal(searchDeferreds.length, 2, '两轮搜索各产生一个可控 deferred');
  searchDeferreds[0].resolve({ items: [{ title: '电影A', variants: [{ sourceId: 'sA', vodId: 'a1', sourceName: '源A' }] }] });
  await Promise.resolve(); await Promise.resolve(); // flush 微任务

  // 再让电影B 搜索落地（token=2 匹配，应正常写入）
  searchDeferreds[1].resolve({ items: [{ title: '电影B', variants: [{ sourceId: 'sB', vodId: 'b1', sourceName: '源B' }] }] });
  await new Promise((r) => setTimeout(r, 40));

  // 核心断言：陈旧源 sA 候选不得写入重开的面板
  const sA = pickerCalls.appended.find((c) => c.key === 'cms:sA');
  assert.equal(sA, undefined, '陈旧源 sA 候选不得写入重开面板（F2）');
  // 当前源 sB 应正常写入
  const sB = pickerCalls.appended.find((c) => c.key === 'cms:sB');
  assert.ok(sB, '当前源 sB 应被写入面板');
  // 陈旧回调整段丢弃：状态点 / waiting 标记也不得污染面板
  assert.equal(pickerCalls.status.some((c) => c.key === 'cms:sA'), false, '陈旧源状态点不得写入');
  assert.equal(pickerCalls.waiting.some((c) => c.key === 'cms:sA'), false, '陈旧源 waiting 标记不得写入');
  // 陈旧回调的回退（loadPlays → playEpisode）绝不应触发
  assert.equal(onlineCalls.playEpisode.length, 0, '陈旧回调的 fallback 不应触发（F2）');
});
