/*
 * 字幕系统测试（vm 沙箱，加载 public/video 真实源码）
 * 覆盖：
 *   A. 纯函数解析 —— parseTimeLine / parseSrt / parseVtt / detectFormat（含边界与异常输入）
 *   B. SubtitleRenderer —— 挂载 / 命中 / 未命中 / 边界时间点 / 显隐 / clear / 文本缓存
 *   C. fetchText —— File(FileReader) / 同源直连 / 跨域走 /api/proxy / HTTP 失败 / 无 fetch
 *   D. player.js 集成 —— API 导出 / 字幕按钮 / loadSubtitle / timeupdate 联动 /
 *                        换片(prepareForPlay)与 close 清理 / 菜单双分支 / 解析空 reject
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
function eqf(a, b, eps) { return Math.abs(a - b) < (eps === undefined ? 1e-6 : eps); }

// ---------------------------------------------------------------- DOM stub
function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(c) { set.add(c); }, remove(c) { set.delete(c); }, contains(c) { return set.has(c); },
    toggle(c, force) { const has = set.has(c); const on = force === undefined ? !has : !!force; if (on) set.add(c); else set.delete(c); return on; },
  };
}
function makeEventTarget() {
  const handlers = {};
  return {
    addEventListener(t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { if (handlers[t]) handlers[t] = handlers[t].filter(h => h !== fn); },
    dispatchEvent(ev) { (handlers[ev.type] || []).forEach(fn => fn(ev)); return true; },
  };
}
function makeStorage() {
  const m = new Map();
  return { getItem(k) { return m.has(k) ? m.get(k) : null; }, setItem(k, v) { m.set(k, String(v)); }, removeItem(k) { m.delete(k); } };
}
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _classes: makeClassList(), style: {}, attributes: {}, children: [], parentNode: null,
    files: null, type: '', _textContent: '', _textWrites: 0, _listeners: {},
  };
  el.classList = el._classes;
  Object.defineProperty(el, 'textContent', {
    get() { return el._textContent; },
    set(v) { el._textContent = String(v); el._textWrites++; },
  });
  el.addEventListener = (t, fn) => { (el._listeners[t] = el._listeners[t] || []).push(fn); };
  el.removeEventListener = (t, fn) => { if (el._listeners[t]) el._listeners[t] = el._listeners[t].filter(h => h !== fn); };
  el.dispatchEvent = (ev) => { (el._listeners[ev && ev.type] || []).forEach(fn => fn(ev)); return true; };
  el.appendChild = (c) => { el.children.push(c); c.parentNode = el; return c; };
  el.removeChild = (c) => { el.children = el.children.filter(x => x !== c); c.parentNode = null; };
  el.setAttribute = (k, v) => { el.attributes[k] = v; };
  el.getAttribute = (k) => el.attributes[k];
  el.querySelector = () => null;
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
  v.play = function () { v.paused = false; v.dispatchEvent({ type: 'play' }); return Promise.resolve(); };
  v.pause = function () { v.paused = true; v.dispatchEvent({ type: 'pause' }); };
  v.load = function () {};
  v.canPlayType = function () { return ''; };
  return v;
}

const created = [];
const docTarget = makeEventTarget();
const doc = {
  body: makeEl('body'),
  documentElement: makeEl('html'),
  head: makeEl('head'),
  readyState: 'complete',
  addEventListener: docTarget.addEventListener,
  removeEventListener: docTarget.removeEventListener,
  dispatchEvent: docTarget.dispatchEvent,
  createEvent() { return { initEvent() {} }; },
  getElementById() { return null; },
  querySelector() { return null; },
  fullscreenElement: null,
  exitFullscreen() { doc.fullscreenElement = null; return Promise.resolve(); },
};
doc.createElement = (tag) => { const el = (tag === 'video') ? makeVideo() : makeEl(tag); created.push(el); return el; };

// ---- fake FileReader / fetch ----
let frShouldFail = false;
function FakeFileReader() { this.result = null; this.onload = null; this.onerror = null; }
FakeFileReader.prototype.readAsText = function (blob) {
  const self = this;
  setTimeout(function () {
    if (frShouldFail) { if (self.onerror) self.onerror(); return; }
    self.result = blob && blob._text != null ? blob._text : '';
    if (self.onload) self.onload();
  }, 0);
};

const fetchCalls = [];
let fetchImpl = null;
function fakeFetch(url) {
  fetchCalls.push(url);
  return fetchImpl ? fetchImpl(url) : Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
}

const winTarget = makeEventTarget();
const sandbox = {
  console,
  document: doc,
  localStorage: makeStorage(),
  navigator: { userAgent: 'node-test' },
  location: { origin: 'https://app.local', href: 'https://app.local/index.html' },
  addEventListener: winTarget.addEventListener,
  removeEventListener: winTarget.removeEventListener,
  dispatchEvent: winTarget.dispatchEvent,
  CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || null; },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  URL: null, // 下面赋值（既要 new URL(...) 又要 createObjectURL）
  Blob: function Blob() {},
  File: function File() {},
  FileReader: FakeFileReader,
  fetch: fakeFetch,
};
// URL：构造函数 + 静态 createObjectURL / revokeObjectURL
function FakeURL(u, base) {
  let s = String(u);
  if (!/^[a-z]+:\/\//i.test(s) && base) {
    const bm = /^([a-z]+:\/\/[^/]+)/i.exec(String(base));
    if (!bm) throw new TypeError('Invalid URL');
    s = bm[1] + (s.charAt(0) === '/' ? s : '/' + s);
  }
  const m = /^([a-z]+):\/\/([^/?#]+)([^?#]*)?(\?[^#]*)?(#.*)?$/i.exec(s);
  if (!m) throw new TypeError('Invalid URL');
  this.protocol = m[1] + ':';
  this.hostname = m[2];
  this.pathname = m[3] || '/';
  this.href = s;
  this.origin = this.protocol + '//' + this.hostname;
}
FakeURL.createObjectURL = (f) => 'blob:' + (f && f.name ? f.name : 'x');
FakeURL.revokeObjectURL = function () {};
sandbox.URL = FakeURL;
sandbox.window = sandbox;
vm.createContext(sandbox);

const base = path.resolve(__dirname, '..', 'public', 'video');
['state.js', 'dispatch.js', 'model.js', 'bootstrap.js', 'subtitle.js', 'player-core.js', 'player.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), sandbox, { filename: 'public/video/' + f });
});
const SFV = sandbox.StellaflixVideo;
const S = SFV.subtitle;

// ================================================================ A. 纯函数
console.log('\n[A] 解析纯函数');
assert(!!S && typeof S.parseSrt === 'function', 'SFV.subtitle 已挂载且导出 parseSrt');

let t = S.parseTimeLine('00:00:01,500 --> 00:00:04,250');
assert(t && eqf(t.start, 1.5) && eqf(t.end, 4.25), 'parseTimeLine SRT 逗号毫秒');
t = S.parseTimeLine('00:01:02.100 --> 00:01:05.900');
assert(t && eqf(t.start, 62.1) && eqf(t.end, 65.9), 'parseTimeLine VTT 点号毫秒');
t = S.parseTimeLine('00:00:01,50 --> 00:00:02,25');
assert(t && eqf(t.start, 1.5) && eqf(t.end, 2.25), 'parseTimeLine 2 位毫秒按厘秒(/100)换算');
t = S.parseTimeLine('00:00:01,5 --> 00:00:02,2');
assert(t && eqf(t.start, 1.5) && eqf(t.end, 2.2), 'parseTimeLine 1 位毫秒按分秒(/10)换算');
assert(S.parseTimeLine('1:02:03,000 --> 1:02:04,000').start === 3723, 'parseTimeLine 单位数小时');
assert(S.parseTimeLine('这不是时间轴') === null, 'parseTimeLine 非法行返回 null');
assert(S.parseTimeLine('') === null, 'parseTimeLine 空串返回 null');
assert(S.parseTimeLine(null) === null, 'parseTimeLine null 返回 null');
assert(S.parseTimeLine('00:00:01,000 --> 坏了') === null, 'parseTimeLine 缺结束时间返回 null');

const srt = [
  '1', '00:00:01,000 --> 00:00:03,000', '第一句',
  '', '2', '00:00:04,000 --> 00:00:06,000', '第二句<i>斜体</i>',
  '', '3', '没有时间轴的坏块', '正文',
  '', '4', '00:00:07,000 --> 00:00:08,000', '',
  '', '5', '00:00:09,000 --> 00:00:10,000', '第三句', '换行第二行',
].join('\n');
let cues = S.parseSrt(srt);
assert(cues.length === 3, 'parseSrt 得到 3 条有效 cue（坏块/空文本被跳过） 实得=' + cues.length);
assert(cues[0].text === '第一句' && eqf(cues[0].start, 1) && eqf(cues[0].end, 3), 'parseSrt cue0 时间与文本正确');
assert(cues[1].text === '第二句斜体', 'parseSrt 去除 HTML 标签');
assert(cues[2].text === '第三句\n换行第二行', 'parseSrt 保留 cue 内换行');
assert(S.parseSrt('').length === 0, 'parseSrt 空串 → []');
assert(S.parseSrt(null).length === 0, 'parseSrt null → []');
assert(S.parseSrt(undefined).length === 0, 'parseSrt undefined → []');
assert(S.parseSrt('完全没有时间轴的一堆文本').length === 0, 'parseSrt 无时间轴文本 → []');
assert(S.parseSrt('1\r\n00:00:01,000 --> 00:00:02,000\r\nCRLF\r\n').length === 1, 'parseSrt 兼容 CRLF');
assert(S.parseSrt('\uFEFF1\n00:00:01,000 --> 00:00:02,000\nBOM\n')[0].text === 'BOM', 'parseSrt 剥离 BOM 头');
const unsorted = S.parseSrt('1\n00:00:09,000 --> 00:00:10,000\nB\n\n2\n00:00:01,000 --> 00:00:02,000\nA');
assert(unsorted.length === 2 && unsorted[0].text === 'A', 'parseSrt 按 start 升序排序');

const vtt = [
  'WEBVTT', '', 'cue-1', '00:00:01.000 --> 00:00:03.000', 'Hello',
  '', '00:00:04.000 --> 00:00:05.000', '<c.yellow>World</c>',
].join('\n');
let vcues = S.parseVtt(vtt);
assert(vcues.length === 2, 'parseVtt 得到 2 条 cue 实得=' + vcues.length);
assert(vcues[0].text === 'Hello' && eqf(vcues[0].start, 1), 'parseVtt 跳过 WEBVTT 头与 cue 标识行');
assert(vcues[1].text === 'World', 'parseVtt 去除内联标签 <c.yellow>');
assert(S.parseVtt('').length === 0, 'parseVtt 空串 → []');
assert(S.parseVtt('00:00:01.000 --> 00:00:02.000\nNoHeader').length === 1, 'parseVtt 无 WEBVTT 头也可解析');

assert(S.detectFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nx') === 'vtt', 'detectFormat → vtt');
assert(S.detectFormat('1\n00:00:01,000 --> 00:00:02,000\nx') === 'srt', 'detectFormat → srt');
assert(S.detectFormat('随便一段文字') === 'unknown', 'detectFormat → unknown');
assert(S.detectFormat('') === 'unknown', 'detectFormat 空串 → unknown');

// ================================================================ B. 渲染器
console.log('\n[B] SubtitleRenderer');
const fakeOverlay = makeEl('div');
const r = new S.SubtitleRenderer(fakeOverlay);
r.setCues([{ start: 1, end: 3, text: 'A' }, { start: 5, end: 7, text: 'B' }]);
r.setActive(true);
r.update(2);
const subEl = fakeOverlay.children[0];
assert(!!subEl && subEl.className === 'sfv-subtitle', '渲染器把 .sfv-subtitle 挂到 overlay');
assert(subEl.textContent === 'A', 'update(2) 命中 cue A');
assert(subEl.style.display === '', '命中时 display 可见');
r.update(4);
assert(subEl.textContent === '' && subEl.style.display === 'none', 'update(4) 未命中 → 隐藏并清空');
r.update(1);
assert(subEl.textContent === 'A', '边界：正好等于 start 命中');
r.update(3);
assert(subEl.textContent === 'A', '边界：正好等于 end 命中');
r.update(7.0001);
assert(subEl.textContent === '', '边界：超出 end 不命中');
r.update(6);
const wBefore = subEl._textWrites;
r.update(6.5);
assert(subEl._textWrites === wBefore, '同一 cue 连续 update 不重复写 textContent（lastText 缓存）');
r.setActive(false);
assert(subEl.style.display === 'none' && r.active === false, 'setActive(false) 隐藏');
r.setActive(true); r.update(2);
r.clear();
assert(r.cues.length === 0 && r.active === false && subEl.textContent === '', 'clear() 重置 cues/active/文本');
let threw = false;
try { r.update(1); } catch (e) { threw = true; }
assert(!threw, 'clear 后 update 不抛错');
const r2 = new S.SubtitleRenderer(null);
let threw2 = false;
try { r2.setCues([{ start: 0, end: 1, text: 'x' }]); r2.setActive(true); r2.update(0.5); } catch (e) { threw2 = true; }
assert(!threw2, 'overlay 为 null 时渲染器降级不抛错');

// ================================================================ C. fetchText + D. player 集成（异步）
(async function run() {
  console.log('\n[C] fetchText');
  const blob = new sandbox.Blob(); blob._text = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFromFile';
  const txt = await S.fetchText(blob);
  assert(txt.indexOf('FromFile') >= 0, 'fetchText 读取 Blob/File（FileReader）');
  frShouldFail = true;
  let ferr = null;
  try { await S.fetchText(blob); } catch (e) { ferr = e; }
  assert(ferr && ferr.message === 'read-file-failed', 'FileReader 出错 → reject(read-file-failed)');
  frShouldFail = false;

  fetchCalls.length = 0;
  fetchImpl = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('SAME') });
  await S.fetchText('https://app.local/sub/a.srt');
  assert(fetchCalls[0] === 'https://app.local/sub/a.srt', '同源字幕 URL 直连（不走代理）');

  fetchCalls.length = 0;
  await S.fetchText('https://cdn.other.com/s/a.srt');
  assert(fetchCalls[0] === '/api/proxy?url=' + encodeURIComponent('https://cdn.other.com/s/a.srt'),
    '跨域字幕 URL 走 /api/proxy 实得=' + fetchCalls[0]);

  fetchImpl = () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
  let herr = null;
  try { await S.fetchText('https://cdn.other.com/s/404.srt'); } catch (e) { herr = e; }
  assert(herr && herr.message === 'fetch-failed:404', 'HTTP 非 2xx → reject(fetch-failed:404)');

  const savedFetch = sandbox.fetch;
  sandbox.fetch = undefined;
  let nerr = null;
  try { await S.fetchText('https://cdn.other.com/s/a.srt'); } catch (e) { nerr = e; }
  assert(nerr && nerr.message === 'no-fetch', '环境无 fetch → reject(no-fetch)');
  sandbox.fetch = savedFetch;

  // ---------------------------------------------------------- D. player 集成
  console.log('\n[D] player.js 集成');
  ['loadSubtitle', 'setSubtitleVisible', 'clearSubtitle', 'openSubtitleMenu'].forEach(k => {
    assert(typeof SFV.player[k] === 'function', 'SFV.player 导出 ' + k);
  });

  SFV.player.openUrl('https://app.local/v/movie.mp4', { id: 'url:m1', title: 'M1' });
  const btns = created.filter(e => e.tagName === 'BUTTON' && e.textContent === '字幕');
  assert(btns.length === 1, '控制条含唯一「字幕」按钮 实得=' + btns.length);

  fetchImpl = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve('1\n00:00:01,000 --> 00:00:03,000\nHELLO\n\n2\n00:00:05,000 --> 00:00:06,000\nBYE'),
  });
  const n = await SFV.player.loadSubtitle('https://app.local/s/a.srt');
  assert(n === 2, 'loadSubtitle 返回 cue 数 2 实得=' + n);
  const pr = SFV.player.getSubtitleRenderer();
  assert(pr && pr.active === true && pr.cues.length === 2, '加载后渲染器 active 且持有 2 条 cue');

  const videoEl = created.filter(e => e.tagName === 'VIDEO')[0];
  videoEl.currentTime = 2;
  videoEl.dispatchEvent({ type: 'timeupdate' });
  assert(pr.el && pr.el.textContent === 'HELLO', 'timeupdate 驱动字幕渲染（t=2 → HELLO）');
  videoEl.currentTime = 4;
  videoEl.dispatchEvent({ type: 'timeupdate' });
  assert(pr.el.textContent === '' && pr.el.style.display === 'none', 'timeupdate 空档期隐藏字幕');
  videoEl.currentTime = 5.5;
  videoEl.dispatchEvent({ type: 'timeupdate' });
  assert(pr.el.textContent === 'BYE', 'timeupdate 切换到第二条 cue');

  SFV.player.setSubtitleVisible(false);
  assert(pr.active === false && pr.el.style.display === 'none', 'setSubtitleVisible(false) 隐藏字幕');
  SFV.player.setSubtitleVisible(true);
  assert(pr.active === true, 'setSubtitleVisible(true) 恢复');

  // 换片必须清字幕
  SFV.player.openUrl('https://app.local/v/movie2.mp4', { id: 'url:m2', title: 'M2' });
  assert(pr.cues.length === 0 && pr.active === false, '换片(openUrl→prepareForPlay) 清空上一部字幕');

  // 菜单：未加载 → 弹出输入条；再调一次 → 收起
  const overlayEl = pr.overlayEl;
  SFV.player.openSubtitleMenu();
  let bar = overlayEl.children.filter(c => c.className && c.className.indexOf('sfv-sub-bar') >= 0)[0];
  assert(!!bar, '未加载字幕时 openSubtitleMenu 弹出 .sfv-sub-bar');
  SFV.player.openSubtitleMenu();
  bar = overlayEl.children.filter(c => c.className && c.className.indexOf('sfv-sub-bar') >= 0)[0];
  assert(!bar, '再次调用 openSubtitleMenu 收起输入条');

  // 菜单：已加载 → 切显隐（不再弹条）
  await SFV.player.loadSubtitle('https://app.local/s/a.srt');
  SFV.player.openSubtitleMenu();
  assert(pr.active === false, '已加载字幕时 openSubtitleMenu 切为隐藏');
  bar = overlayEl.children.filter(c => c.className && c.className.indexOf('sfv-sub-bar') >= 0)[0];
  assert(!bar, '已加载字幕时不弹输入条');
  SFV.player.openSubtitleMenu();
  assert(pr.active === true, '再次调用切回显示');

  // 解析不出 cue → reject
  fetchImpl = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('这不是字幕') });
  let cerr = null;
  try { await SFV.player.loadSubtitle('https://app.local/s/bad.srt'); } catch (e) { cerr = e; }
  assert(cerr && cerr.message === 'no-cues-parsed', '无有效 cue → reject(no-cues-parsed)');

  // close 清字幕
  fetchImpl = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('1\n00:00:01,000 --> 00:00:03,000\nX') });
  await SFV.player.loadSubtitle('https://app.local/s/a.srt');
  assert(pr.cues.length === 1, 'close 前字幕已加载');
  SFV.player.close();
  assert(pr.cues.length === 0 && pr.active === false, 'close() 清空字幕');

  console.log('\n================ 字幕测试结果 ================');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (fail) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error('UNCAUGHT:', e); process.exit(1); });
