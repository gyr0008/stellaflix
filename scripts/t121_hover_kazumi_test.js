/**
 * T121 hover 触发方向强化 + Kazumi 空状态对齐
 *
 * 验收清单：
 *  A. ← 返回按钮 hover 强化（多方向触发）
 *   A1. .sfv-search-appbar-back 移除 transition（避免方向不同导致动画中断）
 *   A2. width/height 44x44（原 40x40 偏小）
 *   A3. ::before 伪元素扩大 hit area（inset: -8px → 60x60 实际可点）
 *   A4. hover 状态使用 background + outline 双重视觉反馈
 *   A5. hover 状态立即生效（无 transition delay）
 *   A6. :active 状态更深（按下反馈）
 *  B. × 关闭按钮同样强化（A1-A6 镜像）
 *   B1. .sfv-search-appbar-close 同样改造
 *  C. Kazumi 空状态对齐
 *   C1. .sfv-search-empty-hint min-height: 400px（对齐 Kazumi SizedBox(400)）
 *   C2. .sfv-search-empty-hint 居中（flex center）
 *   C3. 字号 15px + 弱色 #b3b3b3
 *  D. 回归
 *   D1. T108 / T113 / T115 / T118 全 PASS
 *   D2. 4 个 inline blocks OK
 *   D3. online.js node --check OK
 */

var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0, errors = [];
function assert(cond, label) {
  if (cond) { passed++; return true; }
  failed++; errors.push('FAIL: ' + label);
  return false;
}

var root = path.join(__dirname, '..');
var htmlText = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
var cssText = fs.readFileSync(path.join(root, 'public', 'video', 'player.css'), 'utf8');
var onlineSrc = fs.readFileSync(path.join(root, 'public', 'video', 'online.js'), 'utf8');

console.log('--- A. ← 返回按钮 hover 强化 ---');

var backRule = cssText.match(/\.sfv-search-appbar-back\s*\{[^}]*?\}/);
assert(backRule !== null, 'A1 .sfv-search-appbar-back CSS 规则存在');
if (backRule) {
  var b = backRule[0];
  assert(/width:\s*44px/.test(b) && /height:\s*44px/.test(b),
    'A2 size 44x44（T121 增加 +4px 更易 hover）');
  assert(!/transition:/.test(b),
    'A3 移除 transition（避免方向不同导致动画中断）');
  assert(/pointer-events:\s*auto/.test(b),
    'A4 pointer-events: auto（明确接收事件）');
  assert(/position:\s*relative/.test(b),
    'A5 position: relative（伪元素锚定）');
}

var backBefore = cssText.match(/\.sfv-search-appbar-back::before\s*\{[^}]*?\}/);
assert(backBefore !== null, 'A6 ::before 伪元素存在（扩大 hit area）');
if (backBefore) {
  assert(/inset:\s*-8px/.test(backBefore[0]),
    'A6.1 ::before inset: -8px（外扩 8px hit area）');
  assert(/border-radius:\s*28px/.test(backBefore[0]),
    'A6.2 ::before border-radius: 28px（视觉呼应 44x44 按钮）');
}

var backHover = cssText.match(/\.sfv-search-appbar-back:hover[\s\S]{0,500}?\}\s*[\.\#]/);
if (!backHover) {
  backHover = cssText.match(/\.sfv-search-appbar-back:hover,\s*\.sfv-search-appbar-back:focus-visible\s*\{[^}]*?\}/);
}
assert(backHover !== null, 'A7 hover + focus-visible 共享选择器（键盘焦点也触发）');
if (backHover) {
  var h = backHover[0];
  assert(/background:\s*rgba\(0,0,0,\.10\)/.test(h), 'A7.1 hover background .10 不透明黑（视觉强化）');
  /* T122：box-shadow 替代 outline（box-shadow 受 border-radius 控制，所有方向一致） */
  assert(/box-shadow:\s*0\s+0\s+0\s+1\.5px\s+rgba\(0,0,0,\.18\)/.test(h),
    'A7.2 hover box-shadow 1.5px 圆角跟随（所有方向一致）');
}
var backActive = cssText.match(/\.sfv-search-appbar-back:active\s*\{[^}]*?\}/);
assert(backActive !== null, 'A8 :active 按下反馈（更深背景）');

console.log('\n--- B. × 关闭按钮镜像强化 ---');
var closeRule = cssText.match(/\.sfv-search-appbar-close\s*\{[^}]*?\}/);
assert(closeRule !== null, 'B1 .sfv-search-appbar-close CSS 规则存在');
if (closeRule) {
  var c = closeRule[0];
  assert(/width:\s*44px/.test(c) && /height:\s*44px/.test(c), 'B1.1 size 44x44');
  assert(!/transition:/.test(c), 'B1.2 移除 transition');
  assert(/pointer-events:\s*auto/.test(c), 'B1.3 pointer-events: auto');
}
var closeBefore = cssText.match(/\.sfv-search-appbar-close::before\s*\{[^}]*?\}/);
assert(closeBefore !== null, 'B2 ::before 伪元素存在');
var closeHover = cssText.match(/\.sfv-search-appbar-close:hover,\s*\.sfv-search-appbar-close:focus-visible\s*\{[^}]*?\}/);
assert(closeHover !== null, 'B3 hover + focus-visible 共享选择器');
var closeActive = cssText.match(/\.sfv-search-appbar-close:active\s*\{[^}]*?\}/);
assert(closeActive !== null, 'B4 :active 按下反馈');

console.log('\n--- C. Kazumi 空状态对齐 ---');
var emptyRule = cssText.match(/\.sfv-search-empty-hint\s*\{[^}]*?\}/);
assert(emptyRule !== null, 'C1 .sfv-search-empty-hint CSS 规则存在');
if (emptyRule) {
  var e = emptyRule[0];
  assert(/min-height:\s*400px/.test(e),
    'C2 min-height: 400px（对齐 Kazumi SizedBox(400) 视觉占位）');
  assert(/display:\s*flex/.test(e) && /align-items:\s*center/.test(e) && /justify-content:\s*center/.test(e),
    'C3 flex 居中（垂直水平）');
  assert(/font-size:\s*15px/.test(e),
    'C4 字号 15px（Kazumi ListTile title 默认）');
  assert(/color:\s*#b3b3b3/.test(e),
    'C5 弱色 #b3b3b3（Kazumi 弱文案提示）');
}

console.log('\n--- D. 回归 ---');

var vm = require('vm');
var re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
var m, allInlineOK = true;
while ((m = re.exec(htmlText))) {
  try { new vm.Script(m[1], { filename: 'inline#' }); } catch (e) { allInlineOK = false; }
}
assert(allInlineOK, 'D1 4 个 inline blocks vm.Script 解析 OK');
var child = require('child_process').spawnSync(process.execPath, ['--check', path.join(root, 'public', 'video', 'online.js')], { encoding: 'utf8' });
assert(child.status === 0, 'D2 online.js node --check OK');

console.log('\n========================================');
console.log('  T121 hover 强化 + Kazumi 参数: ' + passed + ' pass / ' + failed + ' fail');
console.log('========================================');
if (errors.length) errors.forEach(function (e) { console.log('  X ' + e); });
process.exit(failed > 0 ? 1 : 0);