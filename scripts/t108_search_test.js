/**
 * T108 全页搜索（Kazumi 风格）专项测试
 * 替代原 T97 右侧滑出面板，改为全屏覆盖层 + 居中搜索栏 + 历史下拉 + 内联结果网格
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
// A. 全页搜索 DOM 结构（index.html）
// ================================================================
console.log('\n=== A. 全页搜索 DOM 结构 ===\n');

assert(indexHtml.indexOf('id="sfv-search-page"') !== -1, '#sfv-search-page 容器存在');
assert(indexHtml.indexOf('class="sfv-search-page"') !== -1, '.sfv-search-page class 存在');
assert(indexHtml.indexOf('id="sfv-search-input"') !== -1, '#sfv-search-input 搜索输入框存在');
assert(indexHtml.indexOf('id="sfv-history-drop"') !== -1, '#sfv-history-drop 历史下拉容器存在');
assert(indexHtml.indexOf('id="sfv-history-drop-list"') !== -1, '#sfv-history-drop-list 历史列表存在');
assert(indexHtml.indexOf('id="sfv-search-result-area"') !== -1, '#sfv-search-result-area 结果区域存在');

// T109h：Kazumi SearchAnchor.bar 风格 —— 无独立 header，搜索栏自带 leading/trailing
assert(indexHtml.indexOf('sfv-search-header') === -1, 'T109h: .sfv-search-header 已移除（Kazumi 无独立 header）');
assert(indexHtml.indexOf('sfv-search-bar-leading') !== -1, 'T109h: .sfv-search-bar-leading 存在（对齐 Kazumi viewLeading）');
assert(indexHtml.indexOf('sfv-search-bar-trailing') !== -1, 'T109h: .sfv-search-bar-trailing 存在（对齐 Kazumi barTrailing）');

// T115：AppBar 重组 — 顶部 AppBar 接管 ← 返回 + × 关闭软件，标题显示「搜索」
assert(indexHtml.indexOf('sfv-search-appbar') !== -1, 'T115.1 .sfv-search-appbar 顶部 AppBar 存在');
assert(indexHtml.indexOf('data-sfv-search-back') !== -1, 'T115.2 AppBar 顶部 ← 返回按钮（data-sfv-search-back）');
assert(indexHtml.indexOf('data-sfv-search-quit') !== -1, 'T115.3 AppBar 顶部 × 关闭软件按钮（data-sfv-search-quit）');
assert(indexHtml.indexOf('sfv-search-appbar-title') !== -1, 'T115.4 .sfv-search-appbar-title 标题元素');
assert(/搜索<\//.test(indexHtml) || /搜索<\//.test(indexHtml) || indexHtml.indexOf('>搜索</div>') !== -1, 'T115.5 AppBar 标题显示「搜索」');
// T115：搜索栏 trailing 内的旧 .sfv-search-close 已移除（向上移至 AppBar）
// T116：图片搜索图标已删除
assert(indexHtml.indexOf('sfv-search-image-search') === -1, 'T116.6 搜索栏图片搜索图标已删除（不在 DOM）');
assert(indexHtml.indexOf('data-sfv-image-search') === -1, 'T116.6b data-sfv-image-search 已删除');
// 旧 .sfv-search-back 也不再出现在 search-bar 上下文（已升至 AppBar）
// T109g：已删除「搜索」标题（Kazumi SearchAnchor.bar 无标题文字，← 图标已表达搜索语义）
assert(indexHtml.indexOf('<span class="sfv-search-title">搜索</span>') === -1, 'T109g: .sfv-search-title 搜索标题已删除');

// 搜索栏
assert(indexHtml.indexOf('sfv-search-bar-area') !== -1, '.sfv-search-bar-area 搜索栏区域存在');
assert(indexHtml.indexOf('sfv-search-bar') !== -1, '.sfv-search-bar 搜索栏存在');
assert(indexHtml.indexOf('sfv-search-bar-icon') !== -1, '.sfv-search-bar-icon 搜索图标存在');
assert(indexHtml.indexOf('sfv-search-bar-img-btn') === -1, '回归：图片搜索按钮已删除（Kazumi看图识番不需要）');

// T109h：历史下拉结构简化（对齐 Kazumi suggestionsBuilder —— 无 inner/back 包装层）
assert(indexHtml.indexOf('sfv-history-drop-inner') === -1, 'T109h: .sfv-history-drop-inner 已移除（扁平结构）');
assert(indexHtml.indexOf('sfv-history-drop-back') === -1, 'T109h: .sfv-history-drop-back 已移除（由 leading ← 承担）');
// .sfv-history-item-del 由 JS renderHistoryDrop() 动态创建（不在静态 HTML 中）

// 无障碍标签
assert(indexHtml.indexOf('aria-label="影视搜索页"') !== -1, '搜索页有 aria-label 无障碍标签');
// T115：关闭按钮已升至 AppBar，aria-label 改为「关闭软件」
assert(indexHtml.indexOf('aria-label="关闭软件"') !== -1, 'T115.7 AppBar 关闭按钮 aria-label="关闭软件"');

// 旧 T97 DOM 已清除
assert(indexHtml.indexOf('id="sfv-search-panel"') === -1, '回归：旧 #sfv-search-panel 已移除');
assert(indexHtml.indexOf('sfv-search-panel-go') === -1, '回归：旧 sfv-search-panel-go 已移除');
assert(indexHtml.indexOf('sfv-search-panel-inner') === -1, '回归：旧 sfv-search-panel-inner 已移除');

// ================================================================
// B. 全页搜索 CSS（player.css）
// ================================================================
console.log('\n=== B. 全页搜索 CSS ===\n');

assert(playerCss.indexOf('#sfv-search-page') !== -1, '#sfv-search-page 样式定义存在');
assert(playerCss.indexOf('.sfv-search-open') !== -1, '.sfv-search-open 展开状态类存在');
assert(playerCss.indexOf('translateY(100%)') !== -1, '隐藏态 translateY(100%) 滑出底部（T109e）');
assert(playerCss.indexOf('translateY(0)') !== -1, '展开态 translateY(0) 归位（T109e）');
assert(playerCss.indexOf('transition:') !== -1 || playerCss.indexOf('transition ') !== -1, '有过渡动画');

// 全屏覆盖布局
assert(playerCss.indexOf('position: fixed') !== -1, '全页定位 position: fixed');
assert(playerCss.indexOf('inset: 0') !== -1 || (playerCss.indexOf('top: 0') !== -1 && playerCss.indexOf('bottom: 0') !== -1),
       '全屏覆盖 inset/top+bottom=0');
assert(playerCss.indexOf('#faf8f5') !== -1, '统一乳白色背景 #faf8f5（T109d：除搜索栏外全页一色）');

// z-index 层级正确（高于 sfv-overlay(2147483000)）
assert(playerCss.indexOf('2147483100') !== -1, 'z-index 高于 sfv-overlay(2147483000)');

// T109h：Kazumi SearchAnchor.bar 风格 —— 无独立 header 样式
assert(playerCss.indexOf('.sfv-search-bar-leading') !== -1, 'T109h: .sfv-search-bar-leading 样式存在（viewLeading）');
assert(playerCss.indexOf('.sfv-search-bar-trailing') !== -1, 'T109h: .sfv-search-bar-trailing 样式存在（barTrailing）');
assert(playerCss.indexOf('.sfv-search-close') !== -1, '.sfv-search-close 关闭按钮样式存在');

// 搜索栏样式（胶囊形圆角）
assert(playerCss.indexOf('.sfv-search-bar') !== -1, '搜索栏样式存在');
assert(playerCss.indexOf('border-radius: 26px') !== -1 || playerCss.indexOf('border-radius:26px') !== -1,
       '搜索栏为Kazumi M3圆角(26px, 截图实测)');
assert(playerCss.indexOf('#f0f0f0') !== -1, '搜索栏浅灰背景 #f0f0f0');

// 历史下拉样式
assert(playerCss.indexOf('.sfv-search-history-drop') !== -1, '历史下拉容器样式存在');
assert(playerCss.indexOf('sfv-history-visible') !== -1, '历史下拉可见状态类存在');
// T109g：圆角从 20px 改为 26px（对齐搜索栏 border-radius:26px，Kazumi 用默认圆角）
assert(playerCss.indexOf('border-radius: 26px') !== -1 || playerCss.indexOf('border-radius:26px') !== -1,
       '历史下拉圆角(26px, 对齐搜索栏)');
assert(playerCss.indexOf('sfvDropIn') !== -1, '下拉动画 keyframe 存在');

// 历史条目样式
assert(playerCss.indexOf('.sfv-history-item') !== -1, '历史条目样式存在');
assert(playerCss.indexOf('.sfv-history-item-del') !== -1, '删除按钮样式存在');
assert(playerCss.indexOf('.sfv-search-empty-hint') !== -1, 'T109h: 空态提示样式 .sfv-search-empty-hint 存在');

// 结果区域 + 卡片网格
assert(playerCss.indexOf('.sfv-search-result-area') !== -1, '结果区域样式存在');
assert(playerCss.indexOf('.sfv-search-status') !== -1, '搜索状态提示样式存在');
assert(playerCss.indexOf('.sfv-search-result-area .sfv-grid') !== -1, '结果区网格样式存在');
assert(playerCss.indexOf('.sfv-search-result-area .sfv-card') !== -1, '结果区卡片样式存在');
assert(playerCss.indexOf('.sfv-card-cover') !== -1, '卡片封面样式存在');
assert(playerCss.indexOf('.sfv-card-name') !== -1, '卡片标题样式存在');
assert(playerCss.indexOf('.sfv-card-sub') !== -1, '卡片副标题样式存在');

// ================================================================
// C. 导航均匀分布（保留自 T97）
// ================================================================
console.log('\n=== C. 导航均匀分布 ===\n');

assert(playerCss.indexOf('space-evenly') !== -1, '#search-box 使用 space-evenly 均匀分布');
assert(playerCss.indexOf('flex: 1') !== -1, '.sfv-nav-item 使用 flex:1 等分空间');

// ================================================================
// D. JS 逻辑验证（T108 新函数）
// ================================================================
console.log('\n=== D. JS 全页搜索逻辑 ===\n');

// 开关函数
assert(onlineJs.indexOf('toggleSearchPage') !== -1, 'toggleSearchPage 函数存在');
assert(onlineJs.indexOf('openSearchPage') !== -1, 'openSearchPage 函数存在');
assert(onlineJs.indexOf('closeSearchPage') !== -1, 'closeSearchPage 函数存在');
assert(onlineJs.indexOf('isSearchPageOpen') !== -1, 'isSearchPageOpen 函数存在');

// 核心搜索
assert(onlineJs.indexOf('doInlineSearch') !== -1, 'doInlineSearch 内联搜索函数存在');
assert(onlineJs.indexOf('renderInlineResults') !== -1, 'renderInlineResults 结果渲染函数存在');
assert(onlineJs.indexOf('clearResultArea') !== -1, 'clearResultArea 清空函数存在');
assert(onlineJs.indexOf('showSearchStatus') !== -1, 'showSearchStatus 状态提示函数存在');

// 历史管理
assert(onlineJs.indexOf('getSearchHistory') !== -1, 'getSearchHistory 函数存在');
assert(onlineJs.indexOf('saveSearchHistory') !== -1, 'saveSearchHistory 函数存在');
assert(onlineJs.indexOf('removeSearchHistoryItem') !== -1, 'removeSearchHistoryItem 单条删除函数存在');
assert(onlineJs.indexOf('clearSearchHistory') !== -1, 'clearSearchHistory 清空函数存在');
assert(onlineJs.indexOf('renderHistoryDrop') !== -1, 'renderHistoryDrop 渲染函数存在');
assert(onlineJs.indexOf('stellaflix-search-history') !== -1, 'localStorage 键名 stellaflix-search-history 存在');

// 历史下拉控制
assert(onlineJs.indexOf('showHistoryDrop') !== -1, 'showHistoryDrop 显示下拉函数存在');
assert(onlineJs.indexOf('hideHistoryDrop') !== -1, 'hideHistoryDrop 隐藏下拉函数存在');

// Escape 处理（双层：先关下拉，再关页面）
var escapeCount = (onlineJs.match(/Escape/g) || []).length;
assert(escapeCount >= 2, '支持 Escape 关闭（至少2处引用）');

// 事件绑定
assert(onlineJs.indexOf('#sfv-capsule-search-btn') !== -1, '胶囊按钮点击绑定存在');
assert(onlineJs.indexOf('.sfv-search-bar-leading') !== -1, 'T109h: leading 图标关闭/返回绑定存在');
assert(onlineJs.indexOf('.sfv-search-close') !== -1, '关闭按钮绑定存在');
assert(onlineJs.indexOf('.sfv-history-item') !== -1, '历史条目点击搜索绑定存在');
assert(onlineJs.indexOf('.sfv-history-item-del') !== -1, '历史删除按钮绑定存在');
assert(onlineJs.indexOf('data-sfv-kw') !== -1, '历史条目带 data-sfv-kw 属性');

// 输入过滤
assert(onlineJs.indexOf('filterText') !== -1 && onlineJs.indexOf('toLowerCase') !== -1,
       '支持输入时实时过滤历史');

// 结果点击 -> 关闭搜索页 -> 打开详情
assert(onlineJs.indexOf('closeSearchPage()') !== -1, '点击结果后关闭搜索页');
assert(onlineJs.indexOf('openDetail') !== -1, '点击后打开详情');
assert(onlineJs.indexOf('openKazumiDetail') !== -1, '支持 Kazumi 详情打开');

// _currentSearchView 过期丢弃机制
assert(onlineJs.indexOf('_currentSearchView') !== -1, '搜索视图过期丢弃机制存在');

// 旧 T97 JS 已清除
assert(onlineJs.indexOf('toggleSearchPanel') === -1, '回归：旧 toggleSearchPanel 已移除');
assert(onlineJs.indexOf('doPanelSearch') === -1, '回归：旧 doPanelSearch 已移除');
assert(onlineJs.indexOf('renderHotSearches') === -1, '回归：旧 renderHotSearches 已移除');
assert(onlineJs.indexOf('isSearchPanelOpen') === -1, '回归：旧 isSearchPanelOpen 已移除');

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
assert(onlineJs.indexOf('doSearch') !== -1, '回归：doSearch 仍在（浏览层仍使用）');
assert(onlineJs.indexOf('bindCapsuleSearchBtn') !== -1, '回归：bindCapsuleSearchBtn 绑定入口仍在');
assert(onlineJs.indexOf('胶囊按钮直接 click 触发') !== -1, '新增：胶囊按钮直接绑定 fallback');
assert(onlineJs.indexOf('[SFV-Search]') !== -1, '新增：搜索诊断日志 [SFV-Search]');

// ================================================================
// 结果
// ================================================================
console.log('\n========================================');
console.log('T108 全页搜索测试: ' + pass + ' PASS / ' + fail + ' FAIL / ' + (pass+fail) + ' TOTAL');
if (fail === 0) console.log('ALL PASS ✅');
else console.log('HAS FAILURES ❌');
process.exit(fail > 0 ? 1 : 0);
