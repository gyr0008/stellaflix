// T129 验证：state.js 启动偏好解耦
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
      body: { classList: { toggle: () => {}, contains: () => false } },
      addEventListener: () => {},
      createElement: () => ({ classList: { toggle: () => {} } })
    },
    localStorage: fakeLocalStorage,
    CustomEvent: function (name, init) { this.name = name; this.detail = init && init.detail; },
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
  if (ok) { pass++; console.log('  PASS:', name, '=', got); }
  else    { fail++; console.log('  FAIL:', name, 'got=' + got, 'want=' + want); }
}

// === Case 1: 无持久化 → 默认 music ===
console.log('--- Case 1: no persistence ---');
let ctx = makeCtx();
vm.runInContext(code, ctx);
let s = ctx.StellaflixVideo.state;
expect('getStartSpace initial', s.getStartSpace(), 'music');
s.init();
expect('init default space', s.getSpace(), 'music');

// === Case 2: setStartSpace('video') 持久化 ===
console.log('--- Case 2: set video + persist ---');
s.setStartSpace('video');
expect('getStartSpace after set video', s.getStartSpace(), 'video');
expect('localStorage[stellaflix-start-space]', store['stellaflix-start-space'], 'video');

// === Case 3: 重新载入 → 读 video ===
console.log('--- Case 3: reload reads video ---');
ctx = makeCtx();
vm.runInContext(code, ctx);
s = ctx.StellaflixVideo.state;
s.init();
expect('reload init gets video', s.getSpace(), 'video');

// === Case 4: 运行时切到 music 不影响启动偏好 ===
console.log('--- Case 4: runtime setSpace does not clobber start pref ---');
s.setSpace('music');
expect('runtime getSpace after setSpace(music)', s.getSpace(), 'music');
expect('start pref unchanged', s.getStartSpace(), 'video');

// === Case 5: 切回 music 持久化 ===
console.log('--- Case 5: setStartSpace(music) persists ---');
s.setStartSpace('music');
expect('getStartSpace after set music', s.getStartSpace(), 'music');
expect('localStorage updated', store['stellaflix-start-space'], 'music');

// === Case 6: 非法值被拒绝 ===
console.log('--- Case 6: invalid value rejected ---');
s.setStartSpace('xyz');
expect('invalid value rejected', s.getStartSpace(), 'music');

// === Case 7: force 强制 setSpace ===
console.log('--- Case 7: force setSpace same mode ---');
s.setSpace('music', { force: true });
expect('force same mode', s.getSpace(), 'music');

// === Case 8: setSpace 持久化到原键 ===
console.log('--- Case 8: setSpace persists runtime key ---');
delete store['stellaflix-space-mode'];
s.setSpace('video');
expect('runtime key persisted', store['stellaflix-space-mode'], 'video');
expect('start pref still music', s.getStartSpace(), 'music');

// === Case 9: isVideo/isMusic ===
console.log('--- Case 9: isVideo/isMusic ---');
expect('isVideo after setSpace video', s.isVideo(), true);
expect('isMusic after setSpace video', s.isMusic(), false);

console.log('---');
console.log('Total: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
