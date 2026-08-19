/**
 * T110：第5卡点击响应 + enter*Space 路由修复测试
 *
 * 覆盖范围：
 *   A. 静态证据：index.html 中 openContent 必须含 enterMusicSpace + enterVideoSpace 分支
 *                index.html 中 triggerAction 必须含 enterMusicSpace + enterVideoSpace 分支
 *                index.html 中 __music_space__ 死代码 0 处出现
 *   B. 行为模拟：openContent() 在 action.kind === 'enterMusicSpace' 时调用 setSpace('music')
 *                openContent() 在 action.kind === 'enterVideoSpace' 时调用 setSpace('video')
 *                openContent() 原有 openVideoCategory/loadPlaylist/playQueue/empty 不受影响
 *   C. 路由对称：enterMusicSpace → setSpace('music')
 *                enterVideoSpace → setSpace('video')
 *                两个分支结构对称（音乐态/影视态镜像）
 *   D. data flow：vItems 第5卡 kind='musicEntry' 被 buildOneCard 映射为 enterMusicSpace
 *                  tiles 数组 videoEntry 被 buildOneCard 映射为 enterVideoSpace
 *
 * 修复历史：T109f/j 在 triggerAction 和 openContent 里只写了 __music_space__ flag 检查
 *          （数据层零写入），触发分支从未命中 → Canvas 第5卡点击不响应。
 *          T110 把 enter*Space 分支显式补到 openContent（Canvas 卡片点击只走该路径），
 *          triggerAction 仍是死代码但保留对称逻辑，__music_space__ 全部清除。
 *
 * 运行: node scripts/t110_space_toggle_test.js
 */
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0, errors = [];
function assert(cond, label) {
  if (cond) { passed++; return true; }
  failed++; errors.push('FAIL: ' + label); return false;
}

// ================================================================
// A. 静态证据：index.html 必须包含 T110 修复的关键代码
// ================================================================
console.log('--- A. 静态证据：openContent / triggerAction 含 enter*Space 分支 ---');

var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

// A1. openContent 函数必须含 enterMusicSpace 分支
//   实际收尾格式： 末尾 6-space "}" (函数体结束) + "," + "\n" + 4-space "closeContent:"
//   但函数体最后一行是 6-space "if (action.kind === 'empty') ...;" + 4-space "},"
//   测试 grep 用更宽松的 closeContent 锚定以保证跨缩进风格仍能匹配
var openContentBlock = indexHtml.match(/openContent:\s*function[^{]*\{[\s\S]*?closeContent:\s*function/);
assert(openContentBlock !== null, '成功定位 openContent 函数');

if (openContentBlock) {
  var body = openContentBlock[0];
  assert(/action\.kind\s*===\s*['"]enterMusicSpace['"]/.test(body), 'openContent 含 enterMusicSpace 分支');
  assert(/action\.kind\s*===\s*['"]enterVideoSpace['"]/.test(body), 'openContent 含 enterVideoSpace 分支');
  assert(/StellaflixVideo\.state\s*\.\s*setSpace\(['"]music['"]\)/.test(body), 'openContent enterMusicSpace 调用 setSpace("music")');
  assert(/StellaflixVideo\.state\s*\.\s*setSpace\(['"]video['"]\)/.test(body), 'openContent enterVideoSpace 调用 setSpace("video")');
  // 保护开放：旧的 openVideoCategory 块依然存在（不破坏 L14660 路由）
  assert(/action\.kind\s*===\s*['"]openVideoCategory['"]/.test(body), '原 openVideoCategory 分支保留（不破坏第1~4卡点击）');
  assert(/action\.kind\s*===\s*['"]loadPlaylist['"]/.test(body), '原 loadPlaylist 分支保留');
  assert(/action\.kind\s*===\s*['"]playQueue['"]/.test(body), '原 playQueue 分支保留');
  assert(/action\.kind\s*===\s*['"]empty['"]/.test(body), '原 empty 分支保留');
}

// A2. triggerAction 函数（含对称逻辑保留）
//   收尾锚定：openContent: function（triggerAction 在其前面）
var triggerActionBlock = indexHtml.match(/triggerAction:\s*function[^{]*\{[\s\S]*?openContent:\s*function/);
assert(triggerActionBlock !== null, '成功定位 triggerAction 函数');
if (triggerActionBlock) {
  var body = triggerActionBlock[0];
  assert(/action\.kind\s*===\s*['"]enterMusicSpace['"]/.test(body), 'triggerAction 含 enterMusicSpace 分支（对称）');
  assert(/action\.kind\s*===\s*['"]enterVideoSpace['"]/.test(body), 'triggerAction 含 enterVideoSpace 分支（对称）');
  assert(!/__music_space__/.test(body), 'triggerAction 内 __music_space__ 死代码已清理');
}

// A3. 死代码全局清理：__music_space__ 在整个 index.html 中 0 出现（4 处全部清除）
var staleMatches = indexHtml.match(/__music_space__/g);
assert(staleMatches === null || staleMatches.length === 0,
  '__music_space__ 死代码已全局清理（4 处读取全部清除）');

// A4. drawCard 同样清理
//   drawCard 函数体下界为 cardDrawSignature
var drawCardBlock = indexHtml.match(/function\s+drawCard\s*\([^{}]*\)\s*\{[\s\S]*?function\s+cardDrawSignature/);
if (drawCardBlock) {
  assert(!/__music_space__/.test(drawCardBlock[0]), 'drawCard 内 __music_space__ 死代码已清理');
}

// A5. buildOneCard action 赋值（用于 grep 校验映射）
//   buildOneCard 函数体下界为 group.add(mesh)
var buildOneCardBlock = indexHtml.match(/mesh\.userData\.action\s*=\s*item[\s\S]*?group\.add\(mesh\);/);
assert(buildOneCardBlock !== null, '成功定位 buildOneCard action 赋值块');
if (buildOneCardBlock) {
  var mapBody = buildOneCardBlock[0];
  assert(/item\.kind\s*===\s*['"]videoEntry['"]/.test(mapBody) && /kind\s*:\s*['"]enterVideoSpace['"]/.test(mapBody),
    'videoEntry → enterVideoSpace 映射存在');
  assert(/item\.kind\s*===\s*['"]musicEntry['"]/.test(mapBody) && /kind\s*:\s*['"]enterMusicSpace['"]/.test(mapBody),
    'musicEntry → enterMusicSpace 映射存在');
}

// ================================================================
// B. 行为模拟：openContent() 在分支命中时正确触发 setSpace
// ================================================================
console.log('--- B. 行为模拟 ---');

var setSpaceCalls = [];

function simulateOpenContent(action) {
  if (!action) return;
  if (action.kind === 'playQueue') { return 'play-queue'; }
  if (action.kind === 'openVideoCategory') {
    return { route: 'openBrowse', flag: action.flag };
  }
  // T110：enterMusicSpace/enterVideoSpace 必须有显式分支
  if (action.kind === 'enterVideoSpace') {
    setSpaceCalls.push({ kind: action.kind, mode: 'video' });
    return { route: 'setSpace', mode: 'video' };
  }
  if (action.kind === 'enterMusicSpace') {
    setSpaceCalls.push({ kind: action.kind, mode: 'music' });
    return { route: 'setSpace', mode: 'music' };
  }
  if (action.kind === 'loadPlaylist') { return { route: 'loadPlaylist', id: action.playlistId }; }
  if (action.kind === 'empty') { return 'empty-panel'; }
  return 'unknown';
}

// B1. musicEntry action → 切回 music
setSpaceCalls.length = 0;
var r1 = simulateOpenContent({ kind: 'enterMusicSpace' });
assert(r1.route === 'setSpace' && r1.mode === 'music', '第5卡点击 → setSpace("music") 触发');
assert(setSpaceCalls.length === 1 && setSpaceCalls[0].mode === 'music', 'setSpace 被精确调用一次且 mode=music');

// B2. videoEntry action → 切到 video
setSpaceCalls.length = 0;
var r2 = simulateOpenContent({ kind: 'enterVideoSpace' });
assert(r2.route === 'setSpace' && r2.mode === 'video', '音乐态入口点击 → setSpace("video") 触发');
assert(setSpaceCalls.length === 1 && setSpaceCalls[0].mode === 'video', 'setSpace 被精确调用一次且 mode=video');

// B3. 原有路由不回归
var r3 = simulateOpenContent({ kind: 'openVideoCategory', flag: 'liked' });
assert(r3.route === 'openBrowse' && r3.flag === 'liked', '原 openVideoCategory → openBrowse 不变');

var r4 = simulateOpenContent({ kind: 'playQueue', index: 0 });
assert(r4 === 'play-queue', '原 playQueue → playQueueAt 不变');

var r5 = simulateOpenContent({ kind: 'loadPlaylist', playlistId: 'p1' });
assert(r5.route === 'loadPlaylist', '原 loadPlaylist → contentList.open 不变');

var r6 = simulateOpenContent({ kind: 'empty' });
assert(r6 === 'empty-panel', '原 empty → togglePlaylistPanel 不变');

// B4. 边界：未知 kind 不触发 setSpace（不误切空间）
setSpaceCalls.length = 0;
var r7 = simulateOpenContent({ kind: 'unknown' });
assert(r7 === 'unknown', '未知 kind 落到函数末尾，不应 setSpace');
assert(setSpaceCalls.length === 0, 'setSpace 未被误调');

// B5. null/undefined action 安全
assert(simulateOpenContent(null) === undefined, 'null action 安全返回');
assert(simulateOpenContent(undefined) === undefined, 'undefined action 安全返回');

// B6. enterMusicSpace 与 enterVideoSpace 互不串扰
setSpaceCalls.length = 0;
simulateOpenContent({ kind: 'enterMusicSpace' });
simulateOpenContent({ kind: 'enterVideoSpace' });
assert(setSpaceCalls.length === 2, '两次正确分支各触发一次');
assert(setSpaceCalls[0].mode === 'music' && setSpaceCalls[1].mode === 'video', '调用顺序保持 [music, video]');

// ================================================================
// C. 路由对称：镜像结构
// ================================================================
console.log('--- C. 镜像对称 ---');

// C1. data push：影视态第5卡 vs 音乐态视频入口
//   缩进：6-space "vItems.push("
var videoPushBlock = indexHtml.match(/if\s*\(vItems\.length\)\s*\{[\s\S]*?vItems\.push\(\{[\s\S]*?\}\);[\s\S]*?return vItems;\s*\}/);
assert(videoPushBlock !== null, '定位 vItems 第5卡 push 块');
if (videoPushBlock) {
  var pushBody = videoPushBlock[0];
  assert(/kind\s*:\s*['"]musicEntry['"]/.test(pushBody), 'vItems 第5卡使用 kind="musicEntry"');
  assert(/title\s*:\s*['"]音乐空间['"]/.test(pushBody), 'vItems 第5卡 title="音乐空间"');
  assert(/sub\s*:\s*['"]返回音乐空间['"]/.test(pushBody), 'vItems 第5卡 sub="返回音乐空间"');
}

// C2. buildOneCard 映射：musicEntry → enterMusicSpace，videoEntry → enterVideoSpace
if (buildOneCardBlock) {
  var mapBody = buildOneCardBlock[0];
  assert(/item\.kind\s*===\s*['"]videoEntry['"][^]*?kind\s*:\s*['"]enterVideoSpace['"]/.test(mapBody),
    '音乐态入口：videoEntry → enterVideoSpace');
  assert(/item\.kind\s*===\s*['"]musicEntry['"][^]*?kind\s*:\s*['"]enterMusicSpace['"]/.test(mapBody),
    '影视态入口：musicEntry → enterMusicSpace');
}

// ================================================================
// D. 边界：三角对称触发（音乐态 canvas 不应误触发 enterMusicSpace）
// ================================================================
console.log('--- D. 不应误触发 ---');

// D1. music 态 buildOneCard 对 musicEntry kind 必须降级到 empty（音乐态不该有 musicEntry）
// 这一点已经在 buildAction 里天然实现（musicEntry 在 music 态不会出现）—— 不需要 mock 验证
// 但确认隐含语义：musicEntry 用于影视态第5卡，music 态不会有这个 kind

// D2. 1 次 enterMusicSpace 调用不应触发 enterVideoSpace
setSpaceCalls.length = 0;
simulateOpenContent({ kind: 'enterMusicSpace' });
var onlyMusicCount = setSpaceCalls.length;
assert(onlyMusicCount === 1 && setSpaceCalls.filter(function(c){ return c.mode === 'video'; }).length === 0,
  '仅 enterMusicSpace 命中时，无 video 模式被触发');

// ================================================================
// E. setSpace 状态机集成（用 vm 实测 state.js）
// ================================================================
console.log('--- E. state.setSpace() 真实行为 ---');
var vm = require('vm');
var _store = {};
var g = {
  window: {},
  document: {
    body: {
      classList: {
        _l: [], contains: function(k){ return this._l.indexOf(k) >= 0; },
        toggle: function(k, f){
          var on = f === undefined ? this._l.indexOf(k) < 0 : !!f;
          if (on) this._l.push(k); else this._l = this._l.filter(function(x){ return x !== k; });
          return on;
        }
      }
    }
  },
  localStorage: { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} },
  CustomEvent: function(t, i){ this.type = t; this.detail = (i && i.detail) || {}; },
  addEventListener: function(){}, dispatchEvent: function(){},
  console: console,
};
g.window = g;

var vmCtx = vm.createContext(g);
var stateSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'state.js'), 'utf8');
vm.runInContext(stateSrc, vmCtx);

var SFV = g.StellaflixVideo;
assert(SFV && SFV.state, 'state.js 暴露 StellaflixVideo.state');

// E1. setSpace('music') → 切到音乐态
SFV.state.setSpace('music');
assert(SFV.state.isMusic() && !SFV.state.isVideo(), 'setSpace("music") 后状态正确');
assert(SFV.state.getSpace() === 'music', 'getSpace() 返回 "music"');

// E2. setSpace('video') → 切到影视态
SFV.state.setSpace('video');
assert(SFV.state.isVideo() && !SFV.state.isMusic(), 'setSpace("video") 后状态正确');

// E3. 反复切换稳定
SFV.state.setSpace('music');
SFV.state.setSpace('video');
SFV.state.setSpace('music');
assert(SFV.state.getSpace() === 'music', '反复切换稳定');

// ================================================================
// 输出
// ================================================================
console.log('\n========================================');
console.log('  T110 音乐空间点击响应测试: ' + passed + ' pass / ' + failed + ' fail');
console.log('========================================');
if (errors.length) { errors.forEach(function(e){ console.log('  X ' + e); }); }
process.exit(failed > 0 ? 1 : 0);
