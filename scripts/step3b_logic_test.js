/*
 * Step 3b 逻辑测试：vm 沙箱加载 public/video/source-adapter.js 真实源码，
 * 断言三源归一化（local / direct / hls）、同源与跨域代理判定、HLS 原生支持分支、
 * 非法输入拒绝、以及 open() 对 player 的委派与进度键锚定。
 * 不依赖浏览器，不依赖 node_modules。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; console.log('  FAIL: ' + msg); }
}

const SRC = path.join(__dirname, '..', 'public', 'video', 'source-adapter.js');
const code = fs.readFileSync(SRC, 'utf8');

/**
 * 构建沙箱。hlsNative 控制 video.canPlayType 是否宣称支持 HLS。
 */
function makeSandbox(hlsNative) {
  const calls = [];
  const sandbox = {
    console: { warn: () => {}, error: () => {}, log: () => {} },
    URL: URL,
    File: function File() {},
    Blob: function Blob() {},
    location: { href: 'http://127.0.0.1:7879/index.html', origin: 'http://127.0.0.1:7879' },
    document: {
      createElement(tag) {
        if (tag === 'video') {
          return { canPlayType: () => (hlsNative ? 'maybe' : '') };
        }
        return {};
      },
    },
    _calls: calls,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'source-adapter.js' });
  // 注入假 player，记录委派
  sandbox.StellaflixVideo.player = {
    openFile(f) { calls.push({ fn: 'openFile', file: f }); return true; },
    openUrl(u, o) { calls.push({ fn: 'openUrl', url: u, opts: o }); return true; },
  };
  return sandbox;
}

console.log('=== Step 3b: source-adapter 逻辑测试 ===\n');

const sb = makeSandbox(false);
const SFV = sb.StellaflixVideo;
assert(!!SFV.source, 'SFV.source 已注册');
assert(typeof SFV.source.resolve === 'function', 'resolve 是函数');

// ---- 非法输入 ----
console.log('\n[非法输入]');
let r = SFV.source.resolve(null);
assert(r.ok === false && r.reason === 'empty-input', 'null → empty-input');
r = SFV.source.resolve('');
assert(r.ok === false && r.reason === 'empty-input', '空串 → empty-input');
r = SFV.source.resolve('   ');
assert(r.ok === false && r.reason === 'empty-url', '纯空白 → empty-url');
r = SFV.source.resolve(12345);
assert(r.ok === false && r.reason === 'unsupported-input-type', '数字 → unsupported-input-type');
r = SFV.source.resolve('ftp://example.com/a.mp4');
assert(r.ok === false && /unsupported-scheme/.test(r.reason), 'ftp:// → unsupported-scheme');
r = SFV.source.resolve({ url: '' });
assert(r.ok === false && r.reason === 'empty-url', '{url:""} → empty-url');

// ---- 本地文件 ----
console.log('\n[本地来源]');
const fakeFile = { name: 'movie.mkv', path: 'D:/media/movie.mkv', size: 100 };
r = SFV.source.resolve(fakeFile);
assert(r.ok && r.kind === 'local', 'File-like → kind=local');
assert(r.file === fakeFile, 'file 引用透传');
assert(r.title === 'movie.mkv', 'title 取文件名');
assert(r.needsProxy === false, '本地不走代理');

r = SFV.source.resolve('blob:http://127.0.0.1:7879/abc-123');
assert(r.ok && r.kind === 'local', 'blob: → kind=local');
assert(r.playUrl === 'blob:http://127.0.0.1:7879/abc-123', 'blob: playUrl 原样');
assert(r.needsProxy === false, 'blob: 不走代理');

r = SFV.source.resolve('file:///D:/media/a.mp4');
assert(r.ok && r.kind === 'local' && r.needsProxy === false, 'file:// → local 且不代理');

// ---- 同源直链 ----
console.log('\n[同源直链]');
r = SFV.source.resolve('http://127.0.0.1:7879/media/a.mp4');
assert(r.ok && r.kind === 'direct', '同源 mp4 → direct');
assert(r.needsProxy === false, '同源不需要代理');
assert(r.playUrl === 'http://127.0.0.1:7879/media/a.mp4', '同源 playUrl 即原 URL');
assert(r.title === 'a.mp4', 'title 取 basename');

// ---- 跨域直链 ----
console.log('\n[跨域直链走代理]');
const cross = 'https://cdn.example.com/v/ep01.mp4?sign=abc%20def';
r = SFV.source.resolve(cross);
assert(r.ok && r.kind === 'direct', '跨域 mp4 → direct');
assert(r.needsProxy === true, '跨域需要代理');
assert(r.playUrl.indexOf('/api/proxy?url=') === 0, 'playUrl 指向 /api/proxy');
const decoded = decodeURIComponent(r.playUrl.slice('/api/proxy?url='.length));
assert(decoded === new URL(cross).href, '代理参数可无损还原原始 URL');
assert(r.rawUrl === new URL(cross).href, 'rawUrl 保留原始地址');

// 无扩展名直链不阻断
r = SFV.source.resolve('https://pan.example.com/download/xyz789');
assert(r.ok === true && r.kind === 'direct', '无扩展名直链仍放行');
assert(r.reason === 'unknown-extension', '标记 unknown-extension 供调用方参考');

// ---- HLS ----
console.log('\n[HLS 识别]');
r = SFV.source.resolve('https://cdn.example.com/live/stream.m3u8');
assert(r.ok && r.kind === 'hls', '.m3u8 → kind=hls');
assert(r.requiresHlsLib === true, '无原生支持时标记 requiresHlsLib');
assert(r.reason === 'hls-needs-lib', 'reason=hls-needs-lib');
assert(r.needsProxy === true, '跨域 HLS 同样走代理');

r = SFV.source.resolve('https://cdn.example.com/live/stream.m3u8?token=1');
assert(r.ok && r.kind === 'hls', '带 query 的 .m3u8 仍识别为 hls');

const sbHls = makeSandbox(true);
const r2 = sbHls.StellaflixVideo.source.resolve('https://cdn.example.com/a.m3u8');
assert(r2.kind === 'hls' && r2.requiresHlsLib === false, '原生支持 HLS 时不要求 hls.js');
assert(sbHls.StellaflixVideo.source.nativeHlsSupported() === true, 'nativeHlsSupported 反映能力');
assert(SFV.source.nativeHlsSupported() === false, '不支持环境返回 false');

// ---- 对象输入 / title 覆盖 ----
console.log('\n[对象输入]');
r = SFV.source.resolve({ url: 'https://cdn.example.com/x.mp4', title: '自定义标题' });
assert(r.ok && r.title === '自定义标题', '{url,title} 的 title 优先');

// ---- toProxyUrl ----
console.log('\n[toProxyUrl]');
const p = SFV.source.toProxyUrl('https://a.com/b c.mp4?x=1&y=2');
assert(p === '/api/proxy?url=' + encodeURIComponent('https://a.com/b c.mp4?x=1&y=2'), 'toProxyUrl 完整编码(含 & 与空格)');
assert(p.indexOf('&y=2') === -1, '原始 & 已编码，不会截断代理参数');

// ---- open() 委派 ----
console.log('\n[open 委派]');
const okLocal = SFV.source.open(fakeFile);
assert(okLocal === true, 'open(local) 返回 true');
assert(sb._calls[0].fn === 'openFile' && sb._calls[0].file === fakeFile, 'local 委派 player.openFile');

SFV.source.open(cross);
const c1 = sb._calls[1];
assert(c1.fn === 'openUrl', '跨域委派 player.openUrl');
assert(c1.url.indexOf('/api/proxy?url=') === 0, '传给 player 的是代理 URL');
assert(c1.opts && c1.opts.id === 'url:' + new URL(cross).href, '进度键锚定原始 URL 而非代理 URL');
assert(c1.opts.title === 'ep01.mp4', '标题透传');

const bad = SFV.source.open('ftp://x.com/a.mp4');
assert(bad === false, 'open(非法) 返回 false');
assert(sb._calls.length === 2, '非法输入不产生 player 调用');

// player 缺失时的降级
const sbNoPlayer = makeSandbox(false);
delete sbNoPlayer.StellaflixVideo.player;
assert(sbNoPlayer.StellaflixVideo.source.open('https://a.com/x.mp4') === false, 'player 未就绪时安全返回 false');

// ---- 合规：不得内置任何片源 ----
console.log('\n[合规检查]');
// 注意：注释里出现「api_site」是合规声明文字，不算内置片源。
// 因此只禁止其作为「数据定义」出现（键名 / 赋值 / 字面量）。
assert(!/['"]api_?site['"]/i.test(code), '源码不含 api_site 键名字面量');
assert(!/\bapi_?site\s*[:=]/i.test(code), '源码不含 api_site 赋值/键值定义');
const urlLiterals = code.match(/https?:\/\/[^\s'"`)]+/g) || [];
assert(urlLiterals.length === 0, '源码不含任何硬编码 http(s) 片源地址');

console.log('\n=== Step 3b 逻辑测试: ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
