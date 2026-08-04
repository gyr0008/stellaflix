/*
 * Step 4 — HLS(.m3u8) 接入测试（vm 沙箱）
 * 验证：resolve 识别 HLS、open() 路由到 attachHls、hls.js 直连 CDN（无 proxy loader）、
 *       hls 实例挂载 video 元素、onPlayerClose 销毁实例、错误恢复分支。
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var passed = 0, failed = 0, errors = [];
function assert(cond, label) {
  if (cond) { passed++; return true; }
  failed++; errors.push('FAIL: ' + label); return false;
}

// ---- fake Hls ----
function FakeLoader(config) { this.config = config; }
FakeLoader.prototype.load = function (context, config, callbacks) {
  FakeLoader.calls.push({ context: context, callbacks: callbacks });
};

function FakeHls(config) {
  this.config = config;
  FakeHls.instances.push(this);
  this.handlers = {};
}
FakeHls.isSupported = function () { return true; };
FakeHls.Events = { MEDIA_ATTACHED: 'MEDIA_ATTACHED', MANIFEST_PARSED: 'MANIFEST_PARSED', ERROR: 'ERROR' };
FakeHls.ErrorTypes = { NETWORK_ERROR: 'NETWORK', MEDIA_ERROR: 'MEDIA' };
FakeHls.DefaultConfig = { loader: FakeLoader };
FakeHls.instances = [];
FakeHls.destroyed = 0;
FakeHls.prototype.on = function (ev, cb) { this.handlers[ev] = cb; };
FakeHls.prototype._fire = function (ev, arg1, arg2) { if (this.handlers[ev]) this.handlers[ev](arg1, arg2); };
FakeHls.prototype.attachMedia = function (v) { this.videoEl = v; this._fire('MEDIA_ATTACHED'); this._fire('MANIFEST_PARSED'); };
FakeHls.prototype.loadSource = function (url) { this.loadedUrl = url; };
FakeHls.prototype.startLoad = function () {};
FakeHls.prototype.recoverMediaError = function () {};
FakeHls.prototype.destroy = function () { FakeHls.destroyed++; this.destroyedFlag = true; };

var fakeVideo = {
  play: function () { fakeVideo.played = true; return { catch: function () {} }; },
  paused: false,
};

var playerState = { prepared: false, id: null, url: null };
var toastMsgs = [];

var _store = {};
var g = {
  StellaflixVideo: {},
  Hls: FakeHls,
  console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {}, debug: function () {} },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  Promise: Promise,
  location: { origin: 'https://app.local', href: 'https://app.local/' },
  URL: function (u, b) {
    var m = /^([a-z]+):\/\/([^\/]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i.exec(u);
    if (!m) { this.protocol = ''; this.href = u; this.pathname = ''; this.hostname = ''; this.origin = ''; return; }
    this.protocol = m[1] + ':';
    this.hostname = m[2];
    this.pathname = m[3] || '/';
    this.href = u;
    this.origin = this.protocol + '//' + this.hostname;
  },
  localStorage: {
    getItem: function (k) { return _store[k] || null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
  },
  document: {
    createElement: function (tag) {
      if (tag === 'video') return { canPlayType: function () { return ''; }, play: function () { return { catch: function () {} }; } };
      return { tagName: tag, setAttribute: function () {}, appendChild: function () {}, className: '', style: {} };
    },
    head: { appendChild: function () {} },
  },
  CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
  dispatchEvent: function () { return true; },
};
g.window = g; g.self = g; g.global = g;
g.StellaflixVideo.player = {
  getVideoEl: function () { return fakeVideo; },
  setCurrentUrl: function (u) { playerState.url = u; },
  prepareForPlay: function (id, title) { playerState.prepared = true; playerState.id = id; return true; },
};
g.StellaflixVideo.online = { toast: function (m) { toastMsgs.push(m); } };

var ctx = vm.createContext(g);
function load(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'video', file), 'utf8'), ctx, { filename: file }); }
load('source-adapter.js');

var SFV = g.StellaflixVideo;
var S = SFV.source;

// ================================================================
console.log('--- A. resolve() 识别 HLS ---');
var r = S.resolve('https://example.com/play/a.m3u8');
assert(r.ok === true, 'm3u8 解析 ok');
assert(r.kind === 'hls', 'kind = hls');
assert(r.requiresHlsLib === true, 'requiresHlsLib = true（Chromium 不原生支持）');
assert(r.rawUrl === 'https://example.com/play/a.m3u8', 'rawUrl 保留原始地址');
assert(r.id === 'url:https://example.com/play/a.m3u8', '进度键回落 url: 原始地址');

// ================================================================
console.log('--- B. open() 路由到 attachHls + 挂载 ---');
(async function () {
  var p = S.open({ url: 'https://example.com/play/a.m3u8', title: '测试片', id: 'site1:7:3' });
  assert(p && typeof p.then === 'function', 'open m3u8 返回 Promise');

  await p;

  assert(FakeHls.instances.length === 1, '创建了 1 个 Hls 实例');
  var hls = FakeHls.instances[0];
  // 2026-08-01 架构升级：移除默认 ProxyLoader，hls.js 直连 CDN（对标 KVideo）
  // 浏览器 <video> 对媒体请求 CORS 豁免，无需经 /api/proxy 中转
  assert(hls.config.loader === undefined || hls.config.loader === null,
    'Hls 配置不注入自定义 proxy loader（直连 CDN 模式）');
  assert(hls.videoEl === fakeVideo, 'hls.attachMedia 收到 video 元素');
  assert(hls.loadedUrl === 'https://example.com/play/a.m3u8', 'hls.loadSource 使用原始地址（直连 CDN）');
  assert(playerState.prepared === true, 'player.prepareForPlay 被调用');
  assert(playerState.id === 'site1:7:3', '进度键使用显式 id（非 rawUrl）');
  assert(fakeVideo.played === true, 'MANIFEST_PARSED 后触发 play');

  // ---- C. makeProxyLoader 保留（供特殊部署场景选用，默认不使用）----
  console.log('--- C. makeProxyLoader 保留（可选） ---');
  var ProxyLoader = S.makeProxyLoader(FakeHls);
  FakeLoader.calls = [];
  var loader = new ProxyLoader({});
  var ctxObj = { url: 'https://cdn.other.com/seg/001.ts' };
  loader.load(ctxObj, {});
  assert(ctxObj.url === S.toProxyUrl('https://cdn.other.com/seg/001.ts'),
    '分片请求被重写为 /api/proxy?url=...（' + ctxObj.url + '）');
  assert(FakeLoader.calls.length === 1, '原始 loader.load 被调用一次');

  // ---- D. onPlayerClose 销毁 ----
  console.log('--- D. onPlayerClose 销毁 ---');
  var before = FakeHls.destroyed;
  S.onPlayerClose();
  assert(hls.destroyedFlag === true, 'close 时 hls.destroy() 被调用');
  assert(FakeHls.destroyed === before + 1, '销毁计数 +1');

  // ---- E. 错误恢复分支（MEDIA_ERROR 触发 recoverMediaError）----
  console.log('--- E. 错误恢复分支 ---');
  var hlsE = FakeHls.instances[0];
  hlsE.recovered = false;
  hlsE.recoverMediaError = function () { hlsE.recovered = true; };
  hlsE._fire('ERROR', null, { fatal: true, type: FakeHls.ErrorTypes.MEDIA_ERROR, details: 'x' });
  assert(hlsE.recovered === true, 'MEDIA_ERROR 触发 recoverMediaError');

  // NETWORK_ERROR 触发 startLoad
  var hlsE2 = FakeHls.instances[0];
  hlsE2.restarted = false;
  hlsE2.startLoad = function () { hlsE2.restarted = true; };
  hlsE2._fire('ERROR', null, { fatal: true, type: FakeHls.ErrorTypes.NETWORK_ERROR, details: 'y' });
  assert(hlsE2.restarted === true, 'NETWORK_ERROR 触发 startLoad');

  // ---- F. 原生 HLS（Safari）仍走 hls.js（统一路径，无 proxy loader）----
  console.log('--- F. 原生支持也走 hls.js ---');
  var r2 = S.resolve('https://example.com/b.m3u8');
  assert(r2.kind === 'hls', 'Safari 下仍识别为 hls');
  assert(S.nativeHlsSupported() === false, '本沙箱无法原生支持（canPlayType 空）→ 走 hls.js 路径');

  // ================================================================
  console.log('\n========================================');
  if (failed === 0) console.log('  HLS 接入测试: ' + passed + ' pass / 0 fail');
  else { console.log('  HLS 接入测试: ' + passed + ' pass / ' + failed + ' fail'); errors.forEach(function (e) { console.log('  ' + e); }); }
  console.log('========================================');
  process.exit(failed === 0 ? 0 : 1);
})().catch(function (e) {
  console.log('测试异常:', e && e.stack ? e.stack : e);
  process.exit(1);
});
