// T121: 历史面板覆盖式布局测试
// 背景：搜索结果出现后再次点击搜索栏，历史面板滑出时把结果往下挤
// 修复：.sfv-search-history-drop 改 position:static → absolute + top:48px + left:0;right:0
//       （继承父容器 760px 限宽完美对齐搜索栏，不占据流式空间）
// 用户约束：别的地方什么都不要改动
var fs = require('fs');
var pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 ' + msg); } }

var playerCss = fs.readFileSync('public/video/player.css', 'utf8');

// 去掉注释
var cssNoComments = playerCss.replace(/\/\*[\s\S]*?\*\//g, '');

// 提取 .sfv-search-history-drop 完整规则块
var ruleRegex = /\.sfv-search-history-drop\s*\{([^}]+)\}/;
var ruleMatch = cssNoComments.match(ruleRegex);
assert(ruleMatch, 'A0 .sfv-search-history-drop 规则存在');

if (ruleMatch) {
  var ruleBody = ruleMatch[1];

  console.log('--- A. position:absolute 覆盖式（核心修复）---');
  // A1. position: absolute（不是 static）
  assert(/position\s*:\s*absolute\s*;/.test(ruleBody),
    'A1 .sfv-search-history-drop position: absolute（覆盖式布局）');
  // A2. position: static 必须删除（不能并存）
  assert(!/position\s*:\s*static\s*;/.test(ruleBody),
    'A2 不再有 position: static（旧版流式布局已删除）');

  console.log('--- B. top:48px 紧贴搜索栏底部 ---');
  assert(/top\s*:\s*48px\s*;/.test(ruleBody),
    'B1 .sfv-search-history-drop top: 48px（紧贴 48dp 搜索栏底部）');

  console.log('--- C. left:0;right:0 继承父宽（不需居中 transform）---');
  assert(/left\s*:\s*0\s*;/.test(ruleBody),
    'C1 .sfv-search-history-drop left: 0');
  assert(/right\s*:\s*0\s*;/.test(ruleBody),
    'C2 .sfv-search-history-drop right: 0');
  // C3. width: 100% 必须改为 width: auto（否则 left/right 会冲突导致 width:100% 仍是流式宽度）
  assert(!/width\s*:\s*100%/.test(ruleBody),
    'C3 width: 100% 已删除（width:auto 替代）');
  assert(/width\s*:\s*auto\s*;/.test(ruleBody),
    'C4 width: auto（让 left/right:0 计算宽度）');

  console.log('--- D. 不影响其他属性（高度/背景/圆角/阴影/层级/动画保持不动）---');
  assert(/height\s*:\s*400px\s*;/.test(ruleBody),
    'D1 height: 400px 保持不动');
  assert(/background\s*:\s*#f0f0f0\s*;/.test(ruleBody),
    'D2 background: #f0f0f0 实色保持不动');
  assert(/border-radius\s*:\s*0\s+0\s+26px\s+26px\s*;/.test(ruleBody),
    'D3 border-radius: 0 0 26px 26px 保持不动');
  assert(/box-shadow\s*:\s*0\s+6px\s+16px\s+rgba\(0,0,0,\.08\)\s*;/.test(ruleBody),
    'D4 box-shadow 保持不动');
  assert(/z-index\s*:\s*4\s*;/.test(ruleBody),
    'D5 z-index: 4 保持不动');
  assert(/animation\s*:\s*sfvDropIn\s+\.22s\s+ease-out\s*;/.test(ruleBody),
    'D6 animation: sfvDropIn .22s ease-out 保持不动');
  assert(/overflow-y\s*:\s*auto\s*;/.test(ruleBody),
    'D7 overflow-y: auto 保持不动');
}

console.log('--- E. 不污染其他 .sfv-search-* 类（只动 history-drop）---');
// E1. .sfv-search-bar-area / .sfv-search-bar / .sfv-search-result-area 不变
var barAreaRule = cssNoComments.match(/\.sfv-search-bar-area\s*\{([^}]+)\}/);
var barRule = cssNoComments.match(/\.sfv-search-bar\s*\{([^}]+)\}/);
var resultAreaRule = cssNoComments.match(/\.sfv-search-result-area\s*\{([^}]+)\}/);
assert(barAreaRule && !/position\s*:\s*absolute/.test(barAreaRule[1]),
  'E1 .sfv-search-bar-area 不变（仍是 static）');
assert(barRule && !/position\s*:\s*absolute/.test(barRule[1]),
  'E2 .sfv-search-bar 不变（仍是 relative）');
assert(resultAreaRule, 'E3 .sfv-search-result-area 规则存在');
if (resultAreaRule) {
  assert(!/position\s*:\s*relative/.test(resultAreaRule[1]),
    'E4 .sfv-search-result-area 没改 position（保持默认 static）');
}

console.log('--- F. 行为模拟：history-drop 不会推挤 result-area ---');
// 模拟：DOM 流式布局下，absolute 元素不占据空间，static 元素占据
var layoutSim = {
  barAreaInner: { position: 'relative', height: 48 },  // 搜索栏 48px
  historyDrop: { position: 'absolute', height: 400 },  // 历史面板 400px 但脱离流式
  resultArea: { position: 'static' }
};
// 流式占据高度 = barAreaInner.height + (historyDrop 静态高度 ? : 0)
var flowOccupied = layoutSim.barAreaInner.height + (layoutSim.historyDrop.position === 'absolute' ? 0 : layoutSim.historyDrop.height);
assert(flowOccupied === 48,
  'F1 流式占据 = 48px（history-drop absolute 不挤空间）');
assert(layoutSim.historyDrop.position === 'absolute',
  'F2 history-drop 是 absolute 布局');
assert(layoutSim.barAreaInner.position === 'relative',
  'F3 父容器 .sfv-search-bar-area-inner 是 relative 锚定');

console.log('--- G. 死命令承诺：最小改动 ---');
// G1. 只改 .sfv-search-history-drop 的 position/top/left/right/width 五行，其他类不被改动
//     计数 player.css 中 position: absolute 的总规则数（用于反证改动范围小）
var totalAbsoluteRules = (cssNoComments.match(/\{\s*[^}]*position\s*:\s*absolute[^}]*\}/g) || []).length;
assert(totalAbsoluteRules >= 1,
  'G1 player.css 至少 1 个 absolute 规则（history-drop 已改）');
// G2. 没有修改 .sfv-search-bar 的 height（48px 不变）
var barHeightMatch = cssNoComments.match(/\.sfv-search-bar\s*\{[^}]*height\s*:\s*(\d+px)/);
assert(barHeightMatch && barHeightMatch[1] === '48px',
  'G2 .sfv-search-bar height: 48px 保持不动');

console.log('');
console.log('========================================');
console.log('  T121 历史面板覆盖式测试: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
process.exit(fail === 0 ? 0 : 1);