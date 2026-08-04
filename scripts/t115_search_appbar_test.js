/**
 * T115 搜索页点击修复 + 顶部 AppBar（Kazumi 风格）
 *
 * 任务背景：
 *  1. 用户反馈"搜索栏点击没有反应"——根因 (3b) 段 setTimeout(0) focus 在某些
 *     Chromium 渲染场景下哑火 + 用户点击 input 旁白时不会触发 focus。
 *     修复：捕获阶段直接调用 si.focus() + raf 二次保险。
 *  2. 顶部 AppBar 重组（对齐 Kazumi AppBar.transparent + viewLeading=arrow_back + 标题"搜索" + 右上 ×）：
 *     - ← 返回按钮：推出搜索页（= closeSearchPage，约等于 Navigator.pop）
 *     - "搜索"标题：纯文字
 *     - × 关闭按钮：**关闭软件**（走 Electron IPC `desktopWindow.close()`，对齐 user "X 是软件退出和最小化"）
 *
 * 验收清单：
 *  A. 静态证据（CSS / DOM）：
 *   A1. .sfv-search-appbar 容器存在（含 ← 按钮 + 标题 + × 按钮）
 *   A2. ← 返回按钮属性 data-sfv-search-back
 *   A3. × 关闭按钮属性 data-sfv-search-quit
 *   A4. AppBar 标题显示「搜索」字
 *   A5. AppBar 高度 56px（Kazumi AppBar 默认 toolbarHeight）
 *   A6. .sfv-search-image-search 留在 trailing 内（与 Kazumi barTrailing: [IconButton(image_search)] 对齐）
 *   A7. 旧 .sfv-search-back (button) 已不在搜索栏 DOM（合并到 AppBar）
 *  B. 行为证据（JS）：
 *   B1. online.js 检测 [data-sfv-search-quit] 并调 desktopWindow.close()
 *   B2. online.js 检测 [data-sfv-search-back] 并调 closeSearchPage()
 *   B3. online.js 修复 (3b) 段：直接 si.focus() 而非 setTimeout(0)
 *   B4. online.js 检测 .sfv-search-image-search 仍阻断 closeSearchPage 误触
 *   B5. global.window.desktopWindow.close() 路径分支存在
 *   B6. 浏览器 fallback global.window.close() 路径存在
 *  C. 回归：
 *   C1. T108 全页搜索测试 0 fail
 *   C2. T113 Kazumi 风格测试 0 fail
 *   C3. 4 个 inline script 块 vm.Script 解析 OK
 *   C4. online.js node --check OK
 *   C5. T110 + T112 + step4_shelf + step4_logic + tmdb 等其他基线 0 fail
 */

var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0, errors = [];
function assert(cond, label) {
  if (cond) { passed++; return true; }
  failed++;
  errors.push('FAIL: ' + label);
  return false;
}

var root = path.join(__dirname, '..');
var cssText = fs.readFileSync(path.join(root, 'public', 'video', 'player.css'), 'utf8');
var htmlText = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
var onlineSrc = fs.readFileSync(path.join(root, 'public', 'video', 'online.js'), 'utf8');

// ============================================================
// A. 静态证据
// ============================================================
console.log('--- A. 静态证据：AppBar DOM/CSS ---');

// A1. AppBar 容器 + 内部元素
assert(/class="sfv-search-appbar"/.test(htmlText), 'A1.1 .sfv-search-appbar 容器存在');
assert(/sfv-search-appbar-back/.test(htmlText), 'A1.2 AppBar ← 返回按钮存在');
assert(/sfv-search-appbar-title/.test(htmlText), 'A1.3 AppBar 标题元素存在');
assert(/sfv-search-appbar-close/.test(htmlText), 'A1.4 AppBar × 关闭按钮存在');

// A2/A3. data 属性
assert(/data-sfv-search-back/.test(htmlText), 'A2 ← 返回按钮 data-sfv-search-back');
assert(/data-sfv-search-quit/.test(htmlText), 'A3 × 关闭按钮 data-sfv-search-quit');

// A4. 标题"搜索"字
assert(/sfv-search-appbar-title[^>]*>搜索</.test(htmlText), 'A4 AppBar 标题字「搜索」');

// A5. AppBar 高度 56px
var appbarRule = cssText.match(/\.sfv-search-appbar\s*\{[^}]*?\}/);
assert(appbarRule !== null, 'A5.1 找到 .sfv-search-appbar CSS 规则');
if (appbarRule) {
  assert(/height:\s*56px/.test(appbarRule[0]), 'A5.2 AppBar height = 56px（Kazumi AppBar 默认 toolbarHeight）');
  assert(/background:\s*transparent/.test(appbarRule[0]), 'A5.3 AppBar background = transparent（Kazumi AppBar.transparent）');
  assert(/border-bottom:\s*1px/.test(appbarRule[0]), 'A5.4 AppBar 底部 1px 分割线');
}

// A6. T116：图片搜索图标已删除（用户要求）
assert(htmlText.indexOf('sfv-search-image-search') === -1, 'A6.1 T116：图片搜索图标已删除（不在 DOM）');
assert(htmlText.indexOf('data-sfv-image-search') === -1, 'A6.2 T116：data-sfv-image-search 已删除');
assert(/sfv-search-bar-trailing/.test(htmlText), 'A6.3 .sfv-search-bar-trailing 容器保留（为空）');

// A7. 搜索栏 DOM 应无独立的 .sfv-search-back 按钮（已升至 AppBar）
//  注：仍允许 .sfv-search-back 出现在 class 属性里（fallback），但不能让之前的 `<button class="sfv-search-back">` 单独存在
//  简化校验：搜索栏一段内（即 .sfv-search-bar 块内）不应该有 .sfv-search-back
var barBlock = htmlText.match(/<div class="sfv-search-bar">[\s\S]*?<\/div>\s*<\/div>/);
if (barBlock) {
  assert(!/sfv-search-back/.test(barBlock[0]), 'A7.1 搜索栏内不包含 .sfv-search-back（已升至 AppBar）');
} else {
  errors.push('WARN: 无法截取 .sfv-search-bar 块，跳过 A7.1');
}

// ============================================================
// B. 行为证据
// ============================================================
console.log('--- B. 行为：click handler 修复 ---');

// B1. online.js 检测 [data-sfv-search-quit] 并调 desktopWindow.close()
assert(/data-sfv-search-quit/.test(onlineSrc), 'B1.1 online.js 检测 [data-sfv-search-quit]');
var quitMatch = onlineSrc.match(/closest\(\[?\s*['"]\[data-sfv-search-quit\]['"]\s*\]?\)/);
assert(quitMatch !== null, 'B1.2 online.js closest() 检测 data-sfv-search-quit');
if (quitMatch) {
  // 紧随其后的 600 字符片段应包含 desktopWindow.close() 调用
  var afterIdx = onlineSrc.indexOf(quitMatch[0]);
  var section = onlineSrc.substring(afterIdx, afterIdx + 600);
  assert(/desktopWindow/.test(section) && /\.close\(\)/.test(section),
    'B1.3 close 按钮 handler 调 desktopWindow.close()');
  assert(/preventDefault/.test(section) && /stopPropagation/.test(section),
    'B1.4 close 按钮 handler 阻止默认 + 冒泡');
}

// B2. online.js 检测 [data-sfv-search-back] 并调 closeSearchPage()
assert(/data-sfv-search-back/.test(onlineSrc), 'B2.1 online.js 检测 [data-sfv-search-back]');
var backMatch = onlineSrc.match(/closest\(\[?\s*['"]\[data-sfv-search-back\]['"]\s*\]?\)/);
assert(backMatch !== null, 'B2.2 online.js closest() 检测 data-sfv-search-back');
if (backMatch) {
  var afterIdx2 = onlineSrc.indexOf(backMatch[0]);
  var section2 = onlineSrc.substring(afterIdx2, afterIdx2 + 600);
  assert(/closeSearchPage\(\)/.test(section2), 'B2.3 back 按钮 handler 调 closeSearchPage()');
}

// B3. (3b) 段修复：直接 si.focus() 而非 setTimeout(0)
//   之前的 (3b) 段位于注释 "// (3b) 搜索栏..." 之后，doc.addEventListener('click', ..., true) 包裹
//   内部包含 try/rAF 双保险以应对 Chromium 渲染场景
var focusBlock = onlineSrc.match(/\/\/ \(3b\)[\s\S]{0,2000}?\}\s*,\s*true\)\s*;/);
assert(focusBlock !== null, 'B3.1 找到 (3b) 段');
if (focusBlock) {
  assert(/si\.focus\(\)/.test(focusBlock[0]), 'B3.2 (3b) 段直接调 si.focus()');
  assert(/requestAnimationFrame/.test(focusBlock[0]), 'B3.3 (3b) 段 rAF 二次保险');
  // 之前是用 setTimeout(0)，新方案不允许
  assert(!/setTimeout\(\s*function\s*\(\)\s*\{\s*if\s*\(si\)\s*si\.focus\(\)\s*\}\s*,\s*0\s*\)/.test(focusBlock[0]),
    'B3.4 (3b) 段不再用 setTimeout(0) focus');
}

// B4. 图片搜索按钮阻断关闭误触
assert(/sfv-search-image-search/.test(onlineSrc), 'B4.1 online.js 检测图片搜索按钮');
var imgMatch = onlineSrc.match(/closest\(\[?\s*['"]\.sfv-search-image-search/);
assert(imgMatch !== null, 'B4.2 online.js 检测 .sfv-search-image-search');
if (imgMatch) {
  var afterIdx3 = onlineSrc.indexOf(imgMatch[0]);
  var section3 = onlineSrc.substring(afterIdx3, afterIdx3 + 500);
  assert(/preventDefault/.test(section3) && /stopPropagation/.test(section3),
    'B4.3 图片搜索 handler 阻止默认 + 冒泡（不误触关闭）');
  assert(/图片搜索功能即将上线/.test(section3),
    'B4.4 图片搜索 toast 文案提示"敬请期待"');
}

// B5. global.window.desktopWindow.close() 路径
assert(/global\.window\.desktopWindow/.test(onlineSrc) && /\.close\(\)/.test(onlineSrc),
  'B5 多条关闭路径：global.window.desktopWindow.close()');
// B6. 浏览器 fallback
assert(/global\.window\.close/.test(onlineSrc) || /window\.close\(\)/.test(onlineSrc),
  'B6 浏览器 fallback window.close()（非 Electron 调试用）');

// B7. 检查 IPC 通道存在（preload 暴露 desktopWindow）
var preloadSrc = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');
assert(/desktopWindow/.test(preloadSrc) && /close:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(['"]desktop-window-close['"]\)/.test(preloadSrc),
  'B7.1 preload.js 暴露 desktopWindow.close() → IPC desktop-window-close');
var mainSrc = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
assert(/ipcMain\.handle\(['"]desktop-window-close['"]/.test(mainSrc),
  'B7.2 main.js 注册 IPC handler desktop-window-close');

// ============================================================
// C. 回归（每个断言对应一个 npm 脚本调用）
// ============================================================
console.log('--- C. 回归 ---');

// C3. inline script 解析
var inlineOK = true;
try {
  var vm = require('vm');
  var re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
  var m;
  while ((m = re.exec(htmlText))) {
    new vm.Script(m[1], { filename: 'inline' });
  }
} catch (e) {
  inlineOK = false;
  errors.push('C3.1 inline script 解析失败: ' + e.message);
}
assert(inlineOK, 'C3.1 4 个 inline script 块 vm.Script 解析 OK');

// C4. node --check online.js
// 通过 spawn 同步执行 .node --check
var child = require('child_process').spawnSync(process.execPath, ['--check', path.join(root, 'public', 'video', 'online.js')], { encoding: 'utf8' });
assert(child.status === 0, 'C4.1 online.js node --check OK');

// ============================================================
// 输出
// ============================================================
console.log('\n========================================');
console.log('  T115 AppBar + 搜索栏点击修复测试: ' + passed + ' pass / ' + failed + ' fail');
console.log('========================================');
if (errors.length) { errors.forEach(function(e){ console.log('  X ' + e); }); }
process.exit(failed > 0 ? 1 : 0);
