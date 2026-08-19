/*
 * ③ 自动连播测试（vm 沙箱，加载 public/video 真实源码）
 * 覆盖：
 *   A. player 播放模式 —— 默认值 / 持久化 / 非法回落 / 循环切换 / 按钮文案
 *   B. player ended 行为 —— 连播触发下一集且只触发一次 / 单集循环 / 不连播 / 回调抛错隔离 / 进度落盘
 *   C. player 钩子生命周期 —— prepareForPlay(openUrl) / openFile / openEmbed / close 均清空
 *   D. online 注册下一集 —— 正常中间集 / 末集 / 单集 / 空列表 / 无 play 参数 /
 *                          下一集无地址 / 注册时机在 open 之后 / 连播链式推进
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n[' + t + ']'); }

const VDIR = path.resolve(__dirname, '..', 'public', 'video');
const read = f => fs.readFileSync(path.join(VDIR, f), 'utf8');

// ================================================================ 通用 DOM stub
function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(c) { set.add(c); }, remove(c) { set.delete(c); }, contains(c) { return set.has(c); },
    toggle(c, force) { const h = set.has(c); const on = force === undefined ? !h : !!force; if (on) set.add(c); else set.delete(c); return on; },
  };
}
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), _classes: makeClassList(), style: {}, attributes: {},
    children: [], parentNode: null, files: null, type: '', textContent: '', value: '',
    src: '', alt: '', placeholder: '', id: '', loading: '', _html: '', _listeners: {},
  };
  el.classList = el._classes;
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); if (v === '') el.children = []; } });
  el.addEventListener = (t, fn) => { (el._listeners[t] = el._listeners[t] || []).push(fn); };
  el.removeEventListener = (t, fn) => { if (el._listeners[t]) el._listeners[t] = el._listeners[t].filter(h => h !== fn); };
  el.dispatchEvent = (ev) => { (el._listeners[ev && ev.type] || []).forEach(fn => fn(ev)); return true; };
  el.appendChild = (c) => { el.children.push(c); c.parentNode = el; return c; };
  el.removeChild = (c) => { el.children = el.children.filter(x => x !== c); c.parentNode = null; };
  el.setAttribute = (k, v) => { el.attributes[k] = v; };
  el.getAttribute = (k) => el.attributes[k];
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.getBoundingClientRect = () => ({ width: 1, height: 1, left: 0, top: 0 });
  el.click = () => el.dispatchEvent({ type: 'click' });
  el.focus = () => {};
  Object.defineProperty(el, 'className', {
    get() { return el._classes._set.size ? Array.from(el._classes._set).join(' ') : ''; },
    set(v) { el._classes = makeClassList(); el.classList = el._classes; String(v).split(/\s+/).filter(Boolean).forEach(c => el._classes.add(c)); },
  });
  return el;
}
function makeVideo() {
  const v = makeEl('video');
  v.currentTime = 0; v.duration = 0; v.playbackRate = 1; v.paused = true;
  v.audioTracks = { length: 0 };
  v._playCount = 0;
  v.play = function () { v._playCount++; v.paused = false; v.dispatchEvent({ type: 'play' }); return Promise.resolve(); };
  v.pause = function () { v.paused = true; v.dispatchEvent({ type: 'pause' }); };
  v.load = function () {};
  v.canPlayType = function () { return ''; };
  v.removeAttribute = function () {};
  return v;
}
function makePlayerSandbox() {
  const created = [];
  const doc = {
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    readyState: 'complete',
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    createEvent() { return { initEvent() {} }; },
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    fullscreenElement: null, exitFullscreen() { return Promise.resolve(); },
  };
  doc.createElement = (tag) => { const el = (tag === 'video') ? makeVideo() : makeEl(tag); created.push(el); return el; };
  const store = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    document: doc,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    navigator: { userAgent: 'node-test' },
    location: { origin: 'https://app.local', href: 'https://app.local/index.html' },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || null; },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    URL: Object.assign(function () {}, { createObjectURL: f => 'blob:' + (f && f.name ? f.name : 'x'), revokeObjectURL() {} }),
    Blob: function Blob() {}, File: function File() {},
    fetch: () => Promise.reject(new Error('no-net')),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ['state.js', 'dispatch.js', 'model.js', 'bootstrap.js', 'subtitle.js', 'player-core.js', 'player.js']
    .forEach(f => vm.runInContext(read(f), sandbox, { filename: f }));
  return { sandbox, doc, created, store, SFV: sandbox.StellaflixVideo };
}

// ================================================================ A. 播放模式
section('A. 播放模式（默认 / 持久化 / 回落 / 循环）');
{
  const { SFV, store, created } = makePlayerSandbox();
  ['setPlayNext', 'hasPlayNext', 'getPlayMode', 'setPlayMode', 'cyclePlayMode'].forEach(k => {
    assert(typeof SFV.player[k] === 'function', 'SFV.player 导出 ' + k);
  });
  assert(SFV.player.getPlayMode() === 'sequence', '默认播放模式为 sequence（连播）');

  SFV.player.openUrl('https://app.local/a.mp4', { id: 'url:a' }); // 建控制条
  const modeBtn = created.filter(e => e.tagName === 'BUTTON' && ['连播', '单集循环', '不连播'].indexOf(e.textContent) >= 0);
  assert(modeBtn.length === 1, '控制条含唯一连播模式按钮 实得=' + modeBtn.length);
  assert(modeBtn[0].textContent === '连播', '按钮初始文案为「连播」');

  SFV.player.setPlayMode('repeat-one');
  assert(SFV.player.getPlayMode() === 'repeat-one', 'setPlayMode(repeat-one) 生效');
  assert(JSON.parse(store.get('stellaflix-video-settings')).playMode === 'repeat-one', '播放模式持久化到 stellaflix-video-settings');
  assert(modeBtn[0].textContent === '单集循环', '按钮文案同步为「单集循环」');

  SFV.player.setPlayMode('不存在的模式');
  assert(SFV.player.getPlayMode() === 'sequence', '非法模式回落 sequence');

  assert(SFV.player.cyclePlayMode() === 'repeat-one', 'cycle: sequence → repeat-one');
  assert(SFV.player.cyclePlayMode() === 'off', 'cycle: repeat-one → off');
  assert(SFV.player.cyclePlayMode() === 'sequence', 'cycle: off → sequence（回环）');
  assert(modeBtn[0].textContent === '连播', '循环一圈后按钮文案回到「连播」');
}

// ================================================================ B. ended 行为
section('B. ended 行为');
{
  const { SFV, created } = makePlayerSandbox();
  SFV.player.openUrl('https://app.local/a.mp4', { id: 'url:a', title: 'A' });
  const v = created.filter(e => e.tagName === 'VIDEO')[0];

  let nextCalls = 0;
  SFV.player.setPlayMode('sequence');
  SFV.player.setPlayNext(function () { nextCalls++; });
  assert(SFV.player.hasPlayNext() === true, 'setPlayNext 后 hasPlayNext=true');
  v.currentTime = 100; v.duration = 100;
  v.dispatchEvent({ type: 'ended' });
  assert(nextCalls === 1, 'sequence 模式 ended → 调用下一集回调 1 次');
  assert(SFV.player.hasPlayNext() === false, 'ended 后钩子已摘除');
  v.dispatchEvent({ type: 'ended' });
  assert(nextCalls === 1, '再次 ended 不重复触发（防重入）');
  assert(SFV.model.getProgress('url:a').position === 100, 'ended 时仍落盘进度');

  // 单集循环
  const p2 = makePlayerSandbox();
  p2.SFV.player.openUrl('https://app.local/b.mp4', { id: 'url:b' });
  const v2 = p2.created.filter(e => e.tagName === 'VIDEO')[0];
  let next2 = 0;
  p2.SFV.player.setPlayMode('repeat-one');
  p2.SFV.player.setPlayNext(function () { next2++; });
  v2.currentTime = 55;
  const before = v2._playCount;
  v2.dispatchEvent({ type: 'ended' });
  assert(v2.currentTime === 0, 'repeat-one：currentTime 归零');
  assert(v2._playCount === before + 1, 'repeat-one：重新 play()');
  assert(next2 === 0, 'repeat-one：不触发下一集');
  assert(p2.SFV.player.hasPlayNext() === true, 'repeat-one：钩子保留');

  // 不连播
  const p3 = makePlayerSandbox();
  p3.SFV.player.openUrl('https://app.local/c.mp4', { id: 'url:c' });
  const v3 = p3.created.filter(e => e.tagName === 'VIDEO')[0];
  let next3 = 0;
  p3.SFV.player.setPlayMode('off');
  p3.SFV.player.setPlayNext(function () { next3++; });
  const pc3 = v3._playCount;
  v3.dispatchEvent({ type: 'ended' });
  assert(next3 === 0 && v3._playCount === pc3, 'off 模式 ended：既不连播也不重播');

  // sequence 但无下一集
  const p4 = makePlayerSandbox();
  p4.SFV.player.openUrl('https://app.local/d.mp4', { id: 'url:d' });
  const v4 = p4.created.filter(e => e.tagName === 'VIDEO')[0];
  p4.SFV.player.setPlayMode('sequence');
  let threw = false;
  try { v4.dispatchEvent({ type: 'ended' }); } catch (e) { threw = true; }
  assert(!threw, 'sequence 但无下一集：ended 不抛错');

  // 回调抛错被隔离
  const p5 = makePlayerSandbox();
  p5.SFV.player.openUrl('https://app.local/e.mp4', { id: 'url:e' });
  const v5 = p5.created.filter(e => e.tagName === 'VIDEO')[0];
  p5.SFV.player.setPlayMode('sequence');
  p5.SFV.player.setPlayNext(function () { throw new Error('boom'); });
  let threw5 = false;
  try { v5.dispatchEvent({ type: 'ended' }); } catch (e) { threw5 = true; }
  assert(!threw5, '下一集回调抛错不冒泡到 ended 监听');
  assert(p5.SFV.player.hasPlayNext() === false, '抛错后钩子仍被摘除（不会死循环）');

  // setPlayNext 注销
  p5.SFV.player.setPlayNext(function () {});
  p5.SFV.player.setPlayNext(null);
  assert(p5.SFV.player.hasPlayNext() === false, 'setPlayNext(null) 注销钩子');
  p5.SFV.player.setPlayNext('不是函数');
  assert(p5.SFV.player.hasPlayNext() === false, 'setPlayNext 非函数视为注销');
}

// ================================================================ C. 钩子生命周期
section('C. 钩子生命周期（换片必须清空）');
{
  function freshWithHook() {
    const ctx = makePlayerSandbox();
    ctx.SFV.player.openUrl('https://app.local/x.mp4', { id: 'url:x' });
    ctx.SFV.player.setPlayNext(function () {});
    return ctx;
  }
  let c = freshWithHook();
  c.SFV.player.openUrl('https://app.local/y.mp4', { id: 'url:y' });
  assert(c.SFV.player.hasPlayNext() === false, 'openUrl（prepareForPlay）清空 playNext');

  c = freshWithHook();
  const f = new c.sandbox.Blob(); f.name = 'local.mp4';
  c.SFV.player.openFile(f);
  assert(c.SFV.player.hasPlayNext() === false, 'openFile 清空 playNext');

  c = freshWithHook();
  c.SFV.player.openEmbed('https://parser.test/p.html', { id: 'embed:1' });
  assert(c.SFV.player.hasPlayNext() === false, 'openEmbed 清空 playNext（iframe 无 ended 事件）');

  c = freshWithHook();
  c.SFV.player.close();
  assert(c.SFV.player.hasPlayNext() === false, 'close 清空 playNext');

  c = freshWithHook();
  c.SFV.player.prepareForPlay('hls:1', 'HLS 片');
  assert(c.SFV.player.hasPlayNext() === false, 'prepareForPlay（HLS/FLV 路径）清空 playNext');
}

// ================================================================ D. online 注册下一集
section('D. online.registerNextEpisode（经 playEpisode）');
{
  function makeOnlineCtx() {
    const store = new Map();
    const doc = {
      body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'),
      readyState: 'complete',
      addEventListener() {}, removeEventListener() {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: (t) => makeEl(t),
    };
    const sandbox = {
      console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
      document: doc,
      localStorage: {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
      },
      location: { origin: 'https://app.local', href: 'https://app.local/index.html' },
      setTimeout: (fn) => setTimeout(fn, 0), clearTimeout: (i) => clearTimeout(i),
      addEventListener() {}, removeEventListener() {},
      URL: URL, Promise, Date, Math, JSON,
    };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('state.js'), sandbox, { filename: 'state.js' });
    vm.runInContext(read('dispatch.js'), sandbox, { filename: 'dispatch.js' });
    vm.runInContext(read('model.js'), sandbox, { filename: 'model.js' });
    const SFV = sandbox.StellaflixVideo;

    const opened = [];
    const nextHooks = []; // 记录每次 setPlayNext 的入参
    SFV.player = {
      openUrl: (url, opts) => { opened.push({ url, opts }); nextHooks.push(null); return true; },
      openEmbed: () => true,
      openFile: () => true,
      setPlayNext: (fn) => { nextHooks[nextHooks.length - 1] = fn || null; },
      hasPlayNext: () => !!nextHooks[nextHooks.length - 1],
    };
    // source 直通到 player.openUrl，并模拟「open 会清空钩子」的真实行为
    SFV.source = {
      open: (o) => { SFV.player.openUrl(o.url, { id: o.id, title: o.title }); return true; },
    };
    SFV.sources = { getSources: () => [], getEnabledSources: () => [] };
    vm.runInContext(read('online-core.js'), sandbox, { filename: 'online-core.js' });
    vm.runInContext(read('online.js'), sandbox, { filename: 'online.js' });
    return { SFV, opened, nextHooks };
  }

  const view = { source: { id: 's1' }, vodId: '7', key: 's1:7', title: '片A', pic: '', year: '2024' };
  const mkEps = n => Array.from({ length: n }, (_, i) => ({ name: '第' + (i + 1) + '集', url: 'https://v.test/' + i + '.mp4', index: i }));

  // 正常中间集 → 注册下一集
  {
    const { SFV, opened, nextHooks } = makeOnlineCtx();
    const eps = mkEps(3);
    const play = { from: '线路A', episodes: eps };
    SFV.online.playEpisode(view, eps[0], play);
    assert(opened.length === 1 && opened[0].opts.id === 's1:7:0', '第 1 集起播，进度键 s1:7:0');
    assert(typeof nextHooks[0] === 'function', '中间集：注册了下一集钩子');

    // 触发钩子 → 应播放第 2 集
    nextHooks[0]();
    assert(opened.length === 2 && opened[1].opts.id === 's1:7:1', '连播链式推进到第 2 集（s1:7:1）');
    assert(typeof nextHooks[1] === 'function', '第 2 集仍有下一集钩子');
    nextHooks[1]();
    assert(opened.length === 3 && opened[2].opts.id === 's1:7:2', '继续推进到第 3 集（s1:7:2）');
    assert(nextHooks[2] === null, '末集：钩子被注销（播完即停）');
    assert(SFV.model.getHistory().length === 3, '连播每集均写入历史 实得=' + SFV.model.getHistory().length);
  }

  // 末集
  {
    const { SFV, nextHooks } = makeOnlineCtx();
    const eps = mkEps(2);
    SFV.online.playEpisode(view, eps[1], { episodes: eps });
    assert(nextHooks[0] === null, '直接点末集：不注册下一集');
  }

  // 单集
  {
    const { SFV, nextHooks } = makeOnlineCtx();
    const eps = mkEps(1);
    SFV.online.playEpisode(view, eps[0], { episodes: eps });
    assert(nextHooks[0] === null, '仅 1 集：不注册下一集');
  }

  // 空剧集列表
  {
    const { SFV, nextHooks } = makeOnlineCtx();
    const ep = { name: '孤立集', url: 'https://v.test/z.mp4', index: 0 };
    SFV.online.playEpisode(view, ep, { episodes: [] });
    assert(nextHooks[0] === null, '空剧集列表：不注册下一集');
  }

  // 未传 play（旧调用点兼容）
  {
    const { SFV, opened, nextHooks } = makeOnlineCtx();
    const ep = { name: '第1集', url: 'https://v.test/0.mp4', index: 0 };
    let threw = false;
    try { SFV.online.playEpisode(view, ep); } catch (e) { threw = true; }
    assert(!threw, '未传 play 参数不抛错（向后兼容）');
    assert(opened.length === 1, '未传 play 仍正常起播');
    assert(nextHooks[0] === null, '未传 play：不注册下一集');
  }

  // 下一集无播放地址
  {
    const { SFV, nextHooks } = makeOnlineCtx();
    const eps = [{ name: '第1集', url: 'https://v.test/0.mp4', index: 0 }, { name: '第2集', url: '', index: 1 }];
    SFV.online.playEpisode(view, eps[0], { episodes: eps });
    assert(nextHooks[0] === null, '下一集无地址：不注册（避免播空）');
  }

  // 当前集不在列表中
  {
    const { SFV, nextHooks } = makeOnlineCtx();
    const eps = mkEps(3);
    const stray = { name: '外来集', url: 'https://v.test/x.mp4', index: 99 };
    SFV.online.playEpisode(view, stray, { episodes: eps });
    assert(nextHooks[0] === null, '当前集不在列表：不注册下一集');
  }

  // 无播放地址的当前集 → 不起播
  {
    const { SFV, opened } = makeOnlineCtx();
    SFV.online.playEpisode(view, { name: '坏集', url: '', index: 0 }, { episodes: mkEps(2) });
    assert(opened.length === 0, '当前集无地址：不起播');
  }
}

console.log('\n========================================');
console.log('  自动连播测试: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
if (fail) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
