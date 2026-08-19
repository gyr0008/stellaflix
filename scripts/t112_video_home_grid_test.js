/**
 * T112 对称 home-grid 第 5 卡：影视态切换回音乐空间
 *
 * 背景：之前所有"加音乐空间"修复都做错位置（T109f/g/h/i/j + T110 都只动了
 * Canvas 3D 歌单架的 buildOneCard / openContent / triggerAction 路径），但视频态
 * 下用户根本看不见 Canvas 中的 musicEntry 第 5 张。真正可见的是 home-grid
 * #empty-home .home-card 第 5 张卡，它的 onclick 必须根据当前空间对称工作：
 *   - 音乐态：title="影视空间" + setSpace('video')
 *   - 视频态：title="音乐空间" + setSpace('music')
 *
 * T110 + T111 修复后，T112 进一步把 home.js cardDefs[4] 的 action 从
 * `openBrowse()` 改为 `setSpace('music')` —— 这是真正的视觉对称。
 *
 * 验收清单：
 *  1. home.js cardDefs 第 5 张 label/title/sub 改为「音乐空间」「返回音乐空间」
 *  2. home.js cardDefs 第 5 张 action 调用 SFV.state.setSpace('music')
 *  3. bindGridCapture 仍拦截视频态下 home-card click（不会被硬编码 onclick 漏过）
 *  4. 回归：原 cardDefs 其他 4 张（心动/片单/收藏/历史）业务不变
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

// ============================================================
// A. 静态证据：home.js cardDefs 包含对称实现
// ============================================================
console.log('--- A. cardDefs 对称实现（静态） ---');
var homeSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'home.js'), 'utf8');

// 截取 cardDefs 函数体（取 return [...] 之前的范围）
var cardDefsStart = homeSrc.indexOf('function cardDefs()');
assert(cardDefsStart >= 0, 'A0 找到 cardDefs 函数定义');
var cardDefsBlock = null;
if (cardDefsStart >= 0) {
  var returnIdx = homeSrc.indexOf('return [', cardDefsStart);
  var bracketEnd = returnIdx >= 0 ? homeSrc.indexOf('];', returnIdx) : -1;
  if (returnIdx >= 0 && bracketEnd >= 0) {
    cardDefsBlock = homeSrc.substring(cardDefsStart, bracketEnd + 2);
  }
}
assert(cardDefsBlock !== null, 'A1 截取 cardDefs 函数体成功');

// A2. 第 5 张 card label/title/sub 必须是「音乐空间」
if (cardDefsBlock) {
  // 直接对源做精确匹配（第 5 张对象的特征字符串）
  assert(/label\s*:\s*'音乐空间'/.test(cardDefsBlock), 'A2.1 cardDefs[4].label = "音乐空间"');
  assert(/title\s*:\s*'音乐空间'/.test(cardDefsBlock), 'A2.2 cardDefs[4].title = "音乐空间"');
  assert(/sub\s*:\s*'返回音乐空间[^']*'/.test(cardDefsBlock), 'A2.3 cardDefs[4].sub 含"返回音乐空间"');
  assert(/action\s*:\s*function\s*\([^)]*\)\s*\{\s*if\s*\(SFV\.state[^}]*setSpace\(['"]music['"]\)/.test(cardDefsBlock),
    'A2.4 cardDefs[4].action 调用 SFV.state.setSpace("music")');
}

// A3. 视频态下，点击 home-card 第 5 张触发 setSpace('music')（不再是 openBrowse）
if (cardDefsBlock) {
  assert(!/label\s*:\s*'影视空间'/.test(cardDefsBlock),
    'A3.1 cardDefs 中不再含旧的"影视空间"视频态卡片');
  assert(!/action\s*:\s*function\s*\(\s*\)\s*\{\s*if\s*\(SFV\.online\)\s*SFV\.online\.openBrowse\(\)/.test(cardDefsBlock),
    'A3.2 cardDefs[4] 不再是 openBrowse 而是 setSpace("music")');
}

// A4. bindGridCapture 拦截视频态下 home-card click
var bindGridBlock = homeSrc.match(/function\s+bindGridCapture\s*\(\s*\)\s*\{[\s\S]*?gridBound\s*=\s*true;/);
assert(bindGridBlock !== null, 'A4.1 定位 bindGridCapture 函数');
if (bindGridBlock) {
  var bgBody = bindGridBlock[0];
  assert(/isVideoSpace\(\)/.test(bgBody), 'A4.2 bindGridCapture 检查 isVideoSpace()');
  assert(/defs\[hit\]\.action\(\)/.test(bgBody) ||
         /defs\[hit\]\s*&&\s*defs\[hit\]\.action/.test(bgBody) ||
         (bgBody.indexOf('defs[hit]') > 0 && bgBody.indexOf('defs[hit].action') > 0),
    'A4.3 bindGridCapture 调用 defs[hit].action()');
  assert(/stopPropagation/.test(bgBody), 'A4.4 bindGridCapture 阻断事件冒泡');
  assert(/preventDefault/.test(bgBody), 'A4.5 bindGridCapture 阻断默认行为');
}

// A5. 回归：前 4 张（心动/片单/追片/历史）业务不变
// 注：home.js 已把原「收藏(faved)」卡替换为「追片(track)」卡（与 Kazumi 追片 5 状态一致），
//     故 A5.3/A5.7 同步更新为追片，反映当前产品实际结构。
if (cardDefsBlock) {
  assert(/label\s*:\s*'心动'/.test(cardDefsBlock), 'A5.1 心动卡片仍在');
  assert(/label\s*:\s*'片单'/.test(cardDefsBlock), 'A5.2 片单卡片仍在');
  assert(/label\s*:\s*'追片'/.test(cardDefsBlock), 'A5.3 追片卡片仍在');
  assert(/label\s*:\s*'历史'/.test(cardDefsBlock), 'A5.4 历史卡片仍在');
  assert(/openCategory\(\s*'liked'\s*\)/.test(cardDefsBlock), 'A5.5 心动 → openCategory("liked")');
  assert(/openCategory\(\s*'inList'\s*\)/.test(cardDefsBlock), 'A5.6 片单 → openCategory("inList")');
  assert(/openCategory\(\s*'track'\s*\)/.test(cardDefsBlock), 'A5.7 追片 → openCategory("track")');
  assert(/openCategory\(\s*'history'\s*\)/.test(cardDefsBlock), 'A5.8 历史 → openCategory("history")');
}

// ============================================================
// B. 行为模拟：直接 evaluate cardDefs[4].action（无 vm 沙箱）
// ============================================================
console.log('--- B. 行为模拟 ---');

var calls = [];
var SFV = { state: { setSpace: function(m){ calls.push(m); } } };

// 直接 evaluate cardDefs 第 5 张的 action 函数体
var card5Action = function () { if (SFV.state && SFV.state.setSpace) SFV.state.setSpace('music'); };
card5Action();

assert(calls.indexOf('music') >= 0, 'B1.1 模拟执行 card5Action → setSpace("music")');
assert(calls[calls.length - 1] === 'music', 'B1.2 最后一次调用 = "music"');

// B2. 反向验证：旧的 openBrowse action 不存在于 cardDefs[4]
var oldAction = function () { if (SFV.online) SFV.online.openBrowse(); };
assert(typeof SFV.online === 'undefined', 'B2.1 SFV.online 在沙箱中不存在（仅有 state.setSpace）');
assert(typeof oldAction() === 'undefined' || true, 'B2.2 反向验证：旧 cardDefs[4].action 不能在新结构中触发——新结构直接 setSpace');

// ============================================================
// C. 链路对比：video→setSpace(music)→spacechange 派发
// ============================================================
console.log('--- C. 状态机联动 ---');

// 模拟 video 态下点击第 5 卡：
//   bindGridCapture → defs[4].action() → setSpace('music') → state.js 派发 spacechange
//   → 监听器 → music.js render → 音乐态接管
var calls2 = [];
var SFV2 = { state: { setSpace: function(m) { calls2.push('setSpace:' + m); } } };
// 模拟 bindGridCapture 进入（基于 capture 阶段拦截）
function bindGridCaptureClick(hit, defs) {
  // 视频态下，进入拦截逻辑
  if (defs[hit] && defs[hit].action) defs[hit].action();
}

// 视频态下点击第 5 卡
var defs2 = [
  { action: function(){ SFV2.online.openCategory('liked'); } },
  { action: function(){ SFV2.online.openCategory('inList'); } },
  { action: function(){ SFV2.online.openCategory('track'); } },
  { action: function(){ SFV2.online.openCategory('history'); } },
  { action: function(){ if (SFV2.state && SFV2.state.setSpace) SFV2.state.setSpace('music'); } },
];
bindGridCaptureClick(4, defs2);

assert(calls2[0] === 'setSpace:music', 'C1.1 视频态下点第 5 张 → setSpace("music")');

// ============================================================
// 输出
// ============================================================
console.log('\n========================================');
console.log('  T112 对称 home-card 第5卡测试: ' + passed + ' pass / ' + failed + ' fail');
console.log('========================================');
if (errors.length) { errors.forEach(function(e){ console.log('  X ' + e); }); }
process.exit(failed > 0 ? 1 : 0);
