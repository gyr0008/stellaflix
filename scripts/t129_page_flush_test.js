/**
 * T129 影视 tab 页「贴边铺满视口」专项测试（2026-08-03）
 *
 * 用户反馈：电影/动漫等 tab 页的导航栏+内容区被渲染成一个有圆角/内边距的「悬浮玻璃面板」，
 * 导致页面顶部（面板上方）露出星空背景，没有贴满视口。
 *
 * 根因与修复：
 *  A. 导航 #sfv-nav 复用音乐态 #search-box 玻璃容器。T129 曾改为实色全宽直角顶栏；
 *     T131 按用户要求恢复为「原始 Mineradio 圆角玻璃全宽栏」：全宽贴顶(top/left/right:0; width:100%; margin:0)
 *     + border-radius:22px + 玻璃模糊(glass-bg/glass-border/glass-shadow)，非 stellaflix-app 居中胶囊。
 *     后续再将 height(56→58px) 与水平内边距(0 12px→0 20px) 对齐到音乐态搜索栏（2026-08-03 20:27）。
 *  B. 内容覆盖层 .sfv-browse 原为半透明玻璃(rgba(8,10,16,.82)+blur) → 星空透出，
 *     --page 模式改为实色铺底(var(--sfv-page-bg))、padding:0、border-radius:0、backdrop-filter:none。
 *  C. applyVideoPageBg 同步把 --sfv-page-bg 写到 overlay（custom tint 与默认 #f2f4f7 兜底）。
 *  D. getContentTop 去掉 +2，使内容区与固定顶栏精确相接，不留星空缝隙。
 */
var fs = require('fs');
var playerCss = fs.readFileSync('public/video/player.css', 'utf8');
var onlineJs = fs.readFileSync('public/video/online.js', 'utf8');

var pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// 提取某个顶层选择器块（含嵌套），返回 {start, end, body}
function blockOf(sel) {
  var i = playerCss.indexOf(sel + ' {');
  if (i < 0) return null;
  var bodyStart = playerCss.indexOf('{', i) + 1;
  var depth = 1, j = bodyStart;
  while (j < playerCss.length && depth > 0) {
    if (playerCss[j] === '{') depth++;
    else if (playerCss[j] === '}') depth--;
    j++;
  }
  return { start: i, end: j, body: playerCss.slice(bodyStart, j - 1) };
}

console.log('--- A. 影视态导航栏 flush 铺满（原始圆角玻璃全宽栏，T131）---');
var navBlock = blockOf('body.video-space-active #search-box');
assert(!!navBlock, 'A1. body.video-space-active #search-box 规则存在');
if (navBlock) {
  assert(/position:\s*fixed/.test(navBlock.body), 'A2. 导航栏 position: fixed');
  assert(/top:\s*0/.test(navBlock.body) && /left:\s*0/.test(navBlock.body) && /right:\s*0/.test(navBlock.body),
    'A3. 导航栏贴视口顶/左/右 (top/left/right:0)');
  assert(/width:\s*100%/.test(navBlock.body), 'A4. 导航栏 width: 100%（全宽 flush）');
  assert(/border-radius:\s*22px/.test(navBlock.body), 'A5. 导航栏圆角 (border-radius:22px)');
  assert(/margin:\s*0\b/.test(navBlock.body), 'A6. 导航栏无边距 (margin:0)');
  assert(/backdrop-filter:\s*blur/.test(navBlock.body), 'A7. 导航栏恢复玻璃模糊 (backdrop-filter:blur)');
  assert(/box-shadow:\s*var\(--glass-shadow\)/.test(navBlock.body), 'A8. 导航栏恢复阴影 (box-shadow:var(--glass-shadow))');
  assert(/background:\s*var\(--glass-bg\)/.test(navBlock.body), 'A9. 导航栏为玻璃背景 var(--glass-bg)');
  assert(!/border-radius:\s*0\b/.test(navBlock.body), 'A10. 导航栏不再为实色直角 (无 border-radius:0)');
  assert(/z-index:\s*2147482100/.test(navBlock.body), 'A11. 导航栏 z-index 高于覆盖层(2147482000)');
  assert(/height:\s*58px/.test(navBlock.body), 'A12. 导航栏高度与音乐态对齐 (height:58px)');
  assert(/padding:\s*0\s+20px/.test(navBlock.body), 'A13. 导航栏水平内边距与音乐态对齐 (padding:0 20px)');
}

console.log('--- B. 内容覆盖层 --page 实色铺满、无悬浮面板 ---');
var pageBlock = blockOf('.sfv-browse.sfv-browse--page');
assert(!!pageBlock, 'B1. .sfv-browse.sfv-browse--page 规则存在');
if (pageBlock) {
  assert(/padding:\s*0\b/.test(pageBlock.body), 'B2. 覆盖层根容器 padding:0（贴边）');
  assert(/max-width:\s*none/.test(pageBlock.body), 'B3. 覆盖层无 max-width 限制');
  assert(/width:\s*100%/.test(pageBlock.body), 'B4. 覆盖层 width:100%');
  assert(/background:\s*var\(--sfv-page-bg/.test(pageBlock.body), 'B5. 覆盖层实色铺底 var(--sfv-page-bg)');
  assert(/backdrop-filter:\s*none/.test(pageBlock.body), 'B6. 覆盖层无玻璃模糊 (backdrop-filter:none)');
  assert(/border-radius:\s*0\b/.test(pageBlock.body), 'B7. 覆盖层无圆角 (border-radius:0)');
}
var bodyBlock = blockOf('.sfv-browse--page .sfv-browse-body');
assert(!!bodyBlock, 'B8. .sfv-browse--page .sfv-browse-body 规则存在');
if (bodyBlock) {
  assert(/padding:\s*18px 22px 22px/.test(bodyBlock.body), 'B9. 内容区内部内边距 18px 22px 22px');
}
var gridIdx = playerCss.indexOf('.sfv-browse--page .sfv-grid,');
assert(gridIdx >= 0, 'B10. .sfv-browse--page .sfv-grid 限宽规则存在');
if (gridIdx >= 0) {
  var seg = playerCss.slice(gridIdx, gridIdx + 400);
  assert(/max-width:\s*1400px/.test(seg) && /margin-left:\s*auto/.test(seg),
    'B11. 内容网格超宽屏居中限宽 1400（对齐参考「电影」页）');
}

console.log('--- C. 覆盖层自身持有页面底色兜底 ---');
var baseBlock = blockOf('.sfv-browse');
assert(!!baseBlock, 'C1. .sfv-browse 基础规则存在');
if (baseBlock) {
  assert(/--sfv-page-bg:\s*#f2f4f7/.test(baseBlock.body), 'C2. 覆盖层默认 --sfv-page-bg:#f2f4f7（兜底实色）');
}

console.log('--- D. applyVideoPageBg 同步写到 overlay ---');
assert(/overlay\.style\.setProperty\('--sfv-page-bg'/.test(onlineJs), 'D1. 源码：custom tint 时 overlay 写入 --sfv-page-bg');
assert(/overlay\.style\.removeProperty\('--sfv-page-bg'\)/.test(onlineJs), 'D2. 源码：非 custom 时 overlay 复位 --sfv-page-bg');

console.log('--- E. getContentTop 与顶栏精确相接 ---');
assert(/return Math\.ceil\(r\.bottom\);/.test(onlineJs), 'E1. 源码：去掉 +2，内容区与顶栏精确相接');

console.log('\n========================================');
console.log('  T129 影视 tab 页贴边铺满测试: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
process.exit(fail ? 1 : 0);
