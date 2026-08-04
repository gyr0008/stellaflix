// T129 DOM/集成验证：模拟设置面板里状态切换器渲染
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const store = {};
const fakeLocalStorage = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

// 构造最小化的 DOM 元素
function makeEl(tag) {
  return {
    tag,
    classList: {
      _cls: new Set(),
      add: function (c) { this._cls.add(c); },
      remove: function (c) { this._cls.delete(c); },
      toggle: function (c, force) {
        if (force === true) this._cls.add(c);
        else if (force === false) this._cls.delete(c);
        else if (this._cls.has(c)) this._cls.delete(c);
        else this._cls.add(c);
        return this._cls.has(c);
      },
      contains: function (c) { return this._cls.has(c); }
    },
    attrs: {},
    setAttribute: function (k, v) { this.attrs[k] = v; },
    getAttribute: function (k) { return this.attrs[k]; },
    _text: '',
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    children: [],
    querySelector: function (sel) {
      // 简化: 模拟 [class~="ss-current"] 选取
      const m = sel.match(/^\.([\w-]+)$/);
      if (!m) return null;
      const want = m[1];
      for (const c of this.children) {
        if (c.classList && c.classList.contains(want)) return c;
      }
      return null;
    },
    addEventListener: function () {}
  };
}

const ctx = {
  window: null,
  document: {
    body: makeEl('body'),
    addEventListener: function (ev, fn) {
      this._listeners = this._listeners || {};
      this._listeners[ev] = this._listeners[ev] || [];
      this._listeners[ev].push(fn);
    },
    _listeners: {},
    createElement: function (tag) { return makeEl(tag); },
    readyState: 'complete'
  },
  localStorage: fakeLocalStorage,
  CustomEvent: function (name, init) { this.name = name; this.detail = init && init.detail; },
  dispatchEvent: () => {},
  Promise: Promise,
  console: console
};
ctx.window = ctx;
ctx.global = ctx;
vm.createContext(ctx);

const code = fs.readFileSync('public/video/state.js', 'utf8');
vm.runInContext(code, ctx);

// 模拟新加的 index.html inline 脚本片段
const inlineCode = `
function getStartSpacePreference() {
  var SFV = window.StellaflixVideo;
  if (SFV && SFV.state && typeof SFV.state.getStartSpace === 'function') {
    return SFV.state.getStartSpace();
  }
  try {
    var raw = localStorage.getItem('stellaflix-start-space');
    if (raw === 'video' || raw === 'music') return raw;
  } catch (e) {}
  return 'music';
}
function setStartSpacePreference(mode) {
  var SFV = window.StellaflixVideo;
  if (SFV && SFV.state && typeof SFV.state.setStartSpace === 'function') {
    SFV.state.setStartSpace(mode);
    return;
  }
  try { localStorage.setItem('stellaflix-start-space', mode); } catch (e) {}
}
function updateStartSpaceUI() {
  var card = document.getElementById('t-startSpace');
  if (!card) return;
  var cur = getStartSpacePreference();
  var curEl = card.querySelector('.ss-current');
  var othEl = card.querySelector('.ss-other');
  if (curEl) curEl.textContent = cur === 'video' ? '影视空间' : '音乐空间';
  if (othEl) othEl.textContent = cur === 'video' ? '音乐空间' : '影视空间';
  card.classList.toggle('start-space-video', cur === 'video');
  card.setAttribute('aria-checked', cur === 'video' ? 'true' : 'false');
}
function toggleStartSpace() {
  var cur = getStartSpacePreference();
  var next = cur === 'video' ? 'music' : 'video';
  setStartSpacePreference(next);
  updateStartSpaceUI();
  var SFV = window.StellaflixVideo;
  if (SFV && SFV.state && typeof SFV.state.setSpace === 'function') {
    try { SFV.state.setSpace(next); } catch (e) {}
  }
  if (typeof showToast === 'function') showToast('toggled');
}

// 设置 mock: document.getElementById
document.getElementById = function (id) {
  if (id === 't-startSpace') return window.__mockCard;
  return null;
};
// 设置 mock: showToast
window.showToast = function () { window.__toasted = (window.__toasted || 0) + 1; };
`;
vm.runInContext(inlineCode, ctx);

// 构造 mock 卡片
const card = makeEl('div');
card.id = 't-startSpace';
const curEl = makeEl('em');
curEl.classList.add('ss-current');
curEl._text = '音乐空间';
const othEl = makeEl('em');
othEl.classList.add('ss-other');
othEl._text = '影视空间';
card.children.push(curEl, othEl);
ctx.__mockCard = card;

let pass = 0, fail = 0;
function expect(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log('  PASS:', name, '=', JSON.stringify(got)); }
  else    { fail++; console.log('  FAIL:', name, 'got=' + JSON.stringify(got), 'want=' + JSON.stringify(want)); }
}

// 1) 初始：默认 music → 卡片文字 ss-current=音乐空间, ss-other=影视空间, 无 start-space-video class
console.log('--- Test 1: initial render (default music) ---');
vm.runInContext('updateStartSpaceUI()', ctx);
expect('ss-current text', curEl._text, '音乐空间');
expect('ss-other text', othEl._text, '影视空间');
expect('aria-checked', card.attrs['aria-checked'], 'false');
expect('start-space-video class', card.classList.contains('start-space-video'), false);

// 2) toggle 切到 video
console.log('--- Test 2: toggleStartSpace() -> video ---');
vm.runInContext('toggleStartSpace()', ctx);
expect('ss-current text after toggle', curEl._text, '影视空间');
expect('ss-other text after toggle', othEl._text, '音乐空间');
expect('aria-checked', card.attrs['aria-checked'], 'true');
expect('start-space-video class', card.classList.contains('start-space-video'), true);
expect('localStorage persisted', store['stellaflix-start-space'], 'video');
expect('runtime space switched', ctx.StellaflixVideo.state.getSpace(), 'video');

// 3) toggle 切回 music
console.log('--- Test 3: toggleStartSpace() -> music ---');
vm.runInContext('toggleStartSpace()', ctx);
expect('ss-current text after second toggle', curEl._text, '音乐空间');
expect('ss-other text after second toggle', othEl._text, '影视空间');
expect('aria-checked', card.attrs['aria-checked'], 'false');
expect('start-space-video class', card.classList.contains('start-space-video'), false);
expect('localStorage persisted', store['stellaflix-start-space'], 'music');

// 4) 模拟「用户从设置面板切到 video → 关掉应用 → 重新打开」全流程
//    新 ctx 模拟新一次启动，localStorage 已持久化 video，应读到 video
console.log('--- Test 4: full cold-start flow with persisted video ---');
store['stellaflix-start-space'] = 'video'; // 重新固化
const ctx2 = {
  window: null,
  document: {
    body: makeEl('body'),
    addEventListener: () => {},
    createElement: () => makeEl('div'),
    readyState: 'complete',
    getElementById: () => null
  },
  localStorage: fakeLocalStorage,
  CustomEvent: function () {},
  dispatchEvent: () => {},
  console: console
};
ctx2.window = ctx2; ctx2.global = ctx2;
vm.createContext(ctx2);
vm.runInContext(code, ctx2);
ctx2.StellaflixVideo.state.init(); // 先 init 才会从 localStorage 加载偏好
expect('cold start reads video', ctx2.StellaflixVideo.state.getStartSpace(), 'video');
expect('cold start init space', ctx2.StellaflixVideo.state.getSpace(), 'video');

// 5) toggleStartSpace 在 toggle 期间 toast 计数
console.log('--- Test 5: toast called on each toggle ---');
expect('toast count', ctx.__toasted, 2);

console.log('---');
console.log('Total: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
