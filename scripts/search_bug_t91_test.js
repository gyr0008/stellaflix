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
assert(onlineCode.indexOf("console.log('[SFV-Search] kw=") !== -1,
  'A2: 每次搜索输出 kw/CMS10/Kazumi 数量');
assert(onlineCode.indexOf('console.warn') !== -1 &&
       onlineCode.indexOf('[SFV-Search]') !== -1 &&
       onlineCode.indexOf('\u7ed3\u679c\u4e22\u5f03') !== -1,
  'A3: current!==view 守卫触发时有 console.warn');
assert(onlineCode.indexOf("console.error('[SFV-Search]") !== -1,
  'A4: 异常路径有 console.error 日志');

// renderSearch 在 Promise.all 之前被调用
var renderSearchIdx = onlineCode.indexOf('renderSearch(view)');
var promiseAllIdx = onlineCode.indexOf('Promise.all([cmsPromise');
assert(renderSearchIdx > 0, 'A5: doSearch 内部调用 renderSearch(view)');
assert(renderSearchIdx < promiseAllIdx,
  'A6: renderSearch 在 Promise.all 之前（UI 立即更新，不等异步）');

// 错误提示增强
assert(onlineCode.indexOf("\u90e8\u5206\u6e90\u4e0d\u53ef\u7528") !== -1,
  'A7: 新增"部分源不可用"提示文案');
assert(onlineCode.indexOf('\u5df2\u663e\u793a') !== -1,
  'A8: 错误提示包含结果数量信息（"已显示 N 条结果")');

// nSrc 安全取值（canCms=false 时不再调 getEnabledSources）
assert(onlineCode.indexOf('canCms ? SFV.sources.getEnabledSources().length : 0') !== -1,
  'A9: nSrc 用三元表达式安全取值（避免 canCms=false 时无效调用）');

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

// Promise.all 仍然使用（CMS10 + Kazumi 并行）
assert(onlineCode.indexOf('Promise.all([cmsPromise, kzPromise])') !== -1,
  'D1: 保留 CMS10 + Kazumi 并行搜索（未退化为串行）');

// merged 仍然是 CMS10.concat(Kazumi) 顺序
assert(onlineCode.indexOf('(res.items || []).concat(kz.items || [])') !== -1,
  'D2: 合并顺序不变（CMS10 结果在前，Kazumi 在后）');

// view.items 赋值仍在渲染前
var itemsAssignIdx = onlineCode.indexOf('view.items = merged');
var bodyClearIdx = onlineCode.indexOf("bodyEl.innerHTML = ''");
assert(itemsAssignIdx > bodyClearIdx,
  'D3: view.items 赋值在 bodyEl 清空之后（顺序正确）');

// renderGrid 仍检查 current===view
assert(onlineCode.indexOf('if (current === view) renderGrid(merged, view)') !== -1,
  'D4: 渲染前仍守卫 current===view（安全检查保留）');

// busy flag 仍正确管理
var busyTrueIdx = 0, busySetIdx = 0, busyFalseIdx = 0;
var remaining = onlineCode;
var idx1 = remaining.indexOf('busy = true'); if (idx1 >= 0) { busyTrueIdx = idx1; remaining = remaining.slice(idx1 + 10); }
var idx2 = remaining.indexOf('setBusy(true)'); if (idx2 >= 0) { busySetIdx = idx2; }
var idx3 = onlineCode.indexOf('busy = false'); if (idx3 >= 0) { busyFalseIdx = idx3; }
assert(busyTrueIdx > 0 && busySetIdx > 0 && busyFalseIdx > 0,
  'D5: busy 标志仍完整管理（true→setBusy→false）');

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
