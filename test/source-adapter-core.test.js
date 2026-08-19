/*
 * #6-序3 source-adapter-core 单元测试
 * 验证纯算法核心（SFV.sourceAdapterCore）：URL 归一化 / 代理构造 / 扩展名判定 /
 * HLS 预清洗诊断 / resolve 分类，并与 source-adapter.js 接线后 facade 形状一致。
 *
 * 运行：node --test test/source-adapter-core.test.js
 * 跨 realm 比较一律用标量 === 或 JSON.stringify，避免 vm 沙箱 Array 实例不相等陷阱。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const videoDir = path.resolve(__dirname, '..', 'public', 'video');
const coreCode = fs.readFileSync(path.join(videoDir, 'source-adapter-core.js'), 'utf8');
const adapterCode = fs.readFileSync(path.join(videoDir, 'source-adapter.js'), 'utf8');

// 构造无 DOM 的沙箱（node 环境），URL 可用、location 缺失（parseUrl 回落绝对 URL）
function makeCtx() {
  const ctx = {};
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.StellaflixVideo = {};
  ctx.URL = URL;
  ctx.console = console;
  return ctx;
}

test('core: toProxyUrl 编码', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(
    SAC.toProxyUrl('https://a.com/b c.mp4?x=1&y=2'),
    '/api/proxy?url=' + encodeURIComponent('https://a.com/b c.mp4?x=1&y=2')
  );
});

test('core: PROXY_PATH 常量', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  assert.equal(ctx.StellaflixVideo.sourceAdapterCore.PROXY_PATH, '/api/proxy');
});

test('core: basename 解码', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC.basename('/path/foo%20bar.mp4'), 'foo bar.mp4');
  assert.equal(SAC.basename(''), '');
});

test('core: isHlsUrl / isFlvUrl 边界', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC.isHlsUrl('https://c/a.m3u8'), true);
  assert.equal(SAC.isHlsUrl('https://c/a.mp4'), false);
  assert.equal(SAC.isFlvUrl('https://c/a.flv?t=1'), true);
  assert.equal(SAC.isFlvUrl('https://c/a.mp4'), false);
  assert.equal(SAC.isHlsUrl(123), false);
});

test('core: parseUrl 无效返回 null', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC.parseUrl('not a url'), null);
  assert.equal(typeof SAC.parseUrl('https://c/a.mp4'), 'object');
});

test('core: sameOrigin 无 location 返回 false', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC.sameOrigin({ origin: 'https://c' }), false);
});

test('core: isFileLike 判定', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC.isFileLike({ name: 'a.mp4', path: '/x/a.mp4' }), true);
  assert.equal(SAC.isFileLike('string'), false);
  assert.equal(SAC.isFileLike({}), false);
});

test('core: urlSummary 截断与结构', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  const s = SAC.urlSummary('https://cdn.example.com/live/stream.m3u8?token=1');
  assert.equal(s.includes('cdn.example.com'), true);
  assert.equal(s.endsWith('?...'), true);
  assert.equal(SAC.urlSummary(''), '(empty)');
});

test('core: sanitizeHlsUrl 预清洗', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  const ws = SAC.sanitizeHlsUrl('  https://a.com/b.m3u8  ');
  assert.equal(ws.cleaned, true);
  assert.equal(ws.url, 'https://a.com/b.m3u8');
  assert.equal(ws.reason.includes('whitespace'), true);
  const pr = SAC.sanitizeHlsUrl('//cdn.example.com/a.m3u8');
  assert.equal(pr.url, 'https://cdn.example.com/a.m3u8');
  assert.equal(pr.reason, 'protocol-relative');
  const empty = SAC.sanitizeHlsUrl('');
  assert.equal(empty.cleaned, false);
  assert.equal(empty.reason, 'empty');
});

test('core: looksLikeRealM3u8 判定', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC.looksLikeRealM3u8('https://c/a.m3u8'), true);
  assert.equal(SAC.looksLikeRealM3u8('https://c/a.mp4'), false);
  assert.equal(SAC.looksLikeRealM3u8('https://c/video/x'), true);
  assert.equal(SAC.looksLikeRealM3u8('https://c/path/playlist'), true);
});

test('core: _extractDomain 提取主机', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC._extractDomain('https://cdn.example.com/a.m3u8'), 'cdn.example.com');
});

test('core: nativeHlsSupported 无 document 返回 false', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(SAC.nativeHlsSupported(), false);
});

test('core: resolve 归一化分类', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const SAC = ctx.StellaflixVideo.sourceAdapterCore;

  assert.equal(SAC.resolve(null).ok, false);
  assert.equal(SAC.resolve(null).reason, 'empty-input');
  assert.equal(SAC.resolve('').ok, false);
  assert.equal(SAC.resolve('   ').reason, 'empty-url');
  assert.equal(SAC.resolve(12345).reason, 'unsupported-input-type');
  assert.equal(SAC.resolve('ftp://example.com/a.mp4').reason.startsWith('unsupported-scheme'), true);
  assert.equal(SAC.resolve({ url: '' }).reason, 'empty-url');

  const local = SAC.resolve({ name: 'a.mp4', path: '/x/a.mp4' });
  assert.equal(local.ok, true);
  assert.equal(local.kind, 'local');

  assert.equal(SAC.resolve('blob:http://127.0.0.1:7879/abc').kind, 'local');
  assert.equal(SAC.resolve('file:///D:/media/a.mp4').kind, 'local');

  const direct = SAC.resolve('https://cdn.example.com/x.mp4');
  assert.equal(direct.ok, true);
  assert.equal(direct.kind, 'direct');
  assert.equal(direct.needsProxy, true);

  const hls = SAC.resolve('https://cdn.example.com/live/stream.m3u8');
  assert.equal(hls.ok, true);
  assert.equal(hls.kind, 'hls');
  assert.equal(hls.requiresHlsLib, true);
  assert.equal(hls.playUrl.startsWith('/api/proxy?url='), true);

  const titled = SAC.resolve({ url: 'https://cdn.example.com/x.mp4', title: '自定义标题' });
  assert.equal(titled.ok, true);
  assert.equal(titled.title, '自定义标题');

  const flv = SAC.resolve('https://cdn.example.com/live/stream.flv');
  assert.equal(flv.ok, true);
  assert.equal(flv.kind, 'flv');
});

test('core: 幂等守卫——重复加载安全跳过', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  const first = ctx.StellaflixVideo.sourceAdapterCore;
  vm.runInNewContext(coreCode, ctx);
  const second = ctx.StellaflixVideo.sourceAdapterCore;
  assert.equal(first, second);
});

test('接线：source-adapter 加载后 SFV.source facade 复用 core 且形状完整', () => {
  const ctx = makeCtx();
  vm.runInNewContext(coreCode, ctx);
  // 无 DOM 也应能完成加载期（仅别名绑定 + facade 赋值，不触碰 document）
  vm.runInNewContext(adapterCode, ctx);
  const SFV = ctx.StellaflixVideo;
  assert.ok(SFV.source, 'SFV.source 已注册');
  const expectFns = [
    'resolve', 'open', 'toProxyUrl', 'isHlsUrl', 'attachHls', 'attachFlv',
    'loadFlvLib', 'makeProxyLoader', 'onPlayerClose', 'nativeHlsSupported',
    'isFlvUrl', 'sanitizeHlsUrl', 'looksLikeRealM3u8', 'urlSummary',
    'tryNativeFallback', 'showDiagnosticOverlay',
  ];
  for (const fn of expectFns) {
    assert.equal(typeof SFV.source[fn], 'function', 'SFV.source.' + fn + ' 是函数');
  }
  assert.equal(SFV.source.resolve, SFV.sourceAdapterCore.resolve, 'resolve 直接复用 core');
  assert.equal(SFV.source.toProxyUrl, SFV.sourceAdapterCore.toProxyUrl, 'toProxyUrl 直接复用 core');
  // facade 仍可正常分类
  assert.equal(SFV.source.resolve('https://cdn.example.com/live/stream.m3u8').kind, 'hls');
  assert.equal(SFV.source.isFlvUrl('https://c/a.flv?t=1'), true);
});
