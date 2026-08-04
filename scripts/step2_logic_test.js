/*
 * Step 2 逻辑测试：vm 沙箱加载 public/video/*.js 真实源码，stub 最小 DOM 环境断言。
 * 不依赖浏览器，不依赖 node_modules。
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
    contains_token(c) { return set.has(c); },
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

const body = { classList: makeClassList() };
const docTarget = makeEventTarget();
const doc = {
  body,
  readyState: 'complete',
  addEventListener: docTarget.addEventListener,
  removeEventListener: docTarget.removeEventListener,
  createEvent() { return { initEvent() {} }; },
};

const winTarget = makeEventTarget();
const sandbox = {
  console,
  document: doc,
  localStorage: makeStorage(),
  navigator: { userAgent: 'node-test' },
  addEventListener: winTarget.addEventListener,
  removeEventListener: winTarget.removeEventListener,
  dispatchEvent: winTarget.dispatchEvent,
  CustomEvent: function CustomEvent(type, opts) {
    this.type = type;
    this.detail = (opts && opts.detail) || null;
  },
};
sandbox.window = sandbox; // 使源码内 `window` 指向 sandbox，IIFE 注入 StellaflixVideo 到 sandbox
vm.createContext(sandbox);

// ---- 加载真实源码 ----
const base = path.resolve(__dirname, '..', 'public', 'video');
['state.js', 'dispatch.js', 'model.js', 'bootstrap.js'].forEach(f => {
  const code = fs.readFileSync(path.join(base, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: 'public/video/' + f });
});

const SFV = sandbox.StellaflixVideo;
assert(!!SFV, 'StellaflixVideo 命名空间已挂载');
assert(!!SFV.state && !!SFV.dispatch && !!SFV.model, 'state/dispatch/model 三模块就绪');
assert(SFV.state.STORAGE_KEY === 'stellaflix-space-mode', 'space 持久化键为 stellaflix-space-mode (非 mineradio-*)');

// bootstrap 在 readyState=complete 时立即 boot -> state.init + dispatch.bind
assert(SFV.state.getSpace() === 'music', '初始态为 music');
assert(body.classList.contains('video-space-active') === false, '初始 body 无 video-space-active');

// ---- 状态机 toggle + 事件 ----
let evtDetail = null;
sandbox.addEventListener('spacechange', (e) => { evtDetail = e.detail; });
SFV.state.toggle();
assert(SFV.state.getSpace() === 'video', 'toggle 后进入 video');
assert(body.classList.contains('video-space-active') === true, 'toggle 后 body 含 video-space-active');
assert(evtDetail && evtDetail.spaceMode === 'video', 'spacechange 事件携带 detail.spaceMode=video');

SFV.state.toggle();
assert(SFV.state.getSpace() === 'music', '再次 toggle 回到 music');
assert(body.classList.contains('video-space-active') === false, '回到 music 后 body 移除 video-space-active');
assert(evtDetail && evtDetail.spaceMode === 'music', '第二次事件 detail.spaceMode=music');

// setSpace 非法值忽略
SFV.state.setSpace('invalid');
assert(SFV.state.getSpace() === 'music', '非法 spaceMode 被忽略');

// ---- 数据分发层 ----
let musicCalled = 0, videoCalled = 0, lastCtx = null;
const fakeEl = { slot: 'test' };
SFV.dispatch.registerSlot('home', {
  el: fakeEl,
  music: function (el, ctx) { musicCalled++; lastCtx = ctx; },
  video: function (el, ctx) { videoCalled++; lastCtx = ctx; },
});
// 当前 music 态，renderSlot 应走 music
SFV.dispatch.renderSlot('home');
assert(musicCalled === 1 && videoCalled === 0, 'music 态 renderSlot 调用 music provider');
assert(lastCtx && lastCtx.space === 'music', 'music provider 收到 ctx.space=music');
// 切到 video 态后，spacechange 触发 renderAll -> 走 video
SFV.state.toggle();
assert(videoCalled === 1 && musicCalled === 1, '切 video 后 renderAll 调用 video provider (且 music 不重复)');
assert(lastCtx && lastCtx.space === 'video', 'video provider 收到 ctx.space=video');
// 取消注册
SFV.dispatch.unregisterSlot('home');
musicCalled = videoCalled = 0;
SFV.dispatch.renderSlot('home');
assert(musicCalled === 0 && videoCalled === 0, 'unregister 后 renderSlot 不再触发');

// ---- 数据模型 ----
SFV.model.setProgress('movie-42', 123, 6000);
assert(SFV.model.getProgress('movie-42').position === 123, 'setProgress 写入 position');
assert(SFV.model.getProgress('movie-42').duration === 6000, 'setProgress 写入 duration');
const stored = sandbox.localStorage.getItem('stellaflix-video-progress');
assert(stored && stored.indexOf('movie-42') >= 0, '进度持久化到 stellaflix-video-progress (非 mineradio-*)');
SFV.model.addToLibrary({ id: 'movie-42', title: 'Test' });
assert(SFV.model.getLibrary().length === 1, 'addToLibrary 入库');
SFV.model.addToLibrary({ id: 'movie-42', title: 'Test' });
assert(SFV.model.getLibrary().length === 1, '重复入库去重');
SFV.model.removeFromLibrary('movie-42');
assert(SFV.model.getLibrary().length === 0, 'removeFromLibrary 移除');

console.log('\n=== Step 2 逻辑测试: ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail === 0 ? 0 : 1);
