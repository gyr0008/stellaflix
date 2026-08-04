/*
 * Step 3 逻辑测试：vm 沙箱加载 public/video/*.js 真实源码（含 player.js），
 * stub 最小 DOM 环境，断言方案 B 全屏弹层播放器的双态翻转 / 进度记忆 / 渲染暂停钩子 /
 * 倍速记忆 / 音轨 / 全屏双分支 / openUrl。不依赖浏览器，不依赖 node_modules。
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

// ---- 最小 DOM / 环境 stub ----
function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(c) { set.add(c); },
    remove(c) { set.delete(c); },
    contains(c) { return set.has(c); },
    toggle(c, force) {
      const has = set.has(c);
      const on = force === undefined ? !has : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    },
  };
}
function makeEventTarget() {
  const handlers = {};
  return {
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener(type, fn) {
      if (!handlers[type]) return;
      handlers[type] = handlers[type].filter(h => h !== fn);
    },
    dispatchEvent(ev) {
      const list = handlers[ev.type] || [];
      list.forEach(fn => fn(ev));
      return true;
    },
  };
}
function makeStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    _map: m,
  };
}

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _classes: makeClassList(),
    style: {},
    attributes: {},
    children: [],
    parentNode: null,
    files: null,
    type: '',
    textContent: '',
    _listeners: {},
  };
  el.classList = el._classes;
  el.addEventListener = (t, fn) => { (el._listeners[t] = el._listeners[t] || []).push(fn); };
  el.removeEventListener = (t, fn) => { if (!el._listeners[t]) return; el._listeners[t] = el._listeners[t].filter(h => h !== fn); };
  el.dispatchEvent = (ev) => { (el._listeners[ev && ev.type] || []).forEach(fn => fn(ev)); return true; };
  el.appendChild = (c) => { el.children.push(c); c.parentNode = el; return c; };
  el.removeChild = (c) => { el.children = el.children.filter(x => x !== c); };
  el.setAttribute = (k, v) => { el.attributes[k] = v; };
  el.getAttribute = (k) => el.attributes[k];
  el.querySelector = () => null;
  el.getBoundingClientRect = () => ({ width: 1, height: 1, left: 0, top: 0 });
  el.click = () => el.dispatchEvent({ type: 'click' });
  el.focus = () => {};
  Object.defineProperty(el, 'className', {
    get() { return el._classes._set.size ? Array.from(el._classes._set).join(' ') : ''; },
    set(v) { el._classes = makeClassList(); String(v).split(/\s+/).filter(Boolean).forEach(c => el._classes.add(c)); },
  });
  return el;
}
function makeVideo() {
  const v = makeEl('video');
  v.currentTime = 0; v.duration = 0; v.playbackRate = 1; v.paused = true; v.volume = 1; v.muted = false;
  v.audioTracks = { length: 0 };
  v.play = function () { v.paused = false; v.dispatchEvent({ type: 'play' }); return Promise.resolve(); };
  v.pause = function () { v.paused = true; v.dispatchEvent({ type: 'pause' }); };
  v.load = function () {};
  return v;
}

const created = [];
const docTarget = makeEventTarget();
const doc = {
  body: makeEl('body'),
  documentElement: makeEl('html'),
  readyState: 'complete',
  addEventListener: docTarget.addEventListener,
  removeEventListener: docTarget.removeEventListener,
  createEvent() { return { initEvent() {} }; },
  getElementById() { return null; },
  fullscreenElement: null,
  exitFullscreen() { doc.fullscreenElement = null; return Promise.resolve(); },
};
doc.createElement = (tag) => { const el = (tag === 'video') ? makeVideo() : makeEl(tag); created.push(el); return el; };

const winTarget = makeEventTarget();
const sandbox = {
  console,
  document: doc,
  localStorage: makeStorage(),
  navigator: { userAgent: 'node-test' },
  addEventListener: winTarget.addEventListener,
  removeEventListener: winTarget.removeEventListener,
  dispatchEvent: winTarget.dispatchEvent,
  CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || null; },
  setTimeout: function () { return 0; },
  clearTimeout: function () {},
  URL: {
    createObjectURL: (f) => 'blob:' + (f && f.name ? f.name : 'x'),
    revokeObjectURL: function () {},
  },
  Blob: function () {},
  File: function () {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// ---- 加载真实源码（顺序与 index.html 一致）----
const base = path.resolve(__dirname, '..', 'public', 'video');
['state.js', 'dispatch.js', 'model.js', 'bootstrap.js', 'player.js'].forEach(f => {
  const code = fs.readFileSync(path.join(base, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: 'public/video/' + f });
});

const SFV = sandbox.StellaflixVideo;
assert(!!SFV && !!SFV.player, 'StellaflixVideo.player 已挂载');
const api = ['openFile', 'openUrl', 'close', 'togglePlay', 'seek', 'setSpeed', 'cycleSpeed', 'setAudioTrack', 'cycleAudio', 'toggleFullscreen', 'openFilePicker', 'isOpen', 'currentId'];
assert(api.every(k => typeof SFV.player[k] === 'function'), 'player API 表面完整');

const body = doc.body;
assert(SFV.state.getSpace() === 'music', '初始态 music');
assert(body.classList.contains('video-space-active') === false, '初始 body 无 video-space-active');

// 渲染暂停钩子捕获
const pauseEvents = [];
sandbox.addEventListener('sfv:render-pause', e => pauseEvents.push(e.detail.paused));

// ---- openFile：双态翻转 + src + 库登记 ----
const f = new sandbox.Blob(); f.name = 'movie.mp4';
const ok = SFV.player.openFile(f);
assert(ok === true, 'openFile 返回 true');
assert(SFV.state.getSpace() === 'video', 'openFile 后进入 video 态');
assert(body.classList.contains('video-space-active') === true, 'openFile 后 body 含 video-space-active');
assert(SFV.player.isOpen() === true, 'overlay 处于显示态');
const videoEl = created.filter(e => e.tagName === 'VIDEO')[0];
assert(videoEl.src === 'blob:movie.mp4', 'video.src 为 createObjectURL 结果');
assert(SFV.player.currentId() === 'file:movie.mp4', 'currentId = file:movie.mp4');
assert(SFV.model.getLibrary().some(x => x.id === 'file:movie.mp4'), 'openFile 入库本地媒体');
assert(pauseEvents.length === 1 && pauseEvents[0] === true, '打开时派发 sfv:render-pause(true)');

// ---- 暂停时落进度 ----
videoEl.currentTime = 123;
videoEl.duration = 6000;
videoEl.dispatchEvent({ type: 'pause' });
assert(SFV.model.getProgress('file:movie.mp4').position === 123, 'pause 时进度写入 123');
assert(SFV.model.getProgress('file:movie.mp4').duration === 6000, '进度 duration 写入 6000');

// ---- 倍速记忆 ----
SFV.player.setSpeed(1.5);
assert(videoEl.playbackRate === 1.5, 'setSpeed 设置 playbackRate=1.5');
const settings = JSON.parse(sandbox.localStorage.getItem('stellaflix-video-settings') || '{}');
assert(settings.speed === 1.5, '倍速记忆到 stellaflix-video-settings');

// ---- 音轨切换 ----
videoEl.audioTracks = { length: 2, 0: { enabled: false }, 1: { enabled: false } };
SFV.player.setAudioTrack(1);
assert(videoEl.audioTracks[1].enabled === true && videoEl.audioTracks[0].enabled === false, 'setAudioTrack(1) 仅启用第 2 条');

// ---- 全屏双分支 ----
const overlayEl = created.filter(e => e.id === 'sfv-overlay')[0];
overlayEl.requestFullscreen = function () { doc.fullscreenElement = overlayEl; return Promise.resolve(); };
SFV.player.toggleFullscreen();
assert(doc.fullscreenElement === overlayEl, '非全屏态 toggleFullscreen -> requestFullscreen');
SFV.player.toggleFullscreen();
assert(doc.fullscreenElement === null, '全屏态 toggleFullscreen -> exitFullscreen');

// ---- close：还原 music 态 + 渲染恢复钩子 ----
SFV.player.close();
assert(SFV.state.getSpace() === 'music', 'close 后回到 music 态');
assert(body.classList.contains('video-space-active') === false, 'close 后 body 移除 video-space-active');
assert(SFV.player.isOpen() === false, 'overlay 隐藏');
assert(pauseEvents.length === 2 && pauseEvents[1] === false, '关闭时派发 sfv:render-pause(false)');

// ---- 重开续播 ----
SFV.player.openFile(f);
assert(videoEl.currentTime === 123, '重开同一文件续播到 123s（进度记忆恢复）');
SFV.player.close();

// ---- openUrl ----
const ok2 = SFV.player.openUrl('http://example.com/x.mp4');
assert(ok2 === true, 'openUrl 返回 true');
assert(videoEl.src === 'http://example.com/x.mp4', 'openUrl 设置 video.src');
assert(SFV.player.currentId() === 'url:http://example.com/x.mp4', 'openUrl currentId 正确');
assert(SFV.state.getSpace() === 'video', 'openUrl 进入 video 态');
SFV.player.close();

// ---- openFilePicker 不抛错 ----
let pickErr = null;
try { SFV.player.openFilePicker(); } catch (e) { pickErr = e; }
assert(pickErr === null, 'openFilePicker 不抛错');

console.log('\n=== Step 3 逻辑测试: ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail === 0 ? 0 : 1);
