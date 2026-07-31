/*
 * Step 4 逻辑测试：vm 沙箱加载真实源码 public/video/sources.js + fx-sources.js
 *
 * 覆盖四块：
 *   A. 片源 CRUD 与归一化（含非法输入、重复导入）
 *   B. CMS10 协议层纯函数（URL 构造 / vod_play_url 解析 / 归并去重）
 *   C. IO 层（stub fetch）：连通性测试、聚合搜索的并发降级与错误收集、强制走 /api/proxy
 *   D. 控制台分页注入：绕过 index.html:25754 的硬编码白名单、事件挂在 window 而非 document
 *
 * 合规断言（硬性）：源码中不得出现任何硬编码站点地址，出厂片源列表必须为空。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n[' + t + ']'); }

const ROOT = path.join(__dirname, '..');
const VDIR = path.join(ROOT, 'public', 'video');
const read = f => fs.readFileSync(path.join(VDIR, f), 'utf8');

const sourcesSrc = read('sources.js');
const fxSrc = read('fx-sources.js');

// ---------------------------------------------------------------- DOM stub
//
// 关键不变量：真实浏览器中 el.className 与 el.classList 永远镜像同一份数据。
// 早期 stub 用独立 Set 承载 classList，导致「直接给 className 赋值」不会回填 Set，
// 后续 classList.toggle 又用 Set 内容回写 className，把原 class 覆盖成空串 ——
// 这一桩缺陷会让 fx-sources 注入的分页在原生 setFxPanelTab 切换时失踪，误报 FAIL。
// 此处改为单一数据源：className 为显式存取字段，classList 每次读写都基于它解析/写回。

function makeEl(tag, cls) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _class: '',
    style: {}, attributes: {}, children: [], parentNode: null,
    textContent: '', value: '', innerHTML: '', disabled: false,
    _listeners: {},
  };
  Object.defineProperty(el, 'className', {
    get() { return el._class; },
    set(v) { el._class = (v == null ? '' : String(v)); },
  });
  const parse = () => el._class.split(/\s+/).filter(Boolean);
  const write = set => { el._class = [...set].join(' '); };
  el.classList = {
    add: c => { const s = new Set(parse()); s.add(c); write(s); },
    remove: c => { const s = new Set(parse()); s.delete(c); write(s); },
    contains: c => parse().includes(c),
    toggle(c, force) {
      const s = new Set(parse());
      const on = force === undefined ? !s.has(c) : !!force;
      if (on) s.add(c); else s.delete(c);
      write(s);
      return on;
    },
  };
  if (cls) el.className = cls;
  el.addEventListener = (t, fn, capture) => {
    (el._listeners[t] = el._listeners[t] || []).push({ fn, capture: !!capture });
  };
  el.appendChild = c => { el.children.push(c); c.parentNode = el; return c; };
  el.removeChild = c => { el.children = el.children.filter(x => x !== c); return c; };
  el.setAttribute = (k, v) => { el.attributes[k] = String(v); };
  el.getAttribute = k => (k in el.attributes ? el.attributes[k] : null);
  el.querySelector = sel => {
    const want = sel.replace(/^\./, '');
    const walk = node => {
      for (const c of node.children) {
        if ((c.className || '').split(/\s+/).includes(want)) return c;
        const deep = walk(c);
        if (deep) return deep;
      }
      return null;
    };
    return walk(el);
  };
  el.closest = sel => {
    const want = sel.replace(/^\./, '');
    let n = el;
    while (n) {
      if ((n.className || '').split(/\s+/).includes(want)) return n;
      n = n.parentNode;
    }
    return null;
  };
  return el;
}

function collect(root, pred, out) {
  out = out || [];
  for (const c of root.children) {
    if (pred(c)) out.push(c);
    collect(c, pred, out);
  }
  return out;
}

function makeSandbox(opts) {
  opts = opts || {};
  const store = new Map();
  const panel = makeEl('div');
  panel.id = 'fx-panel';
  const tabs = makeEl('div', 'fx-panel-tabs');
  tabs.id = 'fx-panel-tabs';
  // 复刻 index.html:25796 的 5 个原生分页
  const nativeKeys = ['presets', 'appearance', 'lyrics', 'motion', 'advanced'];
  const nativePages = [];
  nativeKeys.forEach(k => {
    const b = makeEl('button');
    b.setAttribute('data-fx-tab', k);
    tabs.appendChild(b);
    const p = makeEl('div', 'fx-tab-page');
    p.setAttribute('data-fx-page', k);
    panel.appendChild(p);
    nativePages.push(p);
  });

  const byId = { 'fx-panel': panel, 'fx-panel-tabs': tabs };
  const docListeners = {};
  const doc = {
    readyState: opts.loading ? 'loading' : 'complete',
    body: makeEl('body'),
    documentElement: makeEl('html'),
    createElement: t => makeEl(t),
    getElementById: id => byId[id] || null,
    querySelector: () => null,
    querySelectorAll: sel => {
      if (sel === '#fx-panel-tabs [data-fx-tab]') {
        return collect(tabs, c => c.getAttribute && c.getAttribute('data-fx-tab') !== null);
      }
      if (sel === '#fx-panel .fx-tab-page') {
        return collect(panel, c => (c.className || '').split(/\s+/).includes('fx-tab-page'));
      }
      return [];
    },
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  };

  const winListeners = {};
  const timers = [];
  const sandbox = {
    console: { warn: () => {}, error: () => {}, log: () => {} },
    document: doc,
    URL,
    Promise,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Error,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); timers.push(id); return id; },
    clearInterval: id => clearInterval(id),
    addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
    AbortController: function AbortController() {
      this.signal = { aborted: false };
      this.abort = () => { this.signal.aborted = true; };
    },
    fetch: opts.fetch || undefined,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  return { sandbox, doc, panel, tabs, store, winListeners, docListeners, timers, nativePages };
}

function loadSources(ctx) {
  vm.runInContext(sourcesSrc, ctx.sandbox, { filename: 'sources.js' });
  return ctx.sandbox.StellaflixVideo.sources;
}

// ================================================================ A. CRUD

section('A. 片源归一化与 CRUD');
{
  const ctx = makeSandbox();
  const S = loadSources(ctx);

  assert(S.normalizeSource(null).reason === 'empty-input', '空输入 → empty-input');
  assert(S.normalizeSource({ api: '' }).reason === 'empty-api', '空 api → empty-api');
  assert(S.normalizeSource({ api: 'not a url' }).reason === 'invalid-api-url', '非法 URL 被拒');
  assert(/^unsupported-scheme/.test(S.normalizeSource({ api: 'ftp://h/x' }).reason), 'ftp 协议被拒');

  const ok = S.normalizeSource({ api: 'https://example.test/api.php/provide/vod' });
  assert(ok.ok === true, '合法 https 接口通过');
  assert(ok.source.name === 'example.test', '名称留空时回退为域名');
  assert(ok.source.enabled === true, '默认启用');
  assert(S.normalizeSource({ api: 'https://a.test/x', enabled: false }).source.enabled === false,
    'enabled:false 被保留');

  assert(S.getSources().length === 0, '出厂片源列表为空（合规红线）');

  const r1 = S.addSource({ name: '甲', api: 'https://a.test/api.php/provide/vod' });
  assert(r1.ok && S.getSources().length === 1, 'addSource 成功');
  const dup = S.addSource({ name: '甲副本', api: 'https://a.test/api.php/provide/vod' });
  assert(dup.ok === false && dup.reason === 'duplicate-api', '同 api 重复导入被拒');

  S.addSource({ name: '乙', api: 'https://b.test/api.php/provide/vod', enabled: false });
  assert(S.getSources().length === 2, '第二个源已入库');
  assert(S.getEnabledSources().length === 1, 'getEnabledSources 过滤停用项');

  const id1 = S.getSources()[0].id;
  S.setEnabled(id1, false);
  assert(S.getEnabledSources().length === 0, 'setEnabled(false) 生效');
  S.setEnabled(id1, true);
  assert(S.getEnabledSources().length === 1, 'setEnabled(true) 恢复');

  const up = S.updateSource(id1, { name: '甲改' });
  assert(up.ok && S.getSources()[0].name === '甲改', 'updateSource 改名成功');
  assert(S.getSources()[0].id === id1, 'updateSource 保持 id 不变');
  assert(S.updateSource('nope', { name: 'x' }).reason === 'not-found', '更新不存在的源 → not-found');

  S.removeSource(id1);
  assert(S.getSources().length === 1, 'removeSource 生效');
  assert(ctx.store.has('stellaflix-video-sources'), '使用 stellaflix-video-sources 键');
}

// ================================================================ B. 协议层

section('B. CMS10 协议层纯函数');
{
  const ctx = makeSandbox();
  const S = loadSources(ctx);
  const src = { id: 's1', name: 'x', api: 'https://a.test/api.php/provide/vod', enabled: true };

  const u1 = S.buildListUrl(src, { wd: '你好 世界', pg: 2 });
  assert(u1.indexOf('?ac=videolist') > 0, 'buildListUrl 首参用 ?');
  assert(u1.indexOf('wd=' + encodeURIComponent('你好 世界')) > 0, '关键词已 URL 编码');
  assert(u1.indexOf('pg=2') > 0, '页码带上');

  const src2 = { id: 's2', name: 'y', api: 'https://a.test/api.php?k=1', enabled: true };
  assert(S.buildListUrl(src2, {}).indexOf('?k=1&ac=videolist') > 0, 'api 已带 ? 时改用 &');
  assert(S.buildListUrl(src, {}).indexOf('wd=') < 0, '空关键词不产生空参数');
  assert(S.buildDetailUrl(src, '123').indexOf('ac=detail&ids=123') > 0, 'buildDetailUrl 正确');

  assert(S.parsePlayUrl('', '').length === 0, '空 playUrl → 空数组');

  const single = S.parsePlayUrl('线路A', '第1集$https://v.test/1.m3u8#第2集$https://v.test/2.m3u8');
  assert(single.length === 1, '单播放源解析出 1 组');
  assert(single[0].from === '线路A', '播放源名称正确');
  assert(single[0].episodes.length === 2, '解析出 2 集');
  assert(single[0].episodes[0].name === '第1集', '集名正确');
  assert(single[0].episodes[0].url === 'https://v.test/1.m3u8', '集地址正确');
  assert(single[0].episodes[1].index === 1, '集序号从 0 递增');

  const multi = S.parsePlayUrl('线路A$$$线路B', '第1集$https://a.test/1.m3u8$$$第1集$https://b.test/1.m3u8');
  assert(multi.length === 2, '$$$ 分隔出 2 个播放源');
  assert(multi[1].from === '线路B', '第二播放源名称正确');
  assert(multi[1].episodes[0].url === 'https://b.test/1.m3u8', '第二播放源地址正确');

  const noName = S.parsePlayUrl('线路A', 'https://v.test/only.m3u8');
  assert(noName[0].episodes[0].name === '第1集', '无集名时自动编号');

  const evil = S.parsePlayUrl('X', '恶意$javascript:alert(1)#正常$https://v.test/ok.m3u8');
  assert(evil[0].episodes.length === 1, 'javascript: 伪协议被丢弃');
  assert(evil[0].episodes[0].url === 'https://v.test/ok.m3u8', '仅保留 http(s) 地址');

  const query = S.parsePlayUrl('X', '第1集$https://v.test/p.m3u8?t=1&k=2');
  assert(query[0].episodes[0].url === 'https://v.test/p.m3u8?t=1&k=2', '含查询串的地址不被截断');

  const vod = S.normalizeVod({ vod_id: 7, vod_name: '片名', vod_pic: 'p.jpg', vod_year: '2024' }, src);
  assert(vod.key === 's1:7', 'normalizeVod 生成 源id:vodid 复合键');
  assert(vod.vodId === '7' && vod.title === '片名', 'normalizeVod 字段映射正确');
  assert(S.normalizeVod({ vod_name: '无 id' }, src) === null, '缺 vod_id 的记录被丢弃');

  assert(S.extractList({ list: [1, 2] }).length === 2, 'extractList 兼容 json.list');
  assert(S.extractList({ data: [1] }).length === 1, 'extractList 兼容 json.data 数组');
  assert(S.extractList({ data: { list: [1, 2, 3] } }).length === 3, 'extractList 兼容 json.data.list');
  assert(S.extractList(null).length === 0, 'extractList 对 null 安全');

  const merged = S.dedupe([
    { title: '同名片', year: '2024', pic: '', variants: undefined, sourceId: 'a' },
    { title: '同名片', year: '2024', pic: 'p.jpg', sourceId: 'b' },
    { title: '同名片', year: '2020', sourceId: 'c' },
  ]);
  assert(merged.length === 2, 'dedupe 按 片名+年份 归并');
  assert(merged[0].variants.length === 2, '同名同年保留 2 个来源变体');
  assert(merged[0].pic === 'p.jpg', '归并时补齐缺失封面');
}

// ================================================================ C. IO 层

section('C. IO 层（stub fetch）');

function mkFetch(routes) {
  const calls = [];
  const fn = (url) => {
    calls.push(url);
    const hit = Object.keys(routes).find(k => url.indexOf(k) >= 0);
    const r = hit ? routes[hit] : { status: 404 };
    if (r.reject) return Promise.reject(new Error(r.reject));
    return Promise.resolve({
      ok: r.status === undefined || r.status === 200,
      status: r.status === undefined ? 200 : r.status,
      text: () => Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body || {})),
    });
  };
  fn.calls = calls;
  return fn;
}

(async function ioTests() {
  {
    const f = mkFetch({ 'a.test': { body: { list: [{ vod_id: 1, vod_name: 'A' }] } } });
    const ctx = makeSandbox({ fetch: f });
    const S = loadSources(ctx);
    const r = await S.testSource({ name: 'a', api: 'https://a.test/api.php/provide/vod' });
    assert(r.ok === true && r.count === 1, 'testSource 连通成功并计数');
    assert(f.calls[0].indexOf('/api/proxy?url=') === 0, 'testSource 请求经 /api/proxy 转发');
    assert(f.calls[0].indexOf(encodeURIComponent('https://a.test')) > 0, '原始地址被 URL 编码进代理参数');
  }
  {
    const ctx = makeSandbox({ fetch: mkFetch({ 'a.test': { body: { list: [] } } }) });
    const S = loadSources(ctx);
    const r = await S.testSource({ name: 'a', api: 'https://a.test/x' });
    assert(r.ok === false && r.reason === 'empty-list', '空列表 → empty-list');
  }
  {
    const ctx = makeSandbox({ fetch: mkFetch({ 'a.test': { status: 502 } }) });
    const S = loadSources(ctx);
    const r = await S.testSource({ name: 'a', api: 'https://a.test/x' });
    assert(r.ok === false && r.reason === 'http-502', 'HTTP 502 被如实报告');
  }
  {
    const ctx = makeSandbox({ fetch: mkFetch({ 'a.test': { body: 'not json' } }) });
    const S = loadSources(ctx);
    const r = await S.testSource({ name: 'a', api: 'https://a.test/x' });
    assert(r.reason === 'invalid-json', '非 JSON 响应 → invalid-json');
  }
  {
    const ctx = makeSandbox({ fetch: mkFetch({}) });
    const S = loadSources(ctx);
    const r = await S.search('');
    assert(r.items.length === 0, '空关键词直接返回空');
    const r2 = await S.search('片');
    assert(r2.noSource === true, '无启用源时标记 noSource');
  }
  {
    const f = mkFetch({
      'a.test': { body: { list: [{ vod_id: 1, vod_name: '同片', vod_year: '2024' }] } },
      'b.test': { body: { list: [{ vod_id: 9, vod_name: '同片', vod_year: '2024' }] } },
    });
    const ctx = makeSandbox({ fetch: f });
    const S = loadSources(ctx);
    S.addSource({ name: '甲', api: 'https://a.test/api' });
    S.addSource({ name: '乙', api: 'https://b.test/api' });
    const r = await S.search('同片');
    assert(r.items.length === 1, '跨源同名片归并为 1 条');
    assert(r.items[0].variants.length === 2, '保留 2 个来源供切换');
    assert(r.errors.length === 0, '全部成功时 errors 为空');
    assert(f.calls.length === 2, '两个源并发请求');
  }
  {
    const f = mkFetch({
      'a.test': { body: { list: [{ vod_id: 1, vod_name: '甲片' }] } },
      'b.test': { reject: 'boom' },
    });
    const ctx = makeSandbox({ fetch: f });
    const S = loadSources(ctx);
    S.addSource({ name: '甲', api: 'https://a.test/api' });
    S.addSource({ name: '乙', api: 'https://b.test/api' });
    const r = await S.search('片');
    assert(r.items.length === 1, '单源失败不阻断整体聚合');
    assert(r.errors.length === 1 && r.errors[0].name === '乙', '失败源被记录进 errors');
  }
  {
    const f = mkFetch({
      'a.test': { body: { list: [{ vod_id: 5, vod_name: '剧', vod_play_from: '线A',
        vod_play_url: '第1集$https://v.test/1.m3u8#第2集$https://v.test/2.m3u8' }] } },
    });
    const ctx = makeSandbox({ fetch: f });
    const S = loadSources(ctx);
    const r = await S.detail({ name: '甲', api: 'https://a.test/api' }, '5');
    assert(r.ok === true, 'detail 成功');
    assert(r.plays.length === 1 && r.plays[0].episodes.length === 2, 'detail 直接产出剧集列表');
    assert(f.calls[0].indexOf(encodeURIComponent('ac=detail')) > 0, 'detail 使用 ac=detail');
  }
  {
    const ctx = makeSandbox({ fetch: mkFetch({ 'a.test': { body: { list: [] } } }) });
    const S = loadSources(ctx);
    const r = await S.detail({ name: '甲', api: 'https://a.test/api' }, '5');
    assert(r.ok === false && r.reason === 'not-found', 'detail 空结果 → not-found');
  }
  {
    const ctx = makeSandbox({});
    const S = loadSources(ctx);
    const r = await S.testSource({ name: 'a', api: 'https://a.test/x' });
    assert(r.reason === 'fetch-unavailable', '无 fetch 环境时如实报错而非崩溃');
  }

  runFxTests();
})();

// ================================================================ D. 控制台分页

function runFxTests() {
  section('D. 控制台「片源」分页注入');
  {
    const ctx = makeSandbox();
    loadSources(ctx);

    // 复刻 index.html:25753 setFxPanelTab 的真实行为（含 25754 硬编码白名单）
    let lastNative = null;
    ctx.sandbox.setFxPanelTab = function (tab) {
      const allowed = { presets: 1, appearance: 1, lyrics: 1, motion: 1, advanced: 1 };
      const next = allowed[tab] ? tab : 'presets';
      lastNative = next;
      ctx.panel.setAttribute('data-active-tab', next);
      ctx.doc.querySelectorAll('#fx-panel-tabs [data-fx-tab]').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-fx-tab') === next));
      ctx.doc.querySelectorAll('#fx-panel .fx-tab-page').forEach(p =>
        p.classList.toggle('active', p.getAttribute('data-fx-page') === next));
    };
    // 影视态
    ctx.sandbox.StellaflixVideo.state = { isVideo: () => true };

    vm.runInContext(fxSrc, ctx.sandbox, { filename: 'fx-sources.js' });
    const FX = ctx.sandbox.StellaflixVideo.fxSources;

    assert(FX.isInjected() === true, '分页已注入');
    const btns = ctx.doc.querySelectorAll('#fx-panel-tabs [data-fx-tab]');
    assert(btns.length === 6, 'tab 按钮从 5 个增至 6 个');
    assert(btns[5].getAttribute('data-fx-tab') === 'sfvsource', '新按钮 data-fx-tab=sfvsource');
    assert(btns[5].textContent === '片源', '新按钮文案为「片源」');
    assert((btns[5].className || '').includes('sfv-fx-tab'), '新按钮带 sfv-fx-tab 类（供 CSS 控显隐）');

    const pages = ctx.doc.querySelectorAll('#fx-panel .fx-tab-page');
    assert(pages.length === 6, '内容面板同步增至 6 个');
    assert(pages[5].getAttribute('data-fx-page') === 'sfvsource', '新面板 data-fx-page 与按钮 key 一致');

    assert(FX.isWrapped() === true, 'setFxPanelTab 已被包装');
    assert(typeof ctx.sandbox.setFxPanelTab.__sfvOriginal === 'function', '原函数被保留可回退');

    // 核心：原函数白名单会把 sfvsource 回落到 presets，包装后必须不回落
    ctx.sandbox.setFxPanelTab('sfvsource');
    assert(ctx.panel.getAttribute('data-active-tab') === 'sfvsource',
      '切到 sfvsource 未被白名单回落（绕过 index.html:25754）');
    assert(lastNative === null, '切本页时完全不调用原函数');
    assert(btns[5].classList.contains('active'), '本页按钮激活');
    assert(pages[5].classList.contains('active'), '本页面板激活');
    assert(!pages[0].classList.contains('active'), '其余面板被取消激活');

    ctx.sandbox.setFxPanelTab('motion');
    assert(lastNative === 'motion', '切原生分页时委派给原函数');
    assert(ctx.panel.getAttribute('data-active-tab') === 'motion', '原生分页切换正常');
    assert(!pages[5].classList.contains('active'), '切走后本页被取消激活');

    // 关键回归：spacechange 由 state.js:38 在 window 上派发，监听 document 会静默失效
    assert(Array.isArray(ctx.winListeners['spacechange']) && ctx.winListeners['spacechange'].length === 1,
      'spacechange 监听挂在 window 上（不是 document）');
    assert(!ctx.docListeners['spacechange'], 'document 上没有误挂 spacechange');

    // 音乐态下若仍停留在本页，须回落，否则控制台空白
    ctx.sandbox.setFxPanelTab('sfvsource');
    ctx.sandbox.StellaflixVideo.state.isVideo = () => false;
    ctx.winListeners['spacechange'][0]({ detail: { spaceMode: 'music' } });
    assert(ctx.panel.getAttribute('data-active-tab') === 'presets',
      '切回音乐态时从本页回落到 presets');
  }
  {
    // 面板尚未生成时应轮询等待，而不是直接放弃
    const ctx = makeSandbox();
    loadSources(ctx);
    ctx.doc.getElementById = () => null;
    ctx.sandbox.setFxPanelTab = function () {};
    vm.runInContext(fxSrc, ctx.sandbox, { filename: 'fx-sources.js' });
    assert(ctx.sandbox.StellaflixVideo.fxSources.isInjected() === false,
      '面板不存在时不注入');
    assert(ctx.timers.length === 1, '启动轮询等待 bindFxPanel() 生成面板');
    ctx.timers.forEach(clearInterval);
  }

  runStaticTests();
}

// ================================================================ E. 合规与集成

function runStaticTests() {
  section('E. 合规红线与集成');

  const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const codeOnly = stripComments(sourcesSrc) + '\n' + stripComments(fxSrc);

  // 代码区不得有任何「真实」站点地址。放行两类安全占位：
  //   1) 含 ... 的示例（如 placeholder「https://.../api.php/provide/vod」）
  //   2) 以 example. / test. 等保留域名为首的文档示例
  const urlLiterals = (codeOnly.match(/https?:\/\/[^\s'"`)]+/g) || [])
    .filter(u => !/\.\.\./.test(u) && !/^https?:\/\/(example|test|localhost|127\.0\.0\.1)\b/i.test(u));
  assert(urlLiterals.length === 0,
    '代码区零硬编码站点地址（发现 ' + urlLiterals.length + ' 处）');

  assert(!/api_site\s*[:=]/.test(codeOnly), '不存在 api_site 预置配置项');
  assert(/KEY_SOURCES\s*=\s*NS\s*\+\s*'sources'/.test(sourcesSrc), '片源存 stellaflix-video-sources');
  assert(/readJSON\(KEY_SOURCES,\s*\[\]\)/.test(sourcesSrc), '读取片源时默认空数组（出厂无源）');
  assert(/不提供、不存储/.test(fxSrc), '片源分页含「不提供、不存储」声明');
  assert(/自行确认其合法性/.test(fxSrc), '片源分页含风险提示');

  const css = fs.readFileSync(path.join(VDIR, 'player.css'), 'utf8');
  assert(/\.sfv-fx-tab\s*\{\s*display:\s*none/.test(css), '音乐态隐藏片源 tab');
  assert(/body\.video-space-active\s+\.sfv-fx-tab\s*\{\s*display:\s*block/.test(css), '影视态显示片源 tab');
  assert(/body\.video-space-active\s+\.fx-panel-tabs[\s\S]{0,80}repeat\(6/.test(css),
    '影视态覆盖 grid 为 6 列（index.html:2052 写死 5 列）');
  assert(!/^\.fx-panel-tabs\s*\{/m.test(css), '未无条件覆盖原生 .fx-panel-tabs（音乐态零回归）');

  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert(html.indexOf('<script src="video/sources.js"></script>') > 0, 'index.html 引入 sources.js');
  assert(html.indexOf('<script src="video/fx-sources.js"></script>') > 0, 'index.html 引入 fx-sources.js');
  assert(!/StellaflixVideo\.sources\./.test(html), 'index.html 中无影视业务逻辑（仅 script 引入）');

  console.log('\n========================================');
  console.log('  Step 4 逻辑测试： ' + pass + ' pass / ' + fail + ' fail');
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}
