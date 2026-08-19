/*
 * FLV 播放接入测试（vm 沙箱）
 * 验证：resolve 识别 FLV(.flv)、open() 路由到 attachFlv、flv.js 经 /api/proxy 透传跨域、
 *       createPlayer 收到正确 MediaDataSource、attachMediaElement + play、onPlayerClose 销毁、
 *       不支持/库加载失败降级原生回退、边界（空值/非法 scheme/mp4 回归/跨域代理）。
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var passed = 0, failed = 0, errors = [];
function assert(cond, label) {
  if (cond) { passed++; return true; }
  failed++; errors.push('FAIL: ' + label); return false;
}

// ---- fake flv.js ----
function FakeFlvPlayer(ds, config) {
  this.ds = ds; this.config = config;
  FakeFlvPlayer.instances.push(this);
  this.handlers = {};
  this.attached = null;
  this.loaded = false;
}
FakeFlvPlayer.prototype.on = function (ev, cb) { this.handlers[ev] = cb; };
FakeFlvPlayer.prototype._fire = function (ev, arg) { if (this.handlers[ev]) this.handlers[ev](arg); };
FakeFlvPlayer.prototype.attachMediaElement = function (v) { this.attached = v; this._fire('METADATA_ARRIVED', {}); };
FakeFlvPlayer.prototype.load = function () { this.loaded = true; };
FakeFlvPlayer.prototype.play = function () { return { catch: function () {} }; };
FakeFlvPlayer.prototype.destroy = function () { FakeFlvPlayer.destroyed++; this.destroyedFlag = true; };

var FakeFlvjs = {
  isSupported: function () { return true; },
  Events: { ERROR: 'error', METADATA_ARRIVED: 'metadata_arrived' },
  createPlayer: function (ds, config) { return new FakeFlvPlayer(ds, config); },
};
function resetFlv() { FakeFlvPlayer.instances = []; FakeFlvPlayer.destroyed = 0; }

var flvjsErrorFired = [];
var toastMsgs = [];

// ---- fake video ----
var fakeVideo = {
  play: function () { fakeVideo.played = true; fakeVideo.paused = false; return { catch: function () {} }; },
  paused: false,
  addEventListener: function () {},
  removeEventListener: function () {},
  load: function () {},
  set src(v) { fakeVideo._src = v; },
  get src() { return fakeVideo._src; },
};

var playerState = { prepared: false, id: null, url: null, currentUrl: null };

var _store = {};
var g = {
  StellaflixVideo: {},
  flvjs: FakeFlvjs,
  console: { log: function () {}, warn: function () {}, error: function () {} },
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
      if (tag === 'video') return { canPlayType: function () { return ''; }, play: function () { return { catch: function () {} }; }, addEventListener: function () {} };
      if (tag === 'script') return { tagName: 'script', setAttribute: function () {}, appendChild: function () {}, style: {}, onload: null, onerror: null };
      return { tagName: tag, setAttribute: function () {}, appendChild: function () {}, style: {} };
    },
    // head.appendChild：对 script 节点触发 onerror（模拟库加载失败路径）
    head: {
      appendChild: function (node) {
        if (node && node.tagName === 'script' && typeof node.onerror === 'function') {
          setTimeout(function () { if (typeof node.onerror === 'function') node.onerror(); }, 0);
        }
      }
    },
    getElementById: function () { return null; },
    body: { appendChild: function () {} },
  },
  CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
  dispatchEvent: function () { return true; },
};
g.window = g; g.self = g; g.global = g;
g.StellaflixVideo.player = {
  getVideoEl: function () { return fakeVideo; },
  setCurrentUrl: function (u) { playerState.currentUrl = u; },
  prepareForPlay: function (id, title) { playerState.prepared = true; playerState.id = id; return true; },
};
g.StellaflixVideo.online = { toast: function (m) { toastMsgs.push(m); } };

var ctx = vm.createContext(g);
function load(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'video', file), 'utf8'), ctx, { filename: file }); }
load('source-adapter-core.js');
load('source-adapter.js');

var SFV = g.StellaflixVideo;
var S = SFV.source;

// ================================================================
console.log('--- A. resolve() 识别 FLV ---');
var r1 = S.resolve('https://example.com/play/a.flv');
assert(r1.ok === true, 'flv 解析 ok');
assert(r1.kind === 'flv', 'kind = flv');
assert(r1.rawUrl === 'https://example.com/play/a.flv', 'rawUrl 保留原始地址');
assert(r1.id === 'url:https://example.com/play/a.flv', '进度键回落 url: 原始地址');

console.log('--- A2. 跨域 FLV 走代理 ---');
var r2 = S.resolve('https://xlyun.example.com/video/xxx.flv');
assert(r2.ok === true, '跨域 flv 解析 ok');
assert(r2.kind === 'flv', 'kind = flv');
assert(r2.needsProxy === true, 'needsProxy = true（跨域）');
assert(r2.playUrl === S.toProxyUrl('https://xlyun.example.com/video/xxx.flv'),
  'playUrl 重写为 /api/proxy?url=...（' + r2.playUrl + '）');

console.log('--- A3. 边界：空值 / 非法 scheme / mp4 回归 ---');
var r3 = S.resolve('');
assert(r3.ok === false, '空输入 ok=false');
var r4 = S.resolve('ftp://host/a.flv');
assert(r4.ok === false, '非 http(s) scheme 被拒（ftp）');
var r5 = S.resolve('https://example.com/b.mp4');
assert(r5.ok === true && r5.kind === 'direct', 'mp4 仍走 direct（无回归）');
var r6 = S.resolve({});
assert(r6.ok === false, '对象无 url 被拒');

console.log('--- A4. isFlvUrl 工具 ---');
assert(S.isFlvUrl('https://x/a.flv') === true, 'isFlvUrl 真阳性');
assert(S.isFlvUrl('https://x/a.m3u8') === false, 'isFlvUrl 真阴性');

// ================================================================
console.log('--- B. open() 路由到 attachFlv（同源 app.local）---');
resetFlv();
toastMsgs = [];
(function () {
  var p = S.open({ url: 'https://app.local/play/a.flv', title: '测试片', id: 'site1:7:3' });
  assert(p && typeof p.then === 'function', 'open flv 返回 Promise');

  p.then(function () {
    assert(FakeFlvPlayer.instances.length === 1, '创建了 1 个 flv 播放器实例');
    var pl = FakeFlvPlayer.instances[0];
    assert(pl.ds && pl.ds.type === 'flv', 'MediaDataSource.type = flv');
    assert(pl.ds.url === 'https://app.local/play/a.flv', '同源 flv 用原始地址（无需代理）');
    assert(pl.attached === fakeVideo, 'attachMediaElement 收到 video 元素');
    assert(pl.loaded === true, 'player.load() 被调用');
    assert(fakeVideo.played === true, 'METADATA_ARRIVED 后触发 play');
    assert(playerState.prepared === true, 'player.prepareForPlay 被调用');
    assert(playerState.id === 'site1:7:3', '进度键使用显式 id');
    assert(playerState.currentUrl === 'https://app.local/play/a.flv', 'setCurrentUrl 设原始地址');

    // ---- C. 跨域 flv：createPlayer 收到代理地址 ----
    console.log('--- C. open() 跨域 flv 走代理 ---');
    resetFlv();
    var p2 = S.open({ url: 'https://xlyun.example.com/video/xxx.flv', title: 'xlyun', id: 'site2:9:1' });
    p2.then(function () {
      var pl2 = FakeFlvPlayer.instances[0];
      assert(pl2.ds.url === S.toProxyUrl('https://xlyun.example.com/video/xxx.flv'),
        '跨域 flv 经 /api/proxy 透传（' + pl2.ds.url + '）');

      // ---- D. onPlayerClose 销毁 activeFlv ----
      console.log('--- D. onPlayerClose 销毁 ---');
      var before = FakeFlvPlayer.destroyed;
      S.onPlayerClose();
      assert(FakeFlvPlayer.instances[0].destroyedFlag === true, 'close 时 flv.destroy() 被调用');
      assert(FakeFlvPlayer.destroyed === before + 1, '销毁计数 +1');

      // ---- E. flv.js 不支持 → 降级原生回退 + onError ----
      console.log('--- E. flv.js 不支持 → 原生回退 ---');
      FakeFlvjs.isSupported = function () { return false; };
      resetFlv();
      toastMsgs = [];
      var p3 = S.open({ url: 'https://example.com/c.flv', title: '不支持', id: 's:1:1' });
      p3.then(function () {
        assert(FakeFlvPlayer.instances.length === 0, '不支持时未创建 flv 实例');
        assert(toastMsgs.some(function (m) { return /FLV/.test(m); }), 'toast 给出 FLV 失败提示');

        // ---- F. 库加载失败（script onerror）→ 降级回退 ----
        console.log('--- F. 库加载失败 → 原生回退 ---');
        FakeFlvjs.isSupported = function () { return true; };
        g.flvjs = undefined; // 强制走 loadFlvLib 注入 script
        resetFlv();
        toastMsgs = [];
        var p4 = S.open({ url: 'https://example.com/d.flv', title: '库失败', id: 's:1:2' });
        p4.then(function () {
          assert(FakeFlvPlayer.instances.length === 0, '库加载失败时未创建 flv 实例（已回退）');

          // ================================================================
          console.log('\n========================================');
          if (failed === 0) console.log('  FLV 接入测试: ' + passed + ' pass / 0 fail');
          else { console.log('  FLV 接入测试: ' + passed + ' pass / ' + failed + ' fail'); errors.forEach(function (e) { console.log('  ' + e); }); }
          console.log('========================================');
          process.exit(failed === 0 ? 0 : 1);
        }).catch(function (e) { console.log('F 异常:', e && e.stack ? e.stack : e); process.exit(1); });
      }).catch(function (e) { console.log('E 异常:', e && e.stack ? e.stack : e); process.exit(1); });
    }).catch(function (e) { console.log('C/D 异常:', e && e.stack ? e.stack : e); process.exit(1); });
  }).catch(function (e) { console.log('B 异常:', e && e.stack ? e.stack : e); process.exit(1); });
})();
