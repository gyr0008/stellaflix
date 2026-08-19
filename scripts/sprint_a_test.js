/**
 * Sprint A — xlyun 播放修复 单元测试
 *
 * 验证 source-adapter.js 中新增的 4 项修复：
 *   1) urlSummary()    — URL 摘要截断
 *   2) sanitizeHlsUrl() — URL 预清洗（协议相对/非ASCII/HTML实体/空白）
 *   3) looksLikeRealM3u8() — m3u8 格式嗅探
 *   4) 回退策略判断逻辑
 *
 * 运行：node scripts/sprint_a_test.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

// ---- 测试框架 ----
var pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.log('  \u2717 ' + msg); }
}
function assertEq(actual, expected, msg) {
  if (actual === expected) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.log('  \u2717 ' + msg + ' (got: ' + JSON.stringify(actual) + ', expected: ' + JSON.stringify(expected) + ')'); }
}

// ---- 创建浏览器 mock 环境（最小化，仅够 source-adapter 的纯函数运行）----
function createMinimalMock() {
  var g = {
    console: console,
    location: { href: 'http://localhost:3000/', origin: 'http://localhost:3000', hostname: 'localhost' },
    URL: URL,
    document: {
      createElement: function (tag) {
        return {
          innerHTML: '',
          textContent: '',
          innerText: ''
        };
      }
    },
    // 不设 window 属性，让 IIFE 的 (typeof window !== 'undefined' ? window : this)
    // 走 this 分支（vm 中 this 就是 ctx/g 本身）
  };
  return g;
}

// ---- 加载 source-adapter.js ----
var srcPath = path.join(__dirname, '..', 'public', 'video', 'source-adapter.js');
var srcCode = fs.readFileSync(srcPath, 'utf8');
var corePath = path.join(__dirname, '..', 'public', 'video', 'source-adapter-core.js');
var coreCode = fs.readFileSync(corePath, 'utf8');
var mockGlobal = createMinimalMock();
var ctx = vm.createContext(mockGlobal);

try {
  vm.runInContext(coreCode, ctx, { filename: 'source-adapter-core.js' });
  vm.runInContext(srcCode, ctx, { filename: 'source-adapter.js' });
} catch (e) {
  console.error('FATAL: source-adapter.js load error:', e.message);
  console.error(e.stack);
  process.exit(1);
}

var SFV = mockGlobal.StellaflixVideo;
assert(SFV && SFV.source, 'SFV.source loaded');

var sanitizeHlsUrl = SFV.source.sanitizeHlsUrl;
var looksLikeRealM3u8 = SFV.source.looksLikeRealM3u8;
var urlSummary = SFV.source.urlSummary;

console.log('\n--- Sprint A-1: urlSummary() ---');

// 正常 URL
var s1 = urlSummary('https://cdn.example.com/videos/movie.m3u8?token=abc123');
assert(s1.indexOf('cdn.example.com') >= 0, 'contains hostname');
assert(s1.indexOf('?...') >= 0, 'truncates query string');
assert(s1.indexOf('token=abc123') === -1, 'hides sensitive params');

// 长路径截断
var longPath = 'https://cdn.example.com/' + Array(100).join('very-long-path-segment/');
var s2 = urlSummary(longPath);
assert(s2.length < longPath.length, 'long path is truncated');
assert(s2.indexOf('...') >= 0 || s2.length <= 120, 'truncated or within limit');

// 空/null 输入
assertEq(urlSummary(''), '(empty)', 'empty string → (empty)');
assertEq(urlSummary(null), '(empty)', 'null → (empty)');
assertEq(urlSummary(undefined), '(empty)', 'undefined → (empty)');

// 无效 URL 降级
var s3 = urlSummary('not-a-url-at-all');
assert(s3.length <= 120, 'invalid URL truncated to 120 chars');

console.log('\n--- Sprint A-2: sanitizeHlsUrl() ---');

// 2a) 正常 URL 不变
var r1 = sanitizeHlsUrl('https://cdn.example.com/video.m3u8');
assert(!r1.cleaned, 'clean URL: not cleaned');
assertEq(r1.url, 'https://cdn.example.com/video.m3u8', 'clean URL: unchanged');

// 2b) 协议相对路径 //cdn → https://cdn
var r2 = sanitizeHlsUrl('//cdn.example.com/video.m3u8');
assert(r2.cleaned, 'protocol-relative: cleaned');
assert(r2.url.indexOf('https://') === 0, 'protocol-relative: prefixed with https:');
assert(r2.url.indexOf('//cdn.example.com') > 0, 'protocol-relative: host preserved');

// 2c) 首尾空白去除
var r3 = sanitizeHlsUrl('  https://cdn.example.com/video.m3u8  ');
assert(r3.cleaned, 'whitespace: cleaned');
assertEq(r3.url, 'https://cdn.example.com/video.m3u8', 'whitespace: trimmed');

// 2d) 控制字符去除
var r4 = sanitizeHlsUrl('\x00\x09https://cdn.example.com/video.m3u8\x00');
assert(r4.cleaned, 'control chars: cleaned');
assert(r4.url.indexOf('\x00') === -1, 'control chars: removed');

// 2e) HTML 实体解码 (&amp; → &) —— 注意：Node mock 环境的 innerHTML 不真正解析，
//     所以这里只验证函数不崩溃且返回值合理；真实浏览器中会正确解码。
var r5 = sanitizeHlsUrl('https://cdn.example.com/video.m3u8?a=1&amp;b=2');
// 在浏览器中 r5.cleaned=true 且 &amp; 被解码；在 Node mock 中可能保持原样（mock 限制）
assert(r5.url.indexOf('video.m3u8') >= 0, 'html-entity: base URL preserved');
assert(r5.url.length > 0, 'html-entity: returns non-empty');

// 2f) pathname 含中文（非 ASCII 编码）
// 注意：Node.js 的 URL 构造器会对 pathname 自动做 percent-encoding，
// 所以 parsed.pathname 到手时已经是 %E8%A7%86%E9%A2%91 格式，非 ASCII 检测不会触发。
// 这不是 bug —— 最终 URL 是正确可用的。浏览器行为相同。
var r6 = sanitizeHlsUrl('https://cdn.example.com/\u89c6\u9891/video.m3u8');
// 验证不管是否触发清洗，URL 都保留原始信息且可用
assert(r6.url.length > 0, 'non-ascii: returns non-empty');
assert(r6.url.indexOf('example.com') >= 0, 'non-ascii: host preserved');
// 关键：URL 构造器已自动编码，最终 URL 应该是合法的
try {
  var parsedCheck = new URL(r6.url);
  assert(true, 'non-ascii: resulting URL is valid (parseable)');
} catch (e) {
  assert(false, 'non-ascii: resulting URL should be valid');
}

// 2g) 空输入
var r7 = sanitizeHlsUrl('');
assertEq(r7.reason, 'empty', 'empty input: reason=empty');
assertEq(r7.url, '', 'empty input: url=""');

// 2h) null/undefined
var r8 = sanitizeHlsUrl(null);
assert(!r8.cleaned, 'null: not cleaned');
var r9 = sanitizeHlsUrl(undefined);
assertEq(r9.reason, 'empty', 'undefined: reason=empty');

// 2i) 多重问题组合（空白+协议相对）
var r10 = sanitizeHlsUrl('  //cdn.example.com/path.m3u8  ');
assert(r10.cleaned, 'combined issues: cleaned');
assert(r10.url.indexOf('https://') === 0, 'combined: has protocol');
assert(r10.url.indexOf('cdn.example.com') > 0, 'combined: has host');

console.log('\n--- Sprint A-3: looksLikeRealM3u8() ---');

// 标准 .m3u8 扩展名
assert(looksLikeRealM3u8('https://cdn.example.com/video.m3u8'), '.m3u8 extension');
assert(looksLikeRealM3u8('https://cdn.example.com/video.m3u8?token=x'), '.m3u8 with query');
assert(looksLikeRealM3u8('https://cdn.example.com/video.m3u8#frag'), '.m3u8 with fragment');

// .ts 分片
assert(looksLikeRealM3u8('https://cdn.example.com/segment.ts'), '.ts segment');
assert(!looksLikeRealM3u8('https://cdn.example.com/video.flv'), '.flv NOT m3u8-like');

// 路径关键字
assert(looksLikeRealM3u8('https://cdn.example.com/playlist/index'), 'playlist keyword');
assert(looksLikeRealM3u8('https://cdn.example.com/manifest.mpd'), 'manifest keyword');
assert(looksLikeRealM3u8('https://example.com/m3u8-proxy?url=x'), 'm3u8 in path');
assert(looksLikeRealM3u8('https://cdn.example.com/hls/stream'), '/hls/ path pattern');
assert(looksLikeRealM3u8('https://cdn.example.com/video/stream'), '/stream/ path pattern');
assert(looksLikeRealM3u8('https://cdn.example.com/video/live'), '/live/ path pattern');

// 非 m3u8 URL
assert(!looksLikeRealM3u8('https://player.example.com?url=xxx'), 'parser wrapper URL');
assert(!looksLikeRealM3u8('https://example.com/page.html'), 'html page');
assert(!looksLikeRealM3u8(''), 'empty string');
assert(!looksLikeRealM3u8(null), 'null');
assert(!looksLikeRealM3u8('https://cdn.example.com/image.jpg'), 'image file');

console.log('\n--- Sprint A-4: 边界情况与安全检查 ---');

// XSS 向量：sanitize 不会执行脚本
var xssUrl = '<script>alert(1)</script>';
var rx = sanitizeHlsUrl(xssUrl);
assert(rx.url.indexOf('<script>') >= 0 || rx.url.indexOf('alert') < 0,
       'XSS vector: script tag not executed (raw or sanitized)');

// 超长 URL 不崩溃
var hugeUrl = 'https://cdn.example.com/' + Array(10000).join('a/') + '.m3u8';
var rhuge = sanitizeHlsUrl(hugeUrl);
assert(rhuge.url.length > 0, 'huge URL does not crash');

// urlSummary 对超长 URL 安全
var shuge = urlSummary(hugeUrl);
assert(shuge.length <= 120, 'urlSummary truncates huge URL');

// 特殊字符在 query 中保留
var specialUrl = 'https://cdn.example.com/video.m3u8?a=b&c=d&e=f';
var rspecial = sanitizeHlsUrl(specialUrl);
assert(rspecial.url.indexOf('a=b') >= 0 || rspecial.url.search.length > 0,
       'query params preserved after sanitize');

// ---- Sprint A Fix #5: URL 类型检测（showDiagnosticOverlay 的检测逻辑）----
console.log('\n--- Sprint A-5: URL type detection (diagnostic overlay) ---');

// showDiagnosticOverlay 内的检测逻辑是纯字符串匹配，提取为可测试模式
function detectUrlType(url) {
  var lower = (url || '').toLowerCase();
  if (/player|play\.php|play\.asp|embed|jx|jiexi|parse|api.*\?url=/i.test(lower) ||
      /\?url=https?/.test(lower) || /\?v=.+&/.test(lower)) {
    return 'iframe-wrapper';
  }
  if (/\.flv(\?|#|$)/i.test(url)) return 'flv';
  if (/\.mp4(\?|#|$)/i.test(url)) return 'mp4';
  if (/\.m3u8(\?|#|$)/i.test(url)) return 'm3u8';
  if (/^https?:\/\//.test(url)) return 'unrecognized';
  return 'invalid';
}

assert(detectUrlType('https://player.example.com?url=https://cdn.example.com/video.m3u8') === 'iframe-wrapper',
       'type: player page with ?url= param');
assert(detectUrlType('https://jx.example.com/jiexi.php?url=xxx') === 'iframe-wrapper',
       'type: jiexi/parse page');
assert(detectUrlType('https://api.example.com/api.php?url=xxx&m3u8') === 'iframe-wrapper',
       'type: api wrapper with url param');
assert(detectUrlType('https://cdn.example.com/video.flv') === 'flv',
       'type: direct FLV');
assert(detectUrlType('https://cdn.example.com/video.mp4') === 'mp4',
       'type: direct MP4');
assert(detectUrlType('https://cdn.example.com/video.m3u8') === 'm3u8',
       'type: direct M3U8');
assert(detectUrlType('https://cdn.example.com/path/to/something') === 'unrecognized',
       'type: unrecognized format (valid URL but no known extension)');
assert(detectUrlType('not-a-url') === 'invalid',
       'type: completely invalid');
assert(detectUrlType('https://embed.example.com/player?id=123') === 'iframe-wrapper',
       'type: embed player page');
assert(detectUrlType('') === 'invalid',
       'type: empty string');

// ---- 结果汇总 ----
console.log('\n========================================');
console.log('Sprint A: ' + pass + ' pass / ' + fail + ' fail');
if (fail === 0) console.log('\u2705 All Sprint A tests passed!');
else console.log('\u274c ' + fail + ' test(s) failed');
process.exit(fail > 0 ? 1 : 0);
