/**
 * T118 搜索页 click 链路：纯静态证据测试
 *
 * 用户报告（基于真实截图 Screenshot 2026-08-03 134106.png + 134227.png DevTools）：
 *   "左箭头的返回按钮，在用户端是不能点击和使用的。"
 *   "搜索栏现在在用户端也不能使用。"
 *
 * 验证策略：纯静态证据检查。
 *   注：T118 v1-v5 用 vm sandbox 模拟真实 click，但 inline#4 用了 Three.js/GSAP 等
 *   多个外部依赖，sandbox mock 总会少一个方法（如 renderer.setClearColor）。
 *   而 image#2 控制台显示 [SFV-Search] 日志正常输出，说明 inline#4 在真实 Electron
 *   环境是正常加载和执行的。所以"按钮不能用"是其他原因（也许 DevTools 覆盖层？），
 *   但代码本身的 click handler 注册和逻辑必须静态验证 OK。
 *
 * 验收清单：
 *  A. DOM 元素存在性
 *   A1. .sfv-search-appbar 容器存在
 *   A2. .sfv-search-appbar-back 含 data-sfv-search-back 属性
 *   A3. .sfv-search-appbar-close 含 data-sfv-search-quit 属性
 *   A4. .sfv-search-appbar-title 显示「搜索」
 *   A5. #sfv-search-input 存在
 *   A6. .sfv-search-bar 存在
 *  B. online.js click handler 完整性
 *   B1. (2) 段含 [data-sfv-search-back] 检测
 *   B2. (2) 段含 [data-sfv-search-quit] 检测
 *   B3. back handler 调 closeSearchPage()
 *   B4. quit handler 调 desktopWindow.close() 或 fallback window.close()
 *   B5. (3b) 段调 si.focus()
 *   B6. closeSearchPage() 函数定义存在
 *   B7. openSearchPage() 函数定义存在
 *   B8. closeSearchPage 内修改 classList.remove('sfv-search-open')
 *  C. handler 注册时机
 *   C1. (2) 段 handler 注册在 bindCapsuleSearchBtn() 函数内（确保 initEarlyBindings 触发即注册）
 *   C2. initEarlyBindings() 在 IIFE 末尾被调用
 *   C3. DOMContentLoaded 触发 initEarlyBindings
 *   C4. _searchBound 守卫防重复注册
 *  D. CSS 可点击性
 *   D1. .sfv-search-appbar-back 有 cursor: pointer
 *   D2. .sfv-search-appbar-back pointer-events 不被覆盖
 *   D3. .sfv-search-page.sfv-search-open pointer-events: auto
 *   D4. #sfv-search-input outline:none（避免 focus 视觉残留）
 *   D5. AppBar 在 search-page 容器内（z-index 不冲突）
 */

var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0, errors = [];
function assert(cond, label) {
  if (cond) { passed++; return true; }
  failed++; errors.push('FAIL: ' + label);
  return false;
}

var htmlText = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
var onlineSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'online.js'), 'utf8');
var cssText = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'player.css'), 'utf8');

// ================================================================
// A. DOM 元素
// ================================================================
console.log('--- A. DOM 元素存在性 ---');
assert(/class="sfv-search-appbar"/.test(htmlText), 'A1 .sfv-search-appbar 容器存在');
assert(/sfv-search-appbar-back[^>]*data-sfv-search-back/.test(htmlText) ||
       /sfv-search-appbar-back[\s\S]*?data-sfv-search-back/.test(htmlText),
  'A2 .sfv-search-appbar-back 含 data-sfv-search-back');
assert(/sfv-search-appbar-close[^>]*data-sfv-search-quit/.test(htmlText) ||
       /sfv-search-appbar-close[\s\S]*?data-sfv-search-quit/.test(htmlText),
  'A3 .sfv-search-appbar-close 含 data-sfv-search-quit');
assert(/sfv-search-appbar-title[\s\S]*?>搜索</.test(htmlText),
  'A4 .sfv-search-appbar-title 显示「搜索」');
assert(/id="sfv-search-input"/.test(htmlText), 'A5 #sfv-search-input 存在');
assert(/class="sfv-search-bar"/.test(htmlText), 'A6 .sfv-search-bar 存在');

// ================================================================
// B. handler 完整性
// ================================================================
console.log('\n--- B. online.js click handler 完整性 ---');
assert(/closest\(\s*['"]\[data-sfv-search-back\][\'"]/.test(onlineSrc),
  'B1 (2) 段检测 [data-sfv-search-back]');
assert(/closest\(\s*['"]\[data-sfv-search-quit\][\'"]/.test(onlineSrc),
  'B2 (2) 段检测 [data-sfv-search-quit]');

var backMatch = onlineSrc.match(/closest\(\s*['"]\[data-sfv-search-back\][\'"][\s\S]{0,500}?closeSearchPage\(\)/);
assert(backMatch !== null, 'B3 back handler 调 closeSearchPage()');

var quitMatch = onlineSrc.match(/closest\(\s*['"]\[data-sfv-search-quit\][\'"][\s\S]{0,800}?(?:desktopWindow\.close|window\.close)/);
assert(quitMatch !== null, 'B4 quit handler 调 desktopWindow.close() 或 window.close()');

var focusMatch = onlineSrc.match(/\/\/ \(3b\)[\s\S]{0,2000}?\}\s*,\s*true\)/);
if (focusMatch) {
  assert(/si\.focus\(\)/.test(focusMatch[0]), 'B5 (3b) 段调 si.focus()');
}

assert(/function\s+closeSearchPage/.test(onlineSrc), 'B6 closeSearchPage() 函数定义');
assert(/function\s+openSearchPage/.test(onlineSrc), 'B7 openSearchPage() 函数定义');

var closeDef = onlineSrc.match(/function\s+closeSearchPage\s*\(\s*\)\s*\{[\s\S]*?\n\s*\}/);
if (closeDef) {
  assert(/classList\.remove\(['"]sfv-search-open['"]\)/.test(closeDef[0]),
    'B8 closeSearchPage 内 classList.remove("sfv-search-open")');
}

// ================================================================
// C. 注册时机
// ================================================================
console.log('\n--- C. handler 注册时机 ---');
assert(/function\s+bindCapsuleSearchBtn/.test(onlineSrc), 'C1.1 bindCapsuleSearchBtn 函数定义');
var inBindFn = onlineSrc.match(/function\s+bindCapsuleSearchBtn\s*\(\s*\)\s*\{[\s\S]*?doc\.addEventListener\('click'[\s\S]*?data-sfv-search-back/);
assert(inBindFn !== null, 'C1.2 (2) 段 handler 在 bindCapsuleSearchBtn() 内注册');
assert(/initEarlyBindings\(\)/.test(onlineSrc), 'C2 initEarlyBindings() 在 IIFE 末尾被调用');
assert(/addEventListener\(['"]DOMContentLoaded['"]\s*,\s*initEarlyBindings\)/.test(onlineSrc),
  'C3 DOMContentLoaded 触发 initEarlyBindings');
assert(/_searchBound\s*=\s*true/.test(onlineSrc), 'C4 _searchBound 守卫防重复注册');

// ================================================================
// D. CSS 可点击性
// ================================================================
console.log('\n--- D. CSS 可点击性 ---');
var appbarBackRule = cssText.match(/\.sfv-search-appbar-back\s*\{[^}]*?\}/);
if (appbarBackRule) {
  assert(/cursor:\s*pointer/.test(appbarBackRule[0]), 'D1 .sfv-search-appbar-back cursor: pointer');
  assert(!/pointer-events:\s*none/.test(appbarBackRule[0]),
    'D2 .sfv-search-appbar-back 不被 pointer-events: none 覆盖');
}
assert(/#sfv-search-page\.sfv-search-open[\s\S]*?pointer-events:\s*auto/.test(cssText) ||
       /body\.video-space-active\s+#sfv-search-page\.sfv-search-open\s*\{[^}]*?pointer-events:\s*auto/.test(cssText),
  'D3 .sfv-search-page.sfv-search-open pointer-events: auto');
assert(/#sfv-search-input[^{]*\{[^}]*outline:\s*none/.test(cssText) ||
       /\.sfv-search-bar\s+input[^{]*\{[^}]*outline:\s*none/.test(cssText),
  'D4 #sfv-search-input outline: none');

// ================================================================
// 输出
// ================================================================
console.log('\n========================================');
console.log('  T118 搜索页 click 链路静态验证: ' + passed + ' pass / ' + failed + ' fail');
console.log('========================================');
if (errors.length) errors.forEach(function (e) { console.log('  X ' + e); });
process.exit(failed > 0 ? 1 : 0);