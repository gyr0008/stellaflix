/**
 * T97 搜索面板 + 导航均匀分布 — 专项测试
 */
var fs = require('fs');
var indexHtml = fs.readFileSync('public/index.html', 'utf8');
var playerCss = fs.readFileSync('public/video/player.css', 'utf8');
var onlineJs = fs.readFileSync('public/video/online.js', 'utf8');

var pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// ================================================================
// A. 搜索面板 DOM 结构
// ================================================================
console.log('\n=== A. 搜索面板 DOM ===\n');

assert(indexHtml.indexOf('id="sfv-search-panel"') !== -1, '#sfv-search-panel 存在');
assert(indexHtml.indexOf('class="sfv-search-panel"') !== -1, '.sfv-search-panel class 存在');
assert(indexHtml.indexOf('id="sfv-search-panel-input"') !== -1, '面板搜索输入框存在');
assert(indexHtml.indexOf('id="sfv-search-panel-go"') !== -1, '面板搜索按钮存在');
assert(indexHtml.indexOf('id="sfv-search-history-list"') !== -1, '搜索历史列表容器存在');
assert(indexHtml.indexOf('id="sfv-search-hot-list"') !== -1, '热门搜索列表容器存在');
assert(indexHtml.indexOf('sfv-search-panel-inner') !== -1, '面板内部容器 .sfv-search-panel-inner 存在');
assert(indexHtml.indexOf('sfv-search-input-row') !== -1, '搜索输入行 .sfv-search-input-row 存在');
assert(indexHtml.indexOf('sfv-search-section-head') !== -1, '分区标题 .sfv-search-section-head 存在');
// .sfv-search-tag 由 CSS 定义 + JS 动态渲染，HTML 中仅存空态占位
assert(playerCss.indexOf('.sfv-search-tag') !== -1, '搜索标签 .sfv-search-tag 样式定义存在');
assert(indexHtml.indexOf('aria-label="影视搜索面板"') !== -1, '面板有 aria-label 无障碍标签');

// 面板位置：紧跟 #top-right 之后（不在其内部）
var topRightEnd = indexHtml.indexOf('</div>', indexHtml.indexOf('<div id="top-right">'));
var panelStart = indexHtml.indexOf('id="sfv-search-panel"', topRightEnd);
assert(panelStart > topRightEnd && panelStart < topRightEnd + 200,
       '搜索面板位于 #top-right 之后（独立同级元素）');

// 搜索按钮为红色圆形（参考截图）
assert(indexHtml.indexOf('sfv-search-panel-go') !== -1 &&
       indexHtml.substring(indexHtml.indexOf('sfv-search-panel-go'), indexHtml.indexOf('sfv-search-panel-go') + 100).indexOf('svg') !== -1,
       '搜索按钮含 SVG 图标');

// ================================================================
// B. 搜索面板 CSS
// ================================================================
console.log('\n=== B. 搜索面板 CSS ===\n');

assert(playerCss.indexOf('#sfv-search-panel') !== -1, '#sfv-search-panel 样式定义存在');
assert(playerCss.indexOf('.sfv-search-panel-open') !== -1, '.sfv-search-panel-open 展开状态类存在');
assert(playerCss.indexOf('translateX(100%)') !== -1, '隐藏态 translateX(100%) 滑出右侧');
assert(playerCss.indexOf('translateX(0)') !== -1, '展开态 translateX(0) 归位');
assert(playerCss.indexOf('transition:') !== -1 || playerCss.indexOf('transition ') !== -1, '有过渡动画');
assert(playerCss.indexOf('backdrop-filter: blur(') !== -1, '面板有 backdrop-filter 玻璃模糊');
assert(playerCss.indexOf('--fc-accent-rgb') !== -1, '使用主题色变量');
assert(playerCss.indexOf('.sfv-search-input-row') !== -1, '输入行样式存在');
assert(playerCss.indexOf('.sfv-search-panel-go') !== -1, '搜索按钮样式存在');
assert(playerCss.indexOf('border-radius: 50%') !== -1 || playerCss.indexOf('border-radius:50%') !== -1, '搜索按钮为圆形');
assert(playerCss.indexOf('.sfv-search-section-head') !== -1, '分区标题样式存在');
assert(playerCss.indexOf('.sfv-search-tag') !== -1, '搜索标签样式存在');
assert(playerCss.indexOf('.sfv-search-empty') !== -1, '空态文字样式存在');
assert(playerCss.indexOf('#sfv-search-panel::-webkit-scrollbar') !== -1, '自定义滚动条样式');

// z-index 层级正确（高于 sfv-overlay(2147483000)，避免被全屏遮罩盖住）
assert(playerCss.indexOf('2147483100') !== -1, '面板 z-index 高于 sfv-overlay(2147483000)');
// 圆角方向正确（左侧圆角，右侧贴边）
assert(playerCss.indexOf('border-radius: 18px 0 0 18px') !== -1 ||
       playerCss.indexOf('border-radius:18px 0 0 18px') !== -1,
       '面板圆角为左圆右直（贴边设计）');

// ================================================================
// C. 导航均匀分布
// ================================================================
console.log('\n=== C. 导航均匀分布 ===\n');

assert(playerCss.indexOf('space-evenly') !== -1, '#search-box 使用 space-evenly 均匀分布');
assert(playerCss.indexOf('flex: 1') !== -1, '.sfv-nav-item 使用 flex:1 等分空间');

// ================================================================
// D. JS 逻辑验证
// ================================================================
console.log('\n=== D. JS 搜索面板逻辑 ===\n');

assert(onlineJs.indexOf('toggleSearchPanel') !== -1, 'toggleSearchPanel 函数存在');
assert(onlineJs.indexOf('openSearchPanel') !== -1, 'openSearchPanel 函数存在');
assert(onlineJs.indexOf('closeSearchPanel') !== -1, 'closeSearchPanel 函数存在');
assert(onlineJs.indexOf('isSearchPanelOpen') !== -1, 'isSearchPanelOpen 函数存在');
assert(onlineJs.indexOf('doPanelSearch') !== -1, 'doPanelSearch 函数存在');
assert(onlineJs.indexOf('getSearchHistory') !== -1, 'getSearchHistory 函数存在');
assert(onlineJs.indexOf('saveSearchHistory') !== -1, 'saveSearchHistory 函数存在');
assert(onlineJs.indexOf('renderSearchHistory') !== -1, 'renderSearchHistory 函数存在');
assert(onlineJs.indexOf('renderHotSearches') !== -1, 'renderHotSearches 函数存在');
assert(onlineJs.indexOf('stellaflix-search-history') !== -1, 'localStorage 键名 stellaflix-search-history 存在');

// Escape 关闭逻辑
assert(onlineJs.indexOf("ev.key === 'Escape'") !== -1 || onlineJs.indexOf('keyCode === 27') !== -1,
       '支持 Escape 关闭面板');
// 点击外部关闭
assert(onlineJs.indexOf('click') !== -1 && onlineJs.indexOf('sfv-search-panel') !== -1 && onlineJs.indexOf('closest') !== -1,
       '点击面板外部关闭逻辑存在');
// 历史标签点击搜索
assert(onlineJs.indexOf('data-sfv-kw') !== -1, '历史标签带 data-sfv-kw 属性可点击搜索');

// ================================================================
// E. 回归防护
// ================================================================
console.log('\n=== E. 回归防护 ===\n');

assert(indexHtml.indexOf('id="search-box"') !== -1, '回归：#search-box 未被删除');
assert(indexHtml.indexOf('id="top-right"') !== -1, '回归：#top-right 未被删除');
assert(indexHtml.indexOf('id="sfv-nav"') !== -1, '回归：#sfv-nav 未被删除');
assert(indexHtml.indexOf('sfv-capsule-search-btn') !== -1, '回归：胶囊搜索按钮未变');
assert(onlineJs.indexOf('bindNavItems') !== -1, '回归：导航绑定函数仍在');
assert(onlineJs.indexOf('setActiveNav') !== -1, '回归：setActiveNav 仍在');
assert(onlineJs.indexOf('handleNavAction') !== -1, '回归：handleNavAction 仍在');
assert(onlineJs.indexOf('doSearch') !== -1, '回归：doSearch 仍在');

// ================================================================
// 结果
// ================================================================
console.log('\n========================================');
console.log('T97 测试: ' + pass + ' PASS / ' + fail + ' FAIL / ' + (pass+fail) + ' TOTAL');
if (fail === 0) console.log('ALL PASS ✅');
else console.log('HAS FAILURES ❌');
process.exit(fail > 0 ? 1 : 0);
