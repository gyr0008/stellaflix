/**
 * T99 片源分页改造 + 规则移入控制台 — 专项测试
 *
 * 验证：
 *  A. fx-sources.js 新 HTML 结构（分区标题/输入行/操作行/主副按钮/规则分区）
 *  B. 「规则」已从浏览层操作栏移出，仅保留在控制台片源分区
 *  C. player.css 配套新类名样式（严格复用 Mineradio 玻璃设计变量）
 *  D. 脚本语法 OK
 *  E. 回归：FX 片源 tab 注入结构不变
 */
var fs = require('fs');
var indexHtml = fs.readFileSync('public/index.html', 'utf8');
var playerCss = fs.readFileSync('public/video/player.css', 'utf8');
var onlineJs = fs.readFileSync('public/video/online.js', 'utf8');
var fxSrcJs  = fs.readFileSync('public/video/fx-sources.js', 'utf8');

var pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}
function countStr(hay, needle) {
  var n = 0, i = hay.indexOf(needle);
  while (i !== -1) { n++; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

// ================================================================
// A. fx-sources.js 新 HTML 结构
// ================================================================
console.log('\n=== A. fx-sources.js 片源 tab HTML 结构 ===\n');

assert(fxSrcJs.indexOf('sfv-section-label') !== -1, '.sfv-section-label 类名存在');
assert(countStr(fxSrcJs, 'sfv-section-label') === 4,
       '恰好 4 个分区标题（CMS10片源/已添加片源/Kazumi规则/已导入规则）= ' + countStr(fxSrcJs, 'sfv-section-label'));
assert(fxSrcJs.indexOf('CMS10 片源') !== -1, '「CMS10 片源」分区存在');
assert(fxSrcJs.indexOf('Kazumi 搜索规则') !== -1, '「Kazumi 搜索规则」分区存在');

assert(fxSrcJs.indexOf('sfv-input-row') !== -1, '.sfv-input-row 输入行容器存在');
assert(fxSrcJs.indexOf('sfv-form-actions') !== -1, '.sfv-form-actions 操作行容器存在');
assert(fxSrcJs.indexOf('sfv-btn-primary sfv-src-add') !== -1, '主按钮 .sfv-btn-primary.sfv-src-add 存在');
assert(fxSrcJs.indexOf('sfv-btn-secondary sfv-rule-import') !== -1, '次按钮 .sfv-btn-secondary.sfv-rule-import 存在');

assert(fxSrcJs.indexOf('sfv-rules-notice') !== -1, '规则提示 .sfv-rules-notice 存在');
assert(fxSrcJs.indexOf('sfv-rules-list') !== -1, '规则列表容器 .sfv-rules-list 存在');
assert(fxSrcJs.indexOf('sfv-rule-hint') !== -1, '规则提示文案 .sfv-rule-hint 存在');
assert(fxSrcJs.indexOf('id="sfv-rule-file"') !== -1, '隐藏文件输入 #sfv-rule-file 存在（导入规则）');
assert(fxSrcJs.indexOf('accept=".json,application/json"') !== -1, '文件输入限定 .json');

assert(fxSrcJs.indexOf('sfv-src-notice') !== -1, '合规提示 .sfv-src-notice 常驻存在');
assert(fxSrcJs.indexOf('sfv-rule-item') !== -1, '规则项复用 .sfv-rule-item 卡片布局');

// 规则项操作按钮
assert(fxSrcJs.indexOf('sfv-rule-toggle') !== -1, '规则启用/停用按钮 .sfv-rule-toggle 存在');
assert(fxSrcJs.indexOf('sfv-rule-del') !== -1, '规则删除按钮 .sfv-rule-del 存在');

// 规则交互逻辑挂钩
assert(fxSrcJs.indexOf("SFV.kazumi") !== -1, '引用 SFV.kazumi 规则模块');
assert(fxSrcJs.indexOf('kz.importRules') === -1, '不再调用不存在的 kz.importRules（已改为 importRule）');
assert(fxSrcJs.indexOf('kz.importRule') !== -1, '导入逻辑调用 kz.importRule（单数，对齐 kazumi-bridge API）');
assert(fxSrcJs.indexOf('kz.removeRule') !== -1, '删除逻辑调用 kz.removeRule');
assert(fxSrcJs.indexOf('kz.toggleRule') === -1, '不再调用不存在的 kz.toggleRule（已改为 setEnabled）');
assert(fxSrcJs.indexOf('kz.setEnabled') !== -1, '启用切换调用 kz.setEnabled(name, on)');

// ================================================================
// B. 「规则」已从浏览层移出
// ================================================================
console.log('\n=== B. 「规则」退出浏览层操作栏 ===\n');

assert(onlineJs.indexOf("var bKz = mkAct('规则'") === -1, '浏览层不再创建「规则」按钮 (bKz)');
assert(onlineJs.indexOf("actsEl.appendChild(bKz)") === -1, '浏览层不再挂载「规则」按钮');
assert(onlineJs.indexOf("mkAct('规则'") === -1, '全局无 mkAct(\'规则\') 调用');
assert(onlineJs.indexOf('function openRules()') !== -1, 'openRules 函数仍保留（功能未丢失）');
assert(onlineJs.indexOf('openRules: openRules') !== -1, 'openRules 仍导出（供将来复用）');

// ================================================================
// C. player.css 配套新类名样式（复用 Mineradio 玻璃语言）
// ================================================================
console.log('\n=== C. player.css 片源 tab 新样式 ===\n');

assert(playerCss.indexOf('.sfv-section-label') !== -1, '.sfv-section-label 样式定义存在');
assert(playerCss.indexOf('.sfv-section-label::after') !== -1 || playerCss.indexOf('.sfv-section-label::before') !== -1,
       '分区标题有伪元素装饰（::after 渐变线 或 ::before 竖条）');
assert(playerCss.indexOf('--saved-button-glass-bg') !== -1, '使用 --saved-button-glass-bg（Mineradio 亮光玻璃底色）');
assert(playerCss.indexOf('--saved-button-glass-filter') !== -1, '使用 --saved-button-glass-filter（blur+brightness 提亮）');
assert(playerCss.indexOf('--saved-button-glass-shadow') !== -1, '使用 --saved-button-glass-shadow（内发光白边）');
assert(playerCss.indexOf('brightness(1.16)') !== -1, '包含 brightness(1.16) 提亮因子');
assert(playerCss.indexOf('--fc-accent-rgb') !== -1, '分区标题使用主题色变量');
assert(playerCss.indexOf('.sfv-input-row') !== -1, '.sfv-input-row 样式存在');
assert(playerCss.indexOf('.sfv-form-actions') !== -1, '.sfv-form-actions 样式存在');
assert(playerCss.indexOf('.sfv-btn-primary') !== -1, '.sfv-btn-primary 样式存在');
assert(playerCss.indexOf('.sfv-btn-secondary') !== -1, '.sfv-btn-secondary 样式存在');
assert(playerCss.indexOf('.sfv-rules-notice') !== -1, '.sfv-rules-notice 样式存在');
assert(playerCss.indexOf('.sfv-rules-list') !== -1, '.sfv-rules-list 样式存在');
assert(playerCss.indexOf('.sfv-rule-hint') !== -1, '.sfv-rule-hint 样式存在');

// 主按钮金色实心、次按钮描边幽灵、均复用玻璃圆角 9px + 主题色
assert(/border-radius:\s*9px/.test(playerCss), '按钮沿用 9px 玻璃圆角');
assert(playerCss.indexOf('linear-gradient(135deg, rgba(var(--fc-accent-rgb)') !== -1, '主按钮金色渐变');

// 旧结构遗留清理：.sfv-src-form-row 已不再使用（HTML 已移除）
assert(playerCss.indexOf('.sfv-src-form-row') === -1, '已移除废弃 .sfv-src-form-row 样式');

// ================================================================
// D. 语法检查
// ================================================================
console.log('\n=== D. 语法检查 ===\n');
var cp = require('child_process');
function check(file) {
  var r = cp.spawnSync('node', ['--check', file]);
  var ok = r.status === 0;
  assert(ok, file + ' 语法 OK' + (ok ? '' : ' :: ' + (r.stderr || '').toString().split('\n')[0]));
}
check('public/video/fx-sources.js');
check('public/video/online.js');

// ================================================================
// E. 回归：FX 片源 tab 注入结构不变
// ================================================================
console.log('\n=== E. 回归：FX 片源 tab 注入 ===\n');
assert(fxSrcJs.indexOf("PAGE_KEY = 'sfvsource'") !== -1, '片源 tab PAGE_KEY=sfvsource');
assert(fxSrcJs.indexOf("TAB_CLASS = 'sfv-fx-tab'") !== -1, 'tab class=sfv-fx-tab');
assert(fxSrcJs.indexOf("btn.textContent = '片源'") !== -1, 'tab 文案「片源」');
assert(fxSrcJs.indexOf('setFxPanelTab') !== -1, '包装全局 setFxPanelTab 注入第 6 个 tab');

// ================================================================
// F. T102 搜索图标早期绑定（修复鸡生蛋时序 bug）
// ================================================================
console.log('\n=== F. T102 搜索图标早期绑定 ===\n');

assert(onlineJs.indexOf('initEarlyBindings') !== -1, '存在 initEarlyBindings 初始化函数');
assert(onlineJs.indexOf('_navBound') !== -1, '存在 _navBound 防重复绑定守卫');
assert(onlineJs.indexOf('DOMContentLoaded') !== -1 && onlineJs.indexOf('initEarlyBindings') !== -1,
       'DOMContentLoaded 后调用 initEarlyBindings（或立即执行）');
// 确认 bindCapsuleSearchBtn 不再仅在 ensure() 内调用
var ensureBlock = onlineJs.substring(onlineJs.indexOf('function ensure()'), onlineJs.indexOf('function ensure()') + 500);
assert(ensureBlock.indexOf('bindCapsuleSearchBtn') === -1,
       'ensure() 内不再直接调用 bindCapsuleSearchBtn（已移至初始化时）');
assert(onlineJs.indexOf('bindNavItems') !== -1 && onlineJs.indexOf('bindCapsuleSearchBtn') !== -1,
       'bindNavItems 和 bindCapsuleSearchBtn 仍在文件中定义');

// ================================================================
console.log('\n========================================');
console.log('T99 结果: ' + pass + ' 通过 / ' + fail + ' 失败');
console.log('========================================\n');
process.exit(fail === 0 ? 0 : 1);
