// T129 final E2E: 模拟真实启动 → init → 用户在设置面板切换 → 重启 → 验证启动空间正确
const fs = require('fs');
const vm = require('vm');

const store = {};
const fakeLocalStorage = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

function makeCtx() {
  const ctx = {
    window: null,
    document: {
      body: { classList: { toggle: () => {}, _cls: new Set(), contains: () => false } },
      addEventListener: () => {},
      createElement: () => ({ classList: { toggle: () => {} } })
    },
    localStorage: fakeLocalStorage,
    CustomEvent: function () {},
    dispatchEvent: () => {},
    console: console
  };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  return ctx;
}

const code = fs.readFileSync('public/video/state.js', 'utf8');

let pass = 0, fail = 0;
function expect(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log('  PASS:', name); }
  else    { fail++; console.log('  FAIL:', name, '| got=' + JSON.stringify(got), 'want=' + JSON.stringify(want)); }
}

// === 场景 A：全新安装 → 启动 → 默认 music ===
console.log('=== Scenario A: Fresh install ===');
let ctx = makeCtx();
vm.runInContext(code, ctx);
ctx.StellaflixVideo.state.init();
expect('fresh start space is music', ctx.StellaflixVideo.state.getSpace(), 'music');

// === 场景 B：用户在设置面板切到 video → 立即生效 → 持久化 ===
console.log('=== Scenario B: User switches to video in settings ===');
ctx.StellaflixVideo.state.setStartSpace('video');
ctx.StellaflixVideo.state.setSpace('video');
expect('start pref video', ctx.StellaflixVideo.state.getStartSpace(), 'video');
expect('runtime video', ctx.StellaflixVideo.state.getSpace(), 'video');
expect('persist start key', store['stellaflix-start-space'], 'video');
expect('persist runtime key', store['stellaflix-space-mode'], 'video');

// === 场景 C：用户切到 music 偏好，但运行时已经在 video 切到 music → 重启时进入 music ===
console.log('=== Scenario C: Set music pref, restart ===');
ctx.StellaflixVideo.state.setStartSpace('music');
// 模拟关闭应用
const ctx2 = makeCtx();
vm.runInContext(code, ctx2);
ctx2.StellaflixVideo.state.init();
expect('restart enters music', ctx2.StellaflixVideo.state.getSpace(), 'music');

// === 场景 D：setStartSpace 不应触发 spacechange 事件（不会闪屏） ===
console.log('=== Scenario D: setStartSpace does not change runtime ===');
let events = 0;
const ctx3 = makeCtx();
ctx3.dispatchEvent = (e) => { events++; };
ctx3.CustomEvent = function (n, init) { this.name = n; this.detail = init && init.detail; };
vm.createContext(ctx3);
vm.runInContext(code, ctx3);
ctx3.StellaflixVideo.state.init();
events = 0;
ctx3.StellaflixVideo.state.setStartSpace('video');
expect('no event emitted by setStartSpace', events, 0);
expect('runtime unchanged after setStartSpace', ctx3.StellaflixVideo.state.getSpace(), 'music');

// === 场景 E：stale localStorage 值（损坏）→ 降级为 music ===
console.log('=== Scenario E: Corrupted localStorage ===');
store['stellaflix-start-space'] = 'GARBAGE';
const ctx4 = makeCtx();
vm.runInContext(code, ctx4);
expect('getStartSpace ignores garbage', ctx4.StellaflixVideo.state.getStartSpace(), 'music');
ctx4.StellaflixVideo.state.init();
expect('init with garbage defaults to music', ctx4.StellaflixVideo.state.getSpace(), 'music');

// === 场景 F：API 表面完整 ===
console.log('=== Scenario F: API surface ===');
expect('init exposed', typeof ctx4.StellaflixVideo.state.init, 'function');
expect('setSpace exposed', typeof ctx4.StellaflixVideo.state.setSpace, 'function');
expect('toggle exposed', typeof ctx4.StellaflixVideo.state.toggle, 'function');
expect('getSpace exposed', typeof ctx4.StellaflixVideo.state.getSpace, 'function');
expect('isVideo exposed', typeof ctx4.StellaflixVideo.state.isVideo, 'function');
expect('isMusic exposed', typeof ctx4.StellaflixVideo.state.isMusic, 'function');
expect('getStartSpace exposed', typeof ctx4.StellaflixVideo.state.getStartSpace, 'function');
expect('setStartSpace exposed', typeof ctx4.StellaflixVideo.state.setStartSpace, 'function');
expect('EVENT constant', ctx4.StellaflixVideo.state.EVENT, 'spacechange');
expect('STORAGE_KEY constant', ctx4.StellaflixVideo.state.STORAGE_KEY, 'stellaflix-space-mode');
expect('START_SPACE_KEY constant', ctx4.StellaflixVideo.state.START_SPACE_KEY, 'stellaflix-start-space');

console.log('---');
console.log('Total: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
