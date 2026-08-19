// T120: 影视态海报 CSS + chip 顺序测试
// 背景：T119 修复后截图2 左侧空白（CSS 缺失 + chip 改造未生效）
// 修复：(1) player.css 补 .sfv-poster-default* / .sfv-poster-movie 完整 CSS（B2 emoji 96px + 文字 20px）
//       (2) renderVideoPoster 不清 innerHTML，保留 .home-poster-frame / .home-poster-reflection（E1）
//       (3) restructurePosterActionsForVideo 强制重写（D1，去 dataset 守卫）
//       (4) chip 顺序 C2：换图片 → 改文案 → 从 TMDB 选 → 重置 → 工具箱
var fs = require('fs');
var pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 ' + msg); } }

var home = fs.readFileSync('public/video/home.js', 'utf8');
var playerCss = fs.readFileSync('public/video/player.css', 'utf8');
var indexHtml = fs.readFileSync('public/index.html', 'utf8');

console.log('--- A. CSS 完整性（B2 emoji 96px + 文字 20px）---');
// A1. 默认封面 CSS 存在
assert(/\.home-poster-media\.sfv-poster-default\s*\{/.test(playerCss), 'A1.1 .home-poster-media.sfv-poster-default CSS 规则存在');
assert(/\.sfv-poster-default-inner/.test(playerCss), 'A1.2 .sfv-poster-default-inner CSS 规则存在');
assert(/\.sfv-poster-default-emoji/.test(playerCss), 'A1.3 .sfv-poster-default-emoji CSS 规则存在');
assert(/\.sfv-poster-default-text/.test(playerCss), 'A1.4 .sfv-poster-default-text CSS 规则存在');

// A2. emoji 96px + 文字 20px
assert(/\.sfv-poster-default-emoji\s*\{[^}]*font-size\s*:\s*96px/.test(playerCss), 'A2.1 默认封面 emoji font-size: 96px');
assert(/\.sfv-poster-default-text\s*\{[^}]*font-size\s*:\s*20px/.test(playerCss), 'A2.2 默认封面文字 font-size: 20px');

// A3. 真实海报 CSS
assert(/\.home-poster-media\.sfv-poster-movie\s*\{/.test(playerCss), 'A3.1 .home-poster-media.sfv-poster-movie CSS 规则存在');
assert(/\.sfv-poster-movie\s*\{[^}]*background-image\s*:\s*var\(--home-poster-image\)/.test(playerCss), 'A3.2 .sfv-poster-movie 背景图用 var(--home-poster-image)');
assert(/\.sfv-poster-movie-overlay/.test(playerCss), 'A3.3 .sfv-poster-movie-overlay CSS 规则存在');

// A4. 暗色玻璃渐变
assert(/\.home-poster-media\.sfv-poster-default\s*\{[^}]*linear-gradient/.test(playerCss), 'A4.1 默认封面有暗色玻璃渐变背景');

// A5. 居中布局（flex center）
assert(/\.home-poster-media\.sfv-poster-default\s*\{[^}]*display\s*:\s*flex[^}]*align-items\s*:\s*center[^}]*justify-content\s*:\s*center/.test(playerCss), 'A5.1 默认封面 flex 居中布局');

console.log('--- B. E1：装饰保留（.home-poster-frame / .home-poster-reflection）---');
// B1. 默认封面隐藏 frame/reflection（避免和 emoji 叠加冲突）
assert(/\.home-poster-media\.sfv-poster-default\s+\.home-poster-frame[\s\S]*?display\s*:\s*none/.test(playerCss),
  'B1.1 默认封面下 .home-poster-frame 隐藏');
assert(/\.home-poster-media\.sfv-poster-default\s+\.home-poster-reflection[\s\S]*?display\s*:\s*none/.test(playerCss),
  'B1.2 默认封面下 .home-poster-reflection 隐藏');

// B2. 真实海报也隐藏 frame/reflection（不混音乐装饰）
assert(/\.home-poster-media\.sfv-poster-movie\s+\.home-poster-frame[\s\S]*?display\s*:\s*none/.test(playerCss),
  'B2.1 真实海报下 .home-poster-frame 隐藏');

// B3. E1 关键：音乐态的 frame/reflection 默认仍可见（无 sfv-poster-* 类时）
//     去掉 CSS 注释后，逐行检测是否存在"独立"的 .home-poster-reflection{display:none}
//     "独立"指选择器行（去前导空白）严格以 .home-poster-reflection 开头，不是复合选择器子段
var cssNoCommentsForB3 = playerCss.replace(/\/\*[\s\S]*?\*\//g, '');
var lines = cssNoCommentsForB3.split('\n');
var independentReflectionHidden = false;
for (var li = 0; li < lines.length; li++) {
  var line = lines[li].trim();
  // 匹配选择器行：.home-poster-reflection { 或 .home-poster-reflection,
  if (/^\.home-poster-reflection\s*[\{,]/.test(line)) {
    independentReflectionHidden = true;
    break;
  }
}
assert(!independentReflectionHidden,
  'B3.1 player.css 不含独立以".home-poster-reflection"开头的{display:none}规则（音乐态下仍可见）');
//     复合选择器 .home-poster-media.sfv-poster-* .home-poster-reflection{display:none} 仅在影视态下隐藏 frame/reflection — 这是正确的设计
var compositeHiddenInMovie = /\.home-poster-media\.sfv-poster-(default|movie)\s+\.home-poster-reflection\s*\{\s*display\s*:\s*none/.test(cssNoCommentsForB3);
assert(compositeHiddenInMovie,
  'B3.2 复合选择器正确：影视态下 .home-poster-reflection 用 display:none 隐藏');

console.log('--- C. D1：restructurePosterActionsForVideo 强制重写（无 dataset 守卫）---');
// C1. 移除 dataset.sfvVideoRestructured 守卫
assert(!/dataset\.sfvVideoRestructured\s*===\s*['"]1['"]/.test(home),
  'C1.1 home.js 不再用 dataset.sfvVideoRestructured 守卫');
assert(!/actions\.dataset\.sfvVideoRestructured\s*=\s*['"]1['"]/.test(home),
  'C1.2 home.js 不写 dataset.sfvVideoRestructured = "1"');
// C2. 每次 render 强制重写（结构上每次都遍历 btns + 重写 onclick）
var funcBody = home.match(/function restructurePosterActionsForVideo\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
assert(funcBody && !/dataset[\s\S]{0,200}?return/.test(funcBody[1]),
  'C2.1 函数体内无 dataset 守卫早 return');

console.log('--- D. C2：chip 顺序 = 换图片 → 改文案 → 从 TMDB 选 → 重置 → 工具箱 ---');
// D1. 插入位置：editBtn 之后、resetBtn 之前
assert(/insertBefore\([\s\S]*?tmdbBtn[\s\S]*?resetBtn\)/.test(home),
  'D1.1 "从 TMDB 选"按钮通过 insertBefore(tmdbBtn, resetBtn) 插入到"重置"之前');
// D2. 旧版（T119）插在"换图片"之后的代码必须删除
assert(!/chooseBtn\.parentNode\.insertBefore\([\s\S]*?chooseBtn\.nextSibling/.test(home),
  'D2.1 旧版"从 TMDB 选"插在"换图片"之后的代码已删除');

// D3. 5 个 chip 文本检查（在 home.js 重写 onclick 的逻辑里）
assert(/txt\s*===\s*['"]换图片['"]/.test(home), 'D3.1 重写"换图片" onclick');
assert(/txt\s*===\s*['"]改文案['"]|txt\s*===\s*['"]用当前封面['"]|txt\s*===\s*['"]重置['"]/.test(home), 'D3.2 处理"改文案"/"用当前封面"/"重置" chip');

// D4. data-sfv-action="tmdb-poster" 标记去重
assert(/data-sfv-action="tmdb-poster"/.test(home), 'D4.1 "从 TMDB 选"按钮带 data-sfv-action="tmdb-poster" 标记（避免重复插入）');

console.log('--- E. E1 + renderVideoPoster：保留 frame/reflection，不清 innerHTML ---');
// E1. renderVideoPoster 不再用 media.innerHTML = '' 或 media.innerHTML = '...'
var renderPosterBody = home.match(/function renderVideoPoster\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/);
assert(renderPosterBody, 'E1.1 renderVideoPoster 函数存在');
assert(!/media\.innerHTML\s*=\s*['"]/.test(renderPosterBody[1]),
  'E1.2 renderVideoPoster 不再 media.innerHTML = "..."');

// E2. 改为 querySelector + removeChild 删除旧的影视子元素（不删 frame/frame reflection）
assert(/querySelector\(['"]\.sfv-poster-default-inner['"]\)/.test(renderPosterBody[1]),
  'E2.1 移除旧的 .sfv-poster-default-inner');
assert(/querySelector\(['"]\.sfv-poster-movie-overlay['"]\)/.test(renderPosterBody[1]),
  'E2.2 移除旧的 .sfv-poster-movie-overlay');

// E3. 用 createElement + appendChild 注入（不是 innerHTML 字符串）
assert(/createElement\(['"]div['"]\)/.test(renderPosterBody[1]) && /appendChild/.test(renderPosterBody[1]),
  'E3.1 renderVideoPoster 用 createElement + appendChild 注入（不破坏 frame/reflection）');

// E4. emoji 用 unicode 转义而非直接 🎬 字符（避免编码问题）
assert(/\\uD83C\\uDFAC/.test(renderPosterBody[1]),
  'E4.1 emoji 用 \\uD83C\\uDFAC unicode 转义（避免不同编码导致乱码）');

console.log('--- F. 死命令承诺：双态互不干扰 + 视觉可见 ---');
// F1. CSS 不污染音乐态（提取所有 .sfv-poster-* 规则块，验证它们都在 .home-poster-media.sfv-poster-* 前缀下）
//     先去掉 CSS 注释（/* ... */），再按规则提取 selector
var cssNoComments = playerCss.replace(/\/\*[\s\S]*?\*\//g, '');
var sfvPosterSelectors = [];
var ruleRegex = /([^{}]+)\{[^{}]*\}/g;
var match;
while ((match = ruleRegex.exec(cssNoComments)) !== null) {
  var selector = match[1].trim();
  if (/sfv-poster-/.test(selector)) sfvPosterSelectors.push(selector);
}
var unprefixedRules = sfvPosterSelectors.filter(function (sel) {
  if (/^\.home-poster-media\.sfv-poster-/.test(sel)) return false;       // OK：影视态前缀
  if (/^\.sfv-poster-movie-overlay/.test(sel)) return false;             // OK：受 .home-poster-media.sfv-poster-movie 控制
  if (/^\.home-poster-actions/.test(sel)) return false;                  // OK：chip 微调
  return true;
});
assert(unprefixedRules.length === 0,
  'F1.1 所有 .sfv-poster-* CSS 规则都在 .home-poster-media.sfv-poster-* 前缀下，不污染音乐态（违规：' + unprefixedRules.join(' | ') + ')');

// F2. restoreMusic 必须能正确还原 .home-poster-media（含 frame/frame reflection）
assert(/snap\.posterMedia/.test(home),
  'F2.1 captureMusicDefaults 拍 .home-poster-media 快照（含 frame/reflection 子元素）');
assert(/innerHTML\s*=/.test(home.match(/applyMusicDefaults[\s\S]*?function[\s\S]*?\n\s*\}/)[0]),
  'F2.2 applyMusicDefaults 还原 .home-poster-media innerHTML（含音乐态装饰）');

// F3. home.js 语法 0 错误
var vm = require('vm');
try { new vm.Script(home, { filename: 'home.js' }); assert(true, 'F3.1 home.js 语法 OK'); }
catch (e) { assert(false, 'F3.1 home.js SyntaxError: ' + e.message); }

console.log('');
console.log('========================================');
console.log('  T120 影视态海报 CSS + chip 顺序测试: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
process.exit(fail === 0 ? 0 : 1);