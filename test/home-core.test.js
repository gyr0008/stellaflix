/*
 * #6-序4 home-core 单元测试
 * 验证纯工具核心（SFV.homeCore）：fmtTime 中文时长格式化 / escHtml / escAttr HTML 转义，
 * 并与 home.js 接线后 facade 形状一致（home.js 加载期仅别名绑定 + facade 赋值，不触碰 document）。
 *
 * 运行：node --test test/home-core.test.js
 * 跨 realm 比较一律用标量 === ，避免 vm 沙箱实例不相等陷阱。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const videoDir = path.resolve(__dirname, '..', 'public', 'video');
const coreCode = fs.readFileSync(path.join(videoDir, 'home-core.js'), 'utf8');
const homeCode = fs.readFileSync(path.join(videoDir, 'home.js'), 'utf8');

function makeCtx() {
  const ctx = {};
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.StellaflixVideo = {};
  ctx.URL = URL;
  ctx.console = console;
  return ctx;
}

test('core: fmtTime 秒数 → 中文时长', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const HC = ctx.StellaflixVideo.homeCore;
  assert.equal(HC.fmtTime(0), '0秒');
  assert.equal(HC.fmtTime(59), '59秒');
  assert.equal(HC.fmtTime(60), '1分钟');
  assert.equal(HC.fmtTime(300), '5分钟');
  assert.equal(HC.fmtTime(3599), '59分钟');
  assert.equal(HC.fmtTime(3600), '1小时');
  assert.equal(HC.fmtTime(3720), '1小时2分');
  assert.equal(HC.fmtTime(7325), '2小时2分');
});

test('core: escHtml 转义特殊字符', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const HC = ctx.StellaflixVideo.homeCore;
  assert.equal(HC.escHtml('<a>&"\''), '&lt;a&gt;&amp;&quot;&#39;');
  assert.equal(HC.escHtml(null), '');
  assert.equal(HC.escHtml(5), '5');
  assert.equal(HC.escHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
});

test('core: escAttr 等同 escHtml', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const HC = ctx.StellaflixVideo.homeCore;
  assert.equal(HC.escAttr('<b>'), HC.escHtml('<b>'));
  assert.equal(HC.escAttr('x&y'), 'x&amp;y');
});

test('core: 幂等守卫——重复加载安全跳过', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const first = ctx.StellaflixVideo.homeCore;
  vm.runInNewContext(coreCode, ctx);
  const second = ctx.StellaflixVideo.homeCore;
  assert.equal(first, second);
});

test('接线：home.js 加载后 SFV.home facade 形状完整且 homeCore 未被覆盖', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const homeCoreBefore = ctx.StellaflixVideo.homeCore;
  // 无 dispatch / 无 document：boot() 微任务中 install() 早退，加载期零 DOM 访问
  vm.runInNewContext(homeCode, ctx);
  const SFV = ctx.StellaflixVideo;
  assert.ok(SFV.home, 'SFV.home 已注册（说明 homeCore 守卫通过）');
  const expectFns = [
    'render', 'restoreMusic', 'install', 'cardDefs', 'renderContinueWatching',
    'captureMusicDefaults', 'applyMusicDefaults', 'renderVideoPoster', 'pickVideoPoster',
    'setCardArt', 'pickLocalVideoPoster', 'resetVideoPoster', 'getUserVideoPoster',
    'setUserVideoPoster', 'clearUserVideoPoster', 'editVideoPosterQuote', 'saveVideoPosterQuote',
  ];
  for (const fn of expectFns) {
    assert.equal(typeof SFV.home[fn], 'function', 'SFV.home.' + fn + ' 是函数');
  }
  // home.js 抽走纯工具后，homeCore 必须原样保留（未被覆盖）
  assert.equal(SFV.homeCore, homeCoreBefore, 'homeCore 未被 home.js 覆盖');
  assert.equal(typeof SFV.homeCore.fmtTime, 'function');
  assert.equal(typeof SFV.homeCore.escHtml, 'function');
  assert.equal(typeof SFV.homeCore.escAttr, 'function');
});
