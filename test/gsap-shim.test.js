/*
 * gsap-shim.test.js — 验证 gsap-waapi-shim.js 在「无 rAF / 无 DOM」的 node 降级路径下
 * 正确套用终态并暴露契约（set / to / fromTo / killTweensOf / timeline / delayedCall）。
 * 浏览器（有 rAF）走真实动画；此测试只断言降级路径的确定性终态契约。
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const SHIM = path.join(__dirname, '..', 'public', 'vendor', 'gsap-waapi-shim.js');

function fakeEl() { return { style: {}, scrollTop: 0 }; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

test('gsap global 暴露 6 个 API', () => {
  const g = require(SHIM);
  for (const k of ['to', 'fromTo', 'set', 'killTweensOf', 'timeline', 'delayedCall']) {
    assert.strictEqual(typeof g[k], 'function', '缺少 API: ' + k);
  }
});

test('set：transform 组合 + autoAlpha + opacity', () => {
  const g = require(SHIM);
  const el = fakeEl();
  g.set(el, { x: 10, y: 5, scale: 2, rotation: 30, autoAlpha: 0, opacity: 0.5 });
  assert.strictEqual(el.style.transform, 'translate3d(10px,5px,0px) scale(2,2) rotate(30deg)', 'transform 组合');
  assert.strictEqual(el.style.visibility, 'hidden', 'autoAlpha 隐藏');
  assert.strictEqual(el.style.opacity, '0.5', 'opacity');
});

test('set：clearProps 清除 inline 样式', () => {
  const g = require(SHIM);
  const el = fakeEl();
  g.set(el, { opacity: 0.3 });
  assert.strictEqual(el.style.opacity, '0.3');
  g.set(el, { clearProps: 'opacity' });
  assert.strictEqual(el.style.opacity, '', 'clearProps 应清空');
});

test('set：普通 JS 对象数值属性（Three.js 风格）', () => {
  const g = require(SHIM);
  const obj = { rowSettle: 1, detailIntro: 1 };
  g.set(obj, { rowSettle: 0, detailIntro: 0.5 });
  assert.strictEqual(obj.rowSettle, 0);
  assert.strictEqual(obj.detailIntro, 0.5);
});

test('to：普通对象补间终态', () => {
  const g = require(SHIM);
  const obj = { rowSettle: 1, detailIntro: 1 };
  g.to(obj, { rowSettle: 0, detailIntro: 0, duration: 0.5, ease: 'power2.out' });
  assert.strictEqual(obj.rowSettle, 0);
  assert.strictEqual(obj.detailIntro, 0);
});

test('fromTo：DOM 元素终态 scale=1', () => {
  const g = require(SHIM);
  const el = fakeEl();
  g.fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.3, ease: 'back.out(1.8)' });
  assert.strictEqual(el.style.transform, 'translate3d(0px,0px,0px) scale(1,1) rotate(0deg)');
});

test('killTweensOf：对降级已落地补间为安全 no-op', () => {
  const g = require(SHIM);
  const el = fakeEl();
  g.to(el, { x: 100, duration: 0.5 });
  assert.doesNotThrow(() => g.killTweensOf(el));
  assert.doesNotThrow(() => g.killTweensOf(el, 'x'));
});

test('timeline（降级）：链式 fromTo + to 终态均落地', async () => {
  const g = require(SHIM);
  const tlEl = fakeEl();
  const tlObj = { a: 9 };
  let completed = false;
  g.timeline({ defaults: { overwrite: true }, onComplete: () => { completed = true; } })
    .fromTo(tlEl, { scale: 0.985 }, { scale: 1, duration: 0.34 })
    .to(tlObj, { a: 1, duration: 0.2 });
  await delay(5); // 等待 setTimeout(play,0) 执行
  assert.strictEqual(tlEl.style.transform, 'translate3d(0px,0px,0px) scale(1,1) rotate(0deg)', 'timeline DOM 终态');
  assert.strictEqual(tlObj.a, 1, 'timeline 对象终态');
  assert.strictEqual(completed, true, 'timeline onComplete 应触发');
});

test('delayedCall：返回可 kill 的句柄', () => {
  const g = require(SHIM);
  let fired = false;
  const dc = g.delayedCall(0.001, () => { fired = true; });
  assert.ok(dc && typeof dc.kill === 'function');
  dc.kill();
  return delay(5).then(() => assert.strictEqual(fired, false, 'kill 后不应触发'));
});

test('ease：back.out / elastic.out 在端点值正确（无 NaN）', () => {
  const g = require(SHIM);
  const el = fakeEl();
  // 用 fromTo 经直接 Tween 不可达，改为 set 不验证 ease；此处仅验证 parseEase 不抛
  // 通过 to 一个对象并断言无 NaN
  const o = { v: 0 };
  g.to(o, { v: 1, duration: 0.1, ease: 'elastic.out(1,0.55)' });
  assert.ok(Number.isFinite(o.v), 'elastic 终态应为有限数');
  g.to(o, { v: 0, duration: 0.1, ease: 'back.out(2.1)' });
  assert.ok(Number.isFinite(o.v), 'back 终态应为有限数');
});

test('boxShadow 多阴影：终态为合法 CSS（回归：不得把颜色通道当 px 产生垃圾）', () => {
  const g = require(SHIM);
  const el = fakeEl();
  // 降级路径直接落终态（HAS_RAF=false）
  g.fromTo(el,
    { boxShadow: '0 30px 100px rgba(0,0,0,.62),0 0 0 1px rgba(244,210,138,.16)' },
    { boxShadow: '0 30px 100px rgba(0,0,0,.62),0 0 34px rgba(244,210,138,.18)' });
  assert.ok(/0px 0px 34px rgba\(244,210,138,0\.18\)/.test(el.style.boxShadow),
    '终态应含 to 金辉光 blur=34px，实得: ' + el.style.boxShadow);
  assert.ok(!/244px 210px 138px/.test(el.style.boxShadow),
    '终态不得含格式错误（颜色通道当 px），实得: ' + el.style.boxShadow);
});
