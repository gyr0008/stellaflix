/*
 * T135 回到顶部按钮 — 逻辑回归测试（无 jsdom，最小化 DOM 桩）
 * 验证：仅电影/动漫分页在「影视态 + 浏览层打开 + 滚动超阈值」时显示，
 *       点击平滑回顶后隐藏，切到其它 tab / 关层 / 切回音乐态均隐藏。
 */
const fs = require('fs');
const vm = require('vm');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL: ' + msg); } }

function makeClassList(initial) {
  const set = new Set(initial || []);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, on) => { if (on === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else { on ? set.add(c) : set.delete(c); } },
  };
}
function makeEl(tag, cls) {
  const listeners = {};
  const el = {
    tagName: tag, className: cls || '',
    classList: makeClassList(cls ? cls.split(/\s+/) : []),
    children: [], _listeners: listeners,
    scrollTop: 0,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    appendChild: (c) => { el.children.push(c); return c; },
    setAttribute: () => {},
    querySelector: () => null,
    dispatch: (t, ev) => { (listeners[t] || []).forEach(fn => fn(ev || {})); },
  };
  return el;
}

const scrollEl = makeEl('div', 'sfv-browse-body');
const overlay = makeEl('div', 'sfv-browse');
const body = makeEl('body', 'video-space-active');
body.querySelector = (sel) => {
  if (sel === '.sfv-browse.sfv-show') return overlay.classList.contains('sfv-show') ? overlay : null;
  if (sel === '.sfv-browse') return overlay;
  return null;
};
const docEl = makeEl('html', '');
const fakeDocument = { body, documentElement: docEl, createElement: (t) => makeEl(t, ''), querySelector: (sel) => body.querySelector(sel) };

const rafQueue = [];
const sandbox = {
  document: fakeDocument,
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  setTimeout: (fn) => { fn(); return 0; },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  addEventListener: () => {},
  StellaflixVideo: {},
  console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/video/back-to-top.js', 'utf8'), sandbox, { filename: 'back-to-top.js' });
const SFV = sandbox.StellaflixVideo;

// scrollTo 平滑分支桩
scrollEl.scrollTo = (opt) => { scrollEl.scrollTop = opt.top; };

let currentId = 'movie';
SFV.router = { currentId: () => currentId, go: (id) => { currentId = id; } };
SFV.backToTop.init(scrollEl);

function flushRaf() { while (rafQueue.length) rafQueue.shift()(); }
function btn() { return body.children.find((c) => c.className === 'sfv-backtotop'); }
function vis() { return btn().classList.contains('is-visible'); }
function scrollTo(px) { scrollEl.scrollTop = px; scrollEl.dispatch('scroll'); flushRaf(); }

console.log('\n=== T135 回到顶部按钮逻辑 ===\n');

// S1: 初始 + 层未打开 → 隐藏
ok(!vis(), 'S1 层未打开时默认隐藏');

// S2: 打开层 + 电影分页 + 顶部 → 隐藏
overlay.classList.add('sfv-show');
SFV.backToTop.update();
ok(!vis(), 'S2 电影分页顶部(scrollTop=0)隐藏');

// S3: 向下滚动超阈值 → 显示
scrollTo(400);
ok(vis(), 'S3 电影分页滚动 400px 后显示');

// S4: 点击回顶 → 隐藏
btn()._listeners.click[0]({ preventDefault() {} });
ok(!vis() && scrollEl.scrollTop === 0, 'S4 点击后平滑回顶并隐藏');

// S5: 滚动后切到「首页」(非 media) → 隐藏
scrollTo(400);
ok(vis(), 'S5a 电影分页滚动后显示');
SFV.router.go('home'); // 触发 go 包装的 update
ok(!vis(), 'S5b 切到首页立即隐藏(go 包装生效)');

// S6: 动漫分页滚动 → 显示（两页行为一致）
currentId = 'anime';
SFV.router.go('anime');
scrollTo(400);
ok(vis(), 'S6 动漫分页滚动后同样显示(一致)');

// S7: 切回音乐态 → 隐藏
body.classList.remove('video-space-active');
SFV.backToTop.update();
ok(!vis(), 'S7 离开影视态隐藏(双态隔离)');
body.classList.add('video-space-active');

// S8: 关闭浏览层 → 隐藏
scrollTo(400);
ok(vis(), 'S8a 电影分页滚动后显示');
overlay.classList.remove('sfv-show');
SFV.backToTop.update();
ok(!vis(), 'S8b 关闭浏览层隐藏(MutationObserver 等价路径)');

// S9: 电影→动漫分页切换，保持滚动 → 仍显示（不应误隐藏）
overlay.classList.add('sfv-show');
currentId = 'movie'; scrollTo(400);
ok(vis(), 'S9a 电影分页滚动显示');
SFV.router.go('anime');
ok(vis(), 'S9b 切到动漫(仍滚动)继续显示');

console.log('\n=== 汇总 ===');
console.log('T135: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
