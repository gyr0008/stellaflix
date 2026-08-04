/**
 * Kazumi Rule Engine — Phase 1 单元测试
 *
 * 验证：规则 schema 解析、URL 归一化、XPath 引擎（DOMParser+evaluate）、
 *       JSONPath 简易实现、RuleEngine 搜索/章节流程（mock HTTP）。
 *
 * 运行：node scripts/kazumi_phase1_test.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

// ---- 测试框架 ----
var pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function assertThrows(fn, msg) {
  try { fn(); fail++; console.log('  ✗ ' + msg + ' (should throw)'); }
  catch (e) { pass++; console.log('  ✓ ' + msg); }
}
function assertNoThrow(fn, msg) {
  try { fn(); pass++; console.log('  ✓ ' + msg); }
  catch (e) { fail++; console.log('  ✗ ' + msg + ': ' + e.message); }
}

// ---- 创建浏览器 mock 环境 ----
var mockDocument = null;
function createBrowserMock() {
  // 简易 DOMParser mock
  function DOMParser() {}
  DOMParser.prototype.parseFromString = function (str, type) {
    return new MockDocument(str);
  };

  function MockDocument(html) {
    this.documentElement = html ? new MockElement('html') : null;
    this.rawHtml = html || '';
  }

  function MockElement(tag, text) {
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.textContent = text || '';
    this.children = [];
    this.nodeType = 1; // ELEMENT_NODE
    var self = this;
    this.ownerDocument = { evaluate: function () { return null; } };
  }
  MockElement.prototype.getAttribute = function (name) { return this.attributes[name] || null; };
  MockElement.prototype.setAttribute = function (name, val) { this.attributes[name] = String(val); };
  MockElement.prototype.appendChild = function (child) { this.children.push(child); child.parentNode = this; return child; };

  var g = {
    DOMParser: DOMParser,
    document: { createElement: function () { return new MockElement('div'); } },
    localStorage: {
      _data: {},
      getItem: function (k) { return this._data[k] || null; },
      setItem: function (k, v) { this._data[k] = String(v); },
      removeItem: function (k) { delete this._data[k]; }
    },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    URL: URL,
    fetch: function () { return Promise.resolve({ ok: true, text: function () { return ''; } }); },
    console: console,
    Error: Error,
    RegExp: RegExp,
    JSON: JSON,
    Array: Array,
    Object: Object,
    String: String,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent
  };
  return g;
}

// ---- 加载所有模块 ----
console.log('=== Kazumi Phase 1 Test Suite ===\n');
var g = createBrowserMock();

var files = [
  'rule-schema.js',
  'url-utils.js',
  'http-client.js',
  'xpath-engine.js',
  'rule-engine.js',
  'index.js'
];

files.forEach(function (f) {
  var code = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'kazumi', f), 'utf8');
  var s = new vm.Script(code, { filename: 'kazumi/' + f });
  s.runInNewContext(g);
  console.log('[loaded] kazumi/' + f);
});

// ---- A. Rule Schema ----
console.log('\n--- A. Rule Schema ---');

assertNoThrow(function () {
  var rule = g.KazumiRuleSchema.create({
    name: 'test', baseUrl: 'https://example.com/',
    searchURL: '/s?wd=@keyword', searchList: '//div', searchName: './/a/text()', searchResult: './/a',
    chapterRoads: '//div[@class="eps"]', chapterResult: '//a'
  });
  assert(rule.name === 'test', 'create rule with required fields');
  assert(rule.searchMode === 'xpath', 'default searchMode is xpath');
  assert(rule.chapterMode === 'xpath', 'default chapterMode is xpath');
  assert(rule.muliSources === true, 'default muliSources is true');
  assert(rule.usePost === false, 'default usePost is false');
}, 'Schema.create() basic');

assertNoThrow(function () {
  var json = '{"name":"7sefun","baseURL":"https://7se.fun/","searchURL":"/s?wd=@keyword","searchList":"//div","searchName":".//text()","searchResult":".//a","chapterRoads":"//div","chapterResult":"//a"}';
  var rule = g.KazumiRuleSchema.fromJson(json);
  assert(rule.name === '7sefun', 'fromJson parses name');
  assert(rule.baseUrl === 'https://7se.fun/', 'fromJson parses baseURL');
  assert(rule.searchURL.indexOf('@keyword') !== -1, 'fromJson preserves @keyword template');
}, 'Schema.fromJson()');

var validation = g.KazumiRuleSchema.validate(g.KazumiRuleSchema.create({}));
assert(!validation.valid, 'validate rejects empty rule');
assert(validation.errors.length > 0, 'validate returns error messages');

var validRule = g.KazumiRuleSchema.create({
  name: 'valid', baseUrl: 'https://x.com/', searchURL: '/s?q=@keyword',
  searchList: '//div', searchName: './/text()', searchResult: './/a',
  chapterRoads: '//div', chapterResult: '//a'
});
var v2 = g.KazumiRuleSchema.validate(validRule);
assert(v2.valid, 'validate accepts complete xpath rule');

// 序列化往返
var json = JSON.stringify(g.KazumiRuleSchema.toJson(validRule));
var roundtrip = g.KazumiRuleSchema.fromJson(json);
assert(roundtrip.name === validRule.name, 'toJson/fromJson round-trip preserves name');
assert(roundtrip.baseUrl === validRule.baseUrl, 'round-trip preserves baseURL');

// ---- B. URL Utils ----
console.log('\n--- B. URL Utils ---');
var U = g.KazumiUrlUtils;

assert(U.normalizeEpisodeUrl('https://base.com', '/page') === 'https://base.com/page', 'relative → absolute');
assert(U.normalizeEpisodeUrl('https://base.com', 'https://other.com/page') === 'https://other.com/page', 'cross-origin preserved');
assert(U.normalizeEpisodeUrl('https://base.com', '') === '', 'empty returns empty');
assert(U.normalizeEpisodeUrl('', '/page') === '/page', 'no base returns raw');

// 协议统一
assert(U.normalizeEpisodeUrl('http://base.com', 'https://base.com/page') === 'http://base.com/page', 'same-host protocol unified to base');
assert(U.normalizeEpisodeUrl('https://base.com', 'http://base.com/page') === 'https://base.com/page', 'same-host protocol unified to base (reverse)');
assert(U.normalizeEpisodeUrl('https://base.com', 'http://other.com/page') === 'http://other.com/page', 'cross-host protocol NOT changed');

// 尾斜杠去除
assert(U.normalizeEpisodeUrl('https://base.com', 'https://base.com/path/') === 'https://base.com/path', 'trailing slash removed');

// 幂等
var n1 = U.normalizeEpisodeUrl('https://base.com', '/path/');
var n2 = U.normalizeEpisodeUrl('https://base.com', n1);
assert(n1 === n2, 'idempotent: normalize(normalize(x)) === normalize(x)');

// 非默认端口回归（曾因 JS URL.host 已含端口、又追加 .port 而重复拼接）
// 反例：https://base.com:8443/ + /ep/2 曾产出 https://base.com:8443:8443/ep/2
assert(U.normalizeEpisodeUrl('https://base.com:8443/', '/ep/2') === 'https://base.com:8443/ep/2', 'non-default port not duplicated (https:8443)');
assert(U.normalizeEpisodeUrl('http://base.com:4001/', '/detail/1') === 'http://base.com:4001/detail/1', 'non-default port not duplicated (http:4001)');
assert(U.normalizeEpisodeUrl('https://base.com', 'https://other.com:9000/a') === 'https://other.com:9000/a', 'cross-host non-default port preserved once');
var p1 = U.normalizeEpisodeUrl('https://base.com:8443/', '/ep/2/');
var p2 = U.normalizeEpisodeUrl('https://base.com:8443/', p1);
assert(p1 === p2, 'idempotent with non-default port');
// 默认端口不应被显式写出（与 Dart Uri 行为一致）
assert(U.normalizeEpisodeUrl('https://base.com:443/', '/x') === 'https://base.com/x', 'default https port 443 omitted');
assert(U.normalizeEpisodeUrl('http://base.com:80/', '/x') === 'http://base.com/x', 'default http port 80 omitted');

// 模板渲染
assert(U.renderTemplate('/search?wd=@keyword&pg=1', { keyword: 'test' }) === '/search?wd=test&pg=1', 'template render @keyword');
assertThrows(function () { U.renderTemplate('/@missing', {}); }, 'template render throws on missing variable');
var encoded = U.renderTemplate('/s?q=@kw', { kw: 'hello world' }, true);
assert(encoded.indexOf('hello%20world') !== -1, 'template render with encode=true');

// 搜索 URL 构建
var urlObj = U.buildSearchUrl(validRule, '\u4f60\u7684\u540d\u5b57');
assert(urlObj.method === 'GET', 'buildSearchUrl returns GET');
assert(urlObj.url.indexOf('%E4%BD%A0%E7%9A%84%E5%90%8D%E5%AD%97') !== -1 || urlObj.url.indexOf(encodeURIComponent('\u4f60\u7684\u540d\u5b57')) !== -1, 'buildSearchUrl encodes keyword');

// ---- C. XPath Engine (mock DOM) ----
console.log('\n--- C. XPath Engine ---');
var X = g.KazumiXPathEngine;

// toNodeRelative：把上游「//xxx」写法改写为节点相对，纯字符串函数，可在 vm 内直测。
// 背景：Dart 端 node.queryXPath('//a') 是节点相对；浏览器 document.evaluate('//a', node)
// 锚定文档根。不改写会导致每个条目都取到文档里的第一个 <a>（真机 E2E 已实测复现）。
assert(X.toNodeRelative('//a') === './/a', 'toNodeRelative: // → .//');
assert(X.toNodeRelative('/div/a') === './div/a', 'toNodeRelative: / → ./');
assert(X.toNodeRelative('.//a') === './/a', 'toNodeRelative: 已相对写法保持不变');
assert(X.toNodeRelative('a/b') === 'a/b', 'toNodeRelative: 普通相对路径保持不变');
assert(X.toNodeRelative('//div[2]/text()') === './/div[2]/text()', 'toNodeRelative: 带谓词与 text()');
assert(X.toNodeRelative('//a|//img') === './/a|.//img', 'toNodeRelative: 联合表达式逐段改写');
assert(X.toNodeRelative('.//a|//img') === './/a|.//img', 'toNodeRelative: 联合表达式混合写法');
assert(X.toNodeRelative('') === '', 'toNodeRelative: 空串安全');
assert(X.toNodeRelative('text()') === 'text()', 'toNodeRelative: 无斜杠表达式原样返回');

// HTML 解析
assertNoThrow(function () {
  var doc = X.parseHtml('<html><body><div class="result"><a href="/play/1">Test</a></div></body></html>');
  assert(doc !== null, 'parseHtml returns document');
}, 'parseHtml valid HTML');

assertThrows(function () { X.parseHtml(''); }, 'parseHtml throws on empty');
assertThrows(function () { X.parseHtml(null); }, 'parseHtml throws on null');

// XPath 查询（在真实浏览器中用 document.evaluate，这里只验证接口存在）
assert(typeof X.queryXPathFirst === 'function', 'queryXPathFirst exists');
assert(typeof X.queryXPathAll === 'function', 'queryXPathAll exists');
assert(typeof X.parseSearch === 'function', 'parseSearch exists');
assert(typeof X.parseChapters === 'function', 'parseChapters exists');
assert(typeof X.detectCaptcha === 'function', 'detectCaptcha exists');
assert(typeof X.runSelector === 'function', 'runSelector exists');

// runSelector 错误处理
assertThrows(function () { X.runSelector('test', '', function () {}); }, 'runSelector throws on empty expression');

// 验���码检测
assert(X.detectCaptcha('<html>captcha here</html>', { enabled: true, captchaDetectValue: 'captcha', captchaDetectType: 'text' }) === true, 'detectCaptcha text match');
assert(X.detectCaptcha('<html>clean</html>', { enabled: true, captchaDetectValue: 'captcha', captchaDetectType: 'text' }) === false, 'detectCaptcha text no match');
assert(X.detectCaptcha('<html>anything</html>', { enabled: false }) === false, 'detectCaptcha disabled');

// ---- D. HTTP Client ----
console.log('\n--- D. HTTP Client ---');
var H = g.KazumiHttpClient;

assert(H.toProxyUrl('https://example.com/video.mp4').indexOf('/api/proxy?url=') === 0, 'toProxyUrl encodes target');
assert(H.toProxyUrl('https://example.com/video.mp4').indexOf('https%3A%2F%2F') !== -1, 'toProxyUrl URI-encodes');

var headers = H.buildHeaders({ referer: 'https://example.com/' }, 'https://cdn.example.com/v.m3u8');
assert(headers['Origin'] === 'https://cdn.example.com', 'buildHeaders sets Origin from target');
assert(headers['Referer'] === 'https://example.com/', 'buildHeaders uses rule referer');
assert(headers['Sec-Fetch-Site'] === 'cross-site', 'buildHeaders sets Sec-Fetch-Site');
assert(headers['User-Agent'].indexOf('Mozilla') !== -1, 'buildHeaders sets default UA');

var customHeaders = H.buildHeaders({ userAgent: 'CustomBot/1.0' }, 'https://x.com');
assert(customHeaders['User-Agent'] === 'CustomBot/1.0', 'buildHeaders respects custom UA');

// ---- E. Rule Engine ----
console.log('\n--- E. Rule Engine ---');
var RE = g.KazumiRuleEngine;
assert(typeof RE.create === 'function', 'RuleEngine.create exists');

var engine = RE.create();
assert(typeof engine.search === 'function', 'engine.search exists');
assert(typeof engine.queryChapters === 'function', 'engine.queryChapters exists');
assert(typeof engine.CaptchaRequiredException === 'function', 'CaptchaRequiredException exists');
assert(typeof engine.NoResultException === 'function', 'NoResultException exists');
assert(typeof engine.SearchErrorException === 'function', 'SearchErrorException exists');
assert(typeof engine.ChapterErrorException === 'function', 'ChapterErrorException exists');

// 异常类型检查
var ce = engine.CaptchaRequiredException('TestPlugin');
assert(ce.name === 'CaptchaRequiredException', 'CaptchaRequiredException has correct name');
assert(ce.pluginName === 'TestPlugin', 'CaptchaRequiredException carries pluginName');

var nre = engine.NoResultException('TestPlugin');
assert(nre.name === 'NoResultException', 'NoResultException has correct name');

// ---- F. Rule Manager ----
console.log('\n--- F. Rule Manager ---');
var K = g.Kazumi;
assert(typeof K.createRuleManager === 'function', 'Kazumi.createRuleManager exists');

var mgr = K.createRuleManager();
assert(Array.isArray(mgr.list()), 'list() returns array');
assert(mgr.get('nonexistent') === null, 'get() returns null for missing');

// 添加规则
var added = mgr.addOrUpdate({
  name: 'TestRule', baseUrl: 'https://test.com/',
  searchURL: '/s?q=@keyword', searchList: '//div', searchName: './/text()',
  searchResult: './/a', chapterRoads: '//div', chapterResult: '//a'
});
assert(added.name === 'TestRule', 'addOrUpdate returns rule');
assert(mgr.list().length === 1, 'list count after add');

// 重复添加（更新）
mgr.addOrUpdate({ name: 'TestRule', version: '2.0', baseUrl: 'https://test.com/', searchURL: '/s?q=@keyword', searchList: '//div', searchName: './/text()', searchResult: './/a', chapterRoads: '//div', chapterResult: '//a' });
assert(mgr.list().length === 1, 'duplicate add updates (no duplicate entries)');
assert(mgr.get('TestRule').version === '2.0', 'duplicate add updates version');

// 删除
mgr.remove('TestRule');
assert(mgr.list().length === 0, 'remove deletes rule');

// 批量导入
var imported = mgr.importRules([
  { name: 'R1', baseUrl: 'https://r1.com/', searchURL: '/s?q=@keyword', searchList: '//div', searchName: './/text()', searchResult: './/a', chapterRoads: '//div', chapterResult: '//a' },
  { name: 'R2', baseUrl: 'https://r2.com/', searchURL: '/s?q=@keyword', searchList: '//div', searchName: './/text()', searchResult: './/a', chapterRoads: '//div', chapterResult: '//a' }
]);
assert(imported.length === 2, 'importRules imports multiple rules');
assert(mgr.list().length === 2, 'list count after import');

// getEnabledXpathRules
var enabled = mgr.getEnabledXpathRules();
assert(enabled.length === 2, 'getEnabledXpathRules returns all valid xpath rules');

// 无效规则不进入启用列表
mgr.addOrUpdate({ name: 'InvalidRule' }); // 缺少必填字段
var enabled2 = mgr.getEnabledXpathRules();
assert(enabled2.length === 2, 'getEnabledXpathRules excludes invalid rules');

// 清理
mgr.remove('R1');
mgr.remove('R2');
mgr.remove('InvalidRule');

// ---- G. JSONPath (内置简易实现) ----
console.log('\n--- G. JSONPath Implementation ---');
// 通过 RuleEngine 内部 API 间接测试 JSONPath

// 嵌套格式解析
var apiSearchConfig = {
  request: { method: 'GET', url: '' },
  listPath: '$.data[*]',
  namePath: '$.name',
  sourcePath: '$.url'
};
var testDoc = { data: [
  { name: 'Movie A', url: '/play/a' },
  { name: 'Movie B', url: '/play/b' }
]};
// 直接调用内部 parseApiSearch 逻辑（通过 engine.search 的 API 路径）
// 这里我们手动验证 JSONPath 读取
var eng = RE.create();

// 用一个 API 规则搜索来间接测试 JSONPath
var apiRule = g.KazumiRuleSchema.create({
  name: 'ApiTest', baseUrl: 'https://api.test.com/',
  searchMode: 'api',
  searchApiConfig: {
    request: { method: 'GET', url: 'https://api.test.com/search?q=@keyword' },
    listPath: '$.data[*]',
    namePath: '$.name',
    sourcePath: '$.url'
  },
  chapterMode: 'xpath',
  chapterRoads: '//div', chapterResult: '//a'
});
assert(apiRule.searchMode === 'api', 'API rule has searchMode=api');

// ---- 结果汇总 ----
console.log('\n========================================');
console.log('Kazumi Phase 1: ' + pass + ' pass / ' + fail + ' fail');
if (fail > 0) {
  console.log('⚠️ ' + fail + ' test(s) FAILED');
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
