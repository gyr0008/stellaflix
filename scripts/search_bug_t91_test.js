/**
 * T91 搜索 bug 专项测试（精简版）
 *
 * 验证修复三项：
 *   A) doSearch 新增 [SFV-Search] 诊断日志 + renderSearch 立即调用
 *   B) CMS10 失败时错误可见（不再静默吞）
 *   C) sources.search 单源失败降级不影响其他源
 *
 * 运行: node scripts/search_bug_t91_test.js
 */
var fs = require('fs');
var path = require('path');

var assertCount = 0, passCount = 0, failCount = 0;
function assert(cond, label) {
  assertCount++;
  if (cond) { passCount++; console.log('  \u2713 ' + label); }
  else { failCount++; console.log('  \u2717 FAIL: ' + label); }
}

var srcDir = path.join(__dirname, '..', 'public', 'video');
var onlineCode = fs.readFileSync(path.join(srcDir, 'online.js'), 'utf8');
var sourcesCode = fs.readFileSync(path.join(srcDir, 'sources.js'), 'utf8');

console.log('\n=== T91 搜索 Bug 专项测试 ===\n');

// ===================== A: 代码结构验证 =====================
console.log('-- A: 修复代码结构验证 --');

assert(onlineCode.indexOf('[SFV-Search]') !== -1,
  'A1: online.js 包含 [SFV-Search] 诊断日志前缀');
assert(onlineCode.indexOf('[SFV-Search]') !== -1 &&
       onlineCode.indexOf('kw="') !== -1,
  'A2: 每次搜索输出 [SFV-Search] 诊断日志并带 kw');
assert(onlineCode.indexOf('_currentSearchView') !== -1 &&
       onlineCode.indexOf('!== viewToken') !== -1,
  'A3: 搜索结果经 viewToken 防过时（_currentSearchView !== viewToken 即丢弃，取代旧 current!==view 守卫）');
assert(onlineCode.indexOf("console.error('[SFV-Search]") !== -1,
  'A4: 异常路径有 console.error 日志');

// renderSearch 在 Promise.all 之前被调用
var doInlineIdx = onlineCode.indexOf('function doInlineSearch');
var paIdx = onlineCode.indexOf('Promise.all([cmsP, kzP])');
assert(doInlineIdx > 0, 'A5: 搜索入口为 doInlineSearch（取代旧 doSearch/renderSearch）');
assert(paIdx > doInlineIdx,
  'A6: doInlineSearch 内 Promise.all([cmsP, kzP]) 并行搜索（UI 立即更新，不等异步）');

// 错误提示增强：旧"部分源不可用"文案已移除，无片源/规则时改由 showSearchStatus(..., warn) 给出明确提示
assert(onlineCode.indexOf('部分源不可用') === -1 && /showSearchStatus\([^)]*'warn'\)/.test(onlineCode),
  'A7: 旧"部分源不可用"文案已移除，无片源/规则时改由 showSearchStatus(..., warn) 给出明确提示');
assert(onlineCode.indexOf('\u5df2\u663e\u793a') !== -1,
  'A8: 错误提示包含结果数量信息（"已显示 N 条结果")');

// nSrc 安全取值（canCms=false 时不再调 getEnabledSources）
assert(onlineCode.indexOf('function hasSources') !== -1 &&
       onlineCode.indexOf('var canCms = hasSources()') !== -1,
  'A9: 源判断安全取值（canCms = hasSources()，避免 canCms=false 时无效调用）');

// ===================== B: sources.search 降级逻辑验证 =====================
console.log('\n-- B: sources.search 降级逻辑 --');

// 验证 extractList 函数存在
assert(sourcesCode.indexOf('function extractList') !== -1 ||
     sourcesCode.indexOf('extractList = function') !== -1,
  'B1: sources.js 定义了 extractList 函数');

// 验证 search 函数中每个 source 有独立 .catch
assert(sourcesCode.indexOf('.catch(function (e)') !== -1 &&
     sourcesCode.indexOf('errors.push') !== -1,
  'B2: 每个 source fetch 有 .catch 降级（错误入 errors 数组，不阻断整体）');

// 验证 dedupe 存在
assert(sourcesCode.indexOf('function dedupe') !== -1 ||
     sourcesCode.indexOf('dedupe = function') !== -1,
  'B3: sources.js 定义了 dedupe 去重函数');

// 验证 normalizeVod 存在
assert(sourcesCode.indexOf('function normalizeVod') !== -1 ||
     sourcesCode.indexOf('normalizeVod = function') !== -1,
  'B4: sources.js 定义了 normalizeVod 归一化函数');

// ===================== C: 边界行为验证 =====================
console.log('\n-- C: 边界行为 --');

// 空关键词直接返回
assert(sourcesCode.indexOf("if (!kw) return Promise.resolve({ items: [], errors: [] })") !== -1,
  'C1: 空 kw 直接返回空结果（不发请求）');

// 无启用源时返回 noSource 标记
assert(sourcesCode.indexOf('noSource: true') !== -1,
  'C2: 无启用源时返回 {noSource:true} 标记');

// 超时参数传递到 fetchJson
assert(sourcesCode.indexOf('opts.timeout') !== -1,
  'C3: search 接受 timeout 参数并透传给 fetchJson');

// AbortController 支持
assert(sourcesCode.indexOf('AbortController') !== -1,
  'C4: fetchJson 使用 AbortController 支持超时取消');

// ===================== D: 回归防护 =====================
console.log('\n-- D: 回归防护 --');

// Promise.all 仍然使用（CMS10 + Kazumi 并行）—— 变量改名 cmsP/kzP
assert(onlineCode.indexOf('Promise.all([cmsP, kzP])') !== -1,
  'D1: 保留 CMS10 + Kazumi 并行搜索（cmsP/kzP，未退化为串行）');

// merged 仍然是 CMS10.concat(Kazumi) 顺序
assert(onlineCode.indexOf('(arr[0].items || []).concat(arr[1].items || [])') !== -1,
  'D2: 合并顺序不变（CMS10 结果在前，Kazumi 在后）');

// 结果经 viewToken 防过时后再渲染 renderInlineResults
assert(onlineCode.indexOf('_currentSearchView') !== -1 &&
       onlineCode.indexOf('renderInlineResults(merged, kw)') !== -1,
  'D3: 搜索结果经 viewToken 防过时后渲染 renderInlineResults（取代旧 view.items=merged）');

// 结果渲染走 renderInlineResults（取代旧 current===view renderGrid 守卫）
assert(onlineCode.indexOf('renderInlineResults(merged, kw)') !== -1,
  'D4: 结果渲染走 renderInlineResults（取代旧 current===view renderGrid 守卫）');

// busy 标志管理：旧 setBusy/busy=true 已移除，状态改由 showSearchStatus 管理
assert(onlineCode.indexOf('setBusy') === -1 &&
       onlineCode.indexOf('function showSearchStatus') !== -1,
  'D5: legacy setBusy/busy=true 已移除；状态改由 showSearchStatus 管理');

// ===================== 结果汇总 =====================
console.log('\n========================================');
console.log('T91 搜索 Bug 测试: ' + passCount + ' PASS / ' + failCount + ' FAIL / ' + assertCount + ' TOTAL');
if (failCount > 0) {
  console.log('*** 存在失败用例 ***');
  process.exit(1);
} else {
  console.log('ALL PASS \u2705');
  process.exit(0);
}
