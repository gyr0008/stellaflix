/**
 * T113 严格移植 Kazumi 搜索页 UI（Predidit/Kazumi 风格）
 *
 * 任务原话：「要按 Kazumi 风格改造搜索页 UI，严格移植 Kazumi 的搜索栏和
 *          历史面板的宽，上下间距等全部的细节参数」。
 *
 * Kazumi 源码（lib/pages/search/search_page.dart）显式声明的尺寸：
 *   - 容器外层 Padding: EdgeInsets.fromLTRB(8, 0, 8, 8)
 *   - barElevation / viewElevation: 0
 *   - barTrailing: [IconButton(image_search_rounded)]
 *   - viewLeading: IconButton(arrow_back)
 *   - 历史最多 10 条
 *   - 不显式设置 ListTile 各项参数（走 M3 默认）
 *
 * 验收清单（A 静态：CSS/DOM 必须满足；B 行为：图片搜索不误触关闭）：
 *  A1. .sfv-search-bar 居中限宽（max-width:760px; width:calc(100% - 16px); margin:0 auto）
 *  A2. .sfv-search-bar 高 48px（Kazumi M3 SearchBar 默认）
 *  A3. .sfv-search-bar 圆角 26px（T109g 已对齐 Kazumi 视觉）
 *  A4. .sfv-search-history-drop 居中限宽（同 max-width:760px）
 *  A5. .sfv-search-history-drop 与 .sfv-search-bar 同圆角 26px（一致风格）
 *  A6. .sfv-search-history-drop margin-top 0 + margin-bottom 8px（紧贴搜索栏）
 *      ↑ 关键：Kazumi fromLTRB(8,0,8,8) 的"8"是底 spacing
 *  A7. .sfv-search-history-item height 56px（Kazumi ListTile 默认）
 *  A8. .sfv-search-bar-area padding `0 8px 8px`（fromLTRB）
 *      ↑ 已存在的旧值
 *  A9. .sfv-search-image-search DOM 元素存在（新增的 barTrailing 图片搜索按钮）
 * A10. .sfv-search-image-search 位置：在 .sfv-search-close 之前（Kazumi 视觉惯例）
 * A11. .sfv-search-bar-area margin:0 auto / .sfv-search-bar margin:0 auto（确保居中）
 * A12. .sfv-search-history-drop margin:0 auto（确保居中）
 * A13. .sfv-search-page box-sizing border-box（防止内边距溢出撑破布局）
 *
 * B1. .sfv-search-image-search click 阻止冒泡 + 触发 toast（不误触 closeSearchPage）
 * B2. .sfv-search-close click 仍触发 closeSearchPage（关闭按钮工作）
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

// ============================================================
// A. 静态证据
// ============================================================
console.log('--- A. 静态证据：Kazumi 风格参数必须满足 ---');

// A1. 搜索栏居中限宽
assert(/border-radius:\s*26px/.test(cssText), 'A1.1 player.css 含 26px 圆角（搜索栏）');

// A2 / A3. 搜索栏高度/圆角检查
var barRule = cssText.match(/\.sfv-search-bar\s*\{[^}]*?\}/);
assert(barRule !== null, 'A2.1 找到 .sfv-search-bar CSS 规则');
if (barRule) {
  var b = barRule[0];
  assert(/height:\s*48px/.test(b), 'A2.2 search-bar height = 48px（Kazumi M3 默认）');
  assert(/border-radius:\s*26px/.test(b), 'A2.3 search-bar border-radius = 26px');
  assert(/width:\s*100%/.test(b), 'A2.4 search-bar width: 100%（占满 .sfv-search-bar-area-inner 760px 限宽容器）');
  assert(/max-width:\s*none/.test(b), 'A2.5 search-bar max-width: none（让父级 .sfv-search-bar-area-inner 限宽生效）');
  assert(/padding:\s*0\s*14px/.test(b), 'A2.6 search-bar 内容 padding 0 14px（Kazumi ListTile ≈ 16dp）');
}

// A4 / A5. T121：history-drop 改回 position:absolute 覆盖式布局（不挤 result-area）
var historyRule = cssText.match(/\.sfv-search-history-drop\s*\{[^}]*?\}/);
assert(historyRule !== null, 'A4.1 找到 .sfv-search-history-drop CSS 规则');
if (historyRule) {
  var h = historyRule[0];
  // T121：position:absolute 覆盖在 result-area 上方，不占据流式空间（用户要求"不挤搜索结果"）
  assert(/position:\s*absolute/.test(h), 'A4.2 T121 history-drop position: absolute（覆盖式布局，不挤 result-area）');
  assert(/top:\s*48px/.test(h), 'A4.3 T121 history-drop top: 48px（紧贴 48dp 搜索栏底部）');
  assert(/left:\s*0/.test(h) && /right:\s*0/.test(h), 'A4.4 T121 history-drop left:0; right:0 继承父 .sfv-search-bar-area-inner 760px 限宽');
  assert(/width:\s*auto/.test(h), 'A4.5 T121 history-drop width: auto（left/right:0 计算宽度）');
  assert(/z-index:\s*[2-9]/.test(h), 'A4.6 T121 history-drop z-index 高于 result-area');
  assert(/border-radius:\s*0\s+0\s+26px\s+26px/.test(h), 'A4.7 T121 history-drop 顶部 0 圆角 + 底部 26px（与搜索栏顶部 26px + 底部 0 形成连续胶囊）');
  assert(/animation:\s*sfvDropIn/.test(h), 'A4.8 T121 history-drop slide-down 动画');
}

// A4b / A5. T119：新增 .sfv-search-bar-area-inner 限宽容器
var innerAreaRule = cssText.match(/\.sfv-search-bar-area-inner\s*\{[^}]*?\}/);
assert(innerAreaRule !== null, 'A4b.1 找到 .sfv-search-bar-area-inner CSS 规则');
if (innerAreaRule) {
  var inn = innerAreaRule[0];
  assert(/max-width:\s*760px/.test(inn), 'A4b.2 .sfv-search-bar-area-inner max-width: 760px');
  assert(/margin:\s*0 auto/.test(inn), 'A4b.3 .sfv-search-bar-area-inner margin: 0 auto');
  assert(/position:\s*relative/.test(inn), 'A4b.4 .sfv-search-bar-area-inner position: relative');
}

// A7. 历史项高度
var itemRule = cssText.match(/\.sfv-history-item\s*\{[^}]*?\}/);
assert(itemRule !== null, 'A5.1 找到 .sfv-history-item CSS 规则');
if (itemRule) {
  var it = itemRule[0];
  assert(/height:\s*50px/.test(it), 'A5.2 T128 history-item height = 50px（用户要求"上下间距 50px"）');
  assert(/color:\s*#000/.test(it), 'A5.3 T128 history-item 文字纯黑 #000');
  assert(/padding:\s*0\s*20px/.test(it), 'A5.3 history-item padding = 0 20px（Kazumi ListTile contentPadding 横向 ≈ 16-20dp）');
}

// A8. 搜索栏外层 padding
var barAreaRule = cssText.match(/\.sfv-search-bar-area\s*\{[^}]*?\}/);
assert(barAreaRule !== null, 'A6.1 找到 .sfv-search-bar-area CSS 规则');
if (barAreaRule) {
  var a = barAreaRule[0];
  // fromLTRB(8, 0, 8, 8) → padding: 0 8px 8px
  // T116：padding 改为 0 8px 0（让历史面板紧贴搜索栏），不再用 0 8px 8px
  assert(/padding:\s*0\s*8px\s*0\b/.test(a), 'A6.2 T116 search-bar-area padding = 0 8px 0（让历史面板紧贴搜索栏）');
  assert(/background:\s*#faf8f5/.test(a) || /background-color:\s*#faf8f5/.test(a),
    'A6.3 search-bar-area 背景 #faf8f5 米白（与页面底色一致）');
}

// T116 删除图片搜索按钮（用户要求）。Trailing 留空，但仍要 .sfv-search-bar-trailing 容器
assert(/sfv-search-image-search/.test(htmlText) === false,
  'A7.1 T116：DOM 不再含 .sfv-search-image-search（删除图片搜索图标）');
assert(/data-sfv-image-search/.test(htmlText) === false,
  'A7.2 T116：DOM 不再含 data-sfv-image-search');
assert(/sfv-search-bar-trailing/.test(htmlText),
  'A7.3 .sfv-search-bar-trailing 容器保留（空）');
// T115 关键：AppBar 接管 close 按钮
assert(/data-sfv-search-quit/.test(htmlText), 'A8.4 AppBar 顶部 × 关闭按钮（data-sfv-search-quit）');
assert(/sfv-search-appbar-close/.test(htmlText), 'A8.5 AppBar 关闭按钮类 .sfv-search-appbar-close');

// A11. 搜索栏居中容器与 Kazumi fromLTRB 对齐
assert(/fromLTRB\(8,\s*0,\s*8,\s*8\)/.test(htmlText) || /fromLTRB\(8,0,8,8\)/.test(htmlText),
  'A9 DOM/JS 注释声明 fromLTRB(8,0,8,8)');
// T116：bar-area padding 改为 0 8px 0（删 padding-bottom 让历史面板紧贴搜索栏）
assert(/padding:\s*0\s*8px\s*0\b/.test(cssText) || /padding:\s*0\s*8px\s*0\s*;/.test(cssText),
  'A10 T116 player.css .sfv-search-bar-area padding = 0 8px 0（让历史面板紧贴搜索栏）');

// A12. 完整 DOM 结构：.sfv-search-page 包含 bar-area + history-drop + result-area
assert(/id="sfv-search-page"[^>]*class="sfv-search-page"/.test(htmlText),
  'A11 DOM 含 #sfv-search-page.sfv-search-page 容器');

// ============================================================
// B. 行为测试：图片搜索按钮 click 不触发关闭按钮
// ============================================================
console.log('--- B. 行为：图片搜索 ≠ 关闭 ---');

var onlineSrc = fs.readFileSync(path.join(root, 'public', 'video', 'online.js'), 'utf8');
assert(/sfv-search-image-search/.test(onlineSrc),
  'B1.1 online.js 含 .sfv-search-image-search 点击处理');
assert(/图片搜索功能即将上线/.test(onlineSrc) ||
       /图片搜索/.test(onlineSrc),
  'B1.2 online.js 对图片搜索点击有 toast 提示');

// 图片搜索 click 阻断：阻止默认 + 阻止冒泡（避免触发 .sfv-search-close）
var imgBtnBlock = onlineSrc.match(/closest\(\s*['"]\.sfv-search-image-search[^)]*\)/);
assert(imgBtnBlock !== null, 'B2 online.js 检测 .sfv-search-image-search 类');
if (imgBtnBlock) {
  var section = onlineSrc.substring(onlineSrc.indexOf(imgBtnBlock[0]) - 100, onlineSrc.indexOf(imgBtnBlock[0]) + 400);
  assert(/preventDefault/.test(section) && /stopPropagation/.test(section),
    'B3 图片搜索 handler 阻止默认 + 阻止冒泡（避免误触 closeSearchPage）');
}

// 关闭按钮仍然工作（handler 仍存在）
var closeBtnBlock = onlineSrc.match(/closest\(\s*['"]\.sfv-search-close['"]\s*\)/);
assert(closeBtnBlock !== null, 'B4 online.js 检测 .sfv-search-close 类（仍触发关闭）');

// ============================================================
// 输出
// ============================================================
console.log('\n========================================');
console.log('  T113 Kazumi 搜索页风格移植测试: ' + passed + ' pass / ' + failed + ' fail');
console.log('========================================');
if (errors.length) { errors.forEach(function(e){ console.log('  X ' + e); }); }
process.exit(failed > 0 ? 1 : 0);
