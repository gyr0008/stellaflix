/*
 * #6-序5 — page-browse-3d 零依赖纯层单测（Node vm 沙箱，无 DOM/THREE/fetch 依赖）
 * 覆盖：normalizeHexColor / hexToRgba / metricsForWidth / roundRect + 幂等守卫 + facade 形状。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const CORE = path.join(__dirname, '..', 'public', 'video', 'page-browse-3d-core.js');

function newCtx() {
  const ctx = { StellaflixVideo: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}
function loadCore(ctx) {
  const code = fs.readFileSync(CORE, 'utf8');
  vm.runInContext(code, ctx, { filename: CORE });
}

test('normalizeHexColor：规范化合法 hex / 回退非法值', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.browse3dCore.normalizeHexColor;
  assert.equal(f('#abc', '#fff'), '#abc');
  assert.equal(f('#f4d28a', '#fff'), '#f4d28a');
  assert.equal(f('#FFF', '#fff'), '#FFF');          // trim 后仍合法
  assert.equal(f(' #f4d28a ', '#fff'), '#f4d28a');  // 自动 trim
  assert.equal(f('red', '#fff'), '#fff');            // 非法 → 回退
  assert.equal(f('#gggggg', '#fff'), '#fff');        // 非法字符 → 回退
  assert.equal(f('#12345', '#fff'), '#fff');         // 长度非法 → 回退
  assert.equal(f(null, '#fff'), '#fff');             // 非字符串 → 回退
  assert.equal(f(undefined, '#zzz'), '#zzz');        // 回退值透传
});

test('hexToRgba：hex → rgba 字符串（含 3 位简写与回退）', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.browse3dCore.hexToRgba;
  assert.equal(f('#f4d28a', 0.5), 'rgba(244,210,138,0.5)');
  assert.equal(f('#abc', 1), 'rgba(170,187,204,1)');
  assert.equal(f('invalid', 0.3), 'rgba(244,210,138,0.3)'); // 回退默认暗金
  assert.equal(f(null, 0), 'rgba(244,210,138,0)');
});

test('metricsForWidth：响应式列数/内边距映射（边界）', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.browse3dCore.metricsForWidth;
  let m = f(639);  assert.equal(m.cols, 2); assert.equal(m.pad, 16); assert.equal(m.gap, 16);
  m = f(640);      assert.equal(m.cols, 3); assert.equal(m.pad, 24);
  m = f(767);      assert.equal(m.cols, 3); assert.equal(m.pad, 24);
  m = f(768);      assert.equal(m.cols, 4); assert.equal(m.pad, 24);
  m = f(1023);     assert.equal(m.cols, 4); assert.equal(m.pad, 24);
  m = f(1024);     assert.equal(m.cols, 5); assert.equal(m.pad, 32);
  m = f(3000);     assert.equal(m.cols, 5); assert.equal(m.pad, 32);
});

test('roundRect：圆角矩形路径（ctx 作参，含半径钳制）', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.browse3dCore.roundRect;

  const calls = [];
  const mock = {
    beginPath: () => calls.push(['beginPath']),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    arcTo: (x1, y1, x2, y2, r) => calls.push(['arcTo', x1, y1, x2, y2, r]),
    closePath: () => calls.push(['closePath'])
  };
  f(mock, 10, 20, 100, 50, 8);
  assert.equal(calls[0][0], 'beginPath');
  assert.deepEqual([calls[1][0], calls[1][1], calls[1][2]], ['moveTo', 18, 20]); // x+r
  assert.equal(calls[calls.length - 1][0], 'closePath');

  // 半径钳制：w=10,h=10,r=8 → r 钳到 5
  const calls2 = [];
  const mock2 = {
    beginPath: () => calls2.push(['beginPath']),
    moveTo: (x, y) => calls2.push(['moveTo', x, y]),
    lineTo: (x, y) => calls2.push(['lineTo', x, y]),
    arcTo: (x1, y1, x2, y2, r) => calls2.push(['arcTo', x1, y1, x2, y2, r]),
    closePath: () => calls2.push(['closePath'])
  };
  f(mock2, 0, 0, 10, 10, 8);
  const arcRadii = calls2.filter(c => c[0] === 'arcTo').map(c => c[5]);
  assert.ok(arcRadii.every(r => r === 5), '半径应钳制为 5');
});

test('幂等守卫：core 重复加载不覆盖已有 facade', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const first = ctx.StellaflixVideo.browse3dCore;
  assert.ok(first && typeof first.normalizeHexColor === 'function');
  loadCore(ctx); // 第二次加载应跳过（if (SFV.browse3dCore) return）
  assert.equal(ctx.StellaflixVideo.browse3dCore, first, 'facade 引用不变');
});

test('facade 形状：browse3dCore 暴露 4 个函数', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const C = ctx.StellaflixVideo.browse3dCore;
  assert.ok(C && typeof C === 'object');
  for (const k of ['normalizeHexColor', 'hexToRgba', 'metricsForWidth', 'roundRect']) {
    assert.equal(typeof C[k], 'function', k + ' 应为 function');
  }
});
