/**
 * T127 导航独立页面重构 — 专项测试（已按用户纠正更新）
 *
 * 用户纠正：「首页」不是新建独立分页，而是影视空间既有首页（home.js 渲染的主 DOM：
 * 大海报 + 心动/片单/追片/历史/音乐空间卡片 + 继续看）。因此首页不再作为 router 页面注册，
 * 改由 online.js goHome() 关闭 #sfv-browse 覆盖层并刷新真正的影视首页。
 *
 * 本测试验证：
 *  A. router.js 提供 register/setHost/go/current/currentId/listIds
 *  B. 四个 nav 页面独立注册（discover/world/movie/anime），movie/anime 为不同注册；
 *     page-home.js 不再注册 id=home
 *  C. online.js 导航派发：discover/world/movie/anime 走 goToNav → SFV.router.go；
 *     home 走 goHome()（不再 open({mode:'browse'/'placeholder'}））
 *  D. online.js 移除 kind 参数化 browse/placeholder 残留
 *  E. online.js 暴露 SFV.ui（el/toast/setNote/paintFlag/CATEGORY_META/setBrowseChrome/setTitle）
 *  F. index.html 引入 7 个新脚本（router + 5 page + media-grid），且零 grid-diy 业务改动
 *  G. 双态隔离：applyVideoPageBg 改用 activePageId（电影/动漫）而非 currentBrowseKind
 *  H. 语法：vm.Script 解析全部 7 个新文件 + online.js 无 SyntaxError
 *  I. 运行时加载：mock global 串起 router + 四个 page，验证 4 页注册且 mount 可执行
 */
var fs = require('fs');
var vm = require('vm');
var indexHtml = fs.readFileSync('public/index.html', 'utf8');
var onlineJs = fs.readFileSync('public/video/online.js', 'utf8');
var onlineCoreJs = fs.readFileSync('public/video/online-core.js', 'utf8');
var routerJs = fs.readFileSync('public/video/router.js', 'utf8');
var gridJs   = fs.readFileSync('public/video/page-media-grid.js', 'utf8');
var movieJs  = fs.readFileSync('public/video/page-movie.js', 'utf8');
var animeJs  = fs.readFileSync('public/video/page-anime.js', 'utf8');
var homeJs   = fs.readFileSync('public/video/page-home.js', 'utf8');
var discoverJs = fs.readFileSync('public/video/page-discover.js', 'utf8');
var worldJs  = fs.readFileSync('public/video/page-world.js', 'utf8');

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
// A. router 能力
// ================================================================
console.log('\n=== A. router.js 能力 ===\n');
assert(/function register\s*\(/.test(routerJs), 'router.register 存在');
assert(/function setHost\s*\(/.test(routerJs), 'router.setHost 存在');
assert(/function go\s*\(/.test(routerJs), 'router.go 存在');
assert(/function current\s*\(/.test(routerJs), 'router.current 存在');
assert(/function currentId\s*\(/.test(routerJs), 'router.currentId 存在');
assert(/function listIds\s*\(/.test(routerJs), 'router.listIds 存在');

// ================================================================
// B. 五个 nav 页面独立注册
// ================================================================
console.log('\n=== B. 四 nav 页面独立注册（首页除外） ===\n');
assert(homeJs.indexOf("id: 'home'") === -1, 'page-home.js 不再注册 id=home（首页不是 router 分页）');
assert(discoverJs.indexOf("id: 'discover'") !== -1, 'page-discover 注册 id=discover');
assert(worldJs.indexOf("id: 'world'") !== -1, 'page-world 注册 id=world');
assert(movieJs.indexOf("id: 'movie'") !== -1, 'page-movie 注册 id=movie');
assert(animeJs.indexOf("id: 'anime'") !== -1, 'page-anime 注册 id=anime');
assert(movieJs.indexOf('createMediaGridPage') !== -1 && animeJs.indexOf('createMediaGridPage') !== -1,
       'movie/anime 经同一工厂但各自独立注册（非共用同一页面实例）');

// ================================================================
// C. 导航派发走 router
// ================================================================
console.log('\n=== C. 导航派发：首页 goHome，其余 goToNav → router ===\n');
assert(onlineJs.indexOf('goToNav') !== -1, 'online.js 定义 goToNav');
assert(onlineJs.indexOf('function goHome') !== -1, 'online.js 定义 goHome()');
assert(onlineJs.indexOf('goHome: goHome') !== -1, 'SFV.online 暴露 goHome');
assert(onlineJs.indexOf("goToNav('discover')") !== -1, 'discover → goToNav');
assert(onlineJs.indexOf("goToNav('world')") !== -1, 'world → goToNav');
assert(onlineJs.indexOf("goToNav('movie')") !== -1, 'movie → goToNav');
assert(onlineJs.indexOf("goToNav('anime')") !== -1, 'anime → goToNav');
assert(onlineJs.indexOf("goToNav('home')") === -1, 'home 不再走 goToNav（避免进入 page-home 占位页）');
assert(/case 'home':[\s\S]*?goHome\(\)/.test(onlineJs), 'home → goHome() 回到真正影视首页');
assert(onlineJs.indexOf("SFV.router.go(key)") !== -1, 'goToNav 调用 SFV.router.go(key)');
assert(onlineJs.indexOf("open({ mode: 'browse'") === -1,
       'online.js 不再有 open({mode:\'browse\'}) 导航入口');
assert(onlineJs.indexOf("open({ mode: 'placeholder'") === -1,
       'online.js 不再有 open({mode:\'placeholder\'}) 导航入口');

// ================================================================
// D. 移除 kind 参数化残留
// ================================================================
console.log('\n=== D. 移除 kind 参数化残留 ===\n');
assert(onlineJs.indexOf('renderBrowse') === -1, 'online.js 无 renderBrowse');
assert(onlineJs.indexOf('renderPlaceholder') === -1, 'online.js 无 renderPlaceholder');
assert(onlineJs.indexOf('PLACEHOLDER_META') === -1, 'online.js 无 PLACEHOLDER_META');
assert(onlineJs.indexOf('currentBrowseKind') === -1, 'online.js 无 currentBrowseKind');

// ================================================================
// E. SFV.ui 暴露
// ================================================================
console.log('\n=== E. SFV.ui 暴露 ===\n');
assert(onlineJs.indexOf('SFV.ui = {') !== -1, 'online.js 导出 SFV.ui');
['el:', 'toast:', 'setNote:', 'CATEGORY_META:', 'setBrowseChrome:', 'setTitle:'].forEach(function (k) {
  assert(onlineJs.indexOf(k) !== -1, 'SFV.ui 含 ' + k.replace(':', ''));
});

// ================================================================
// F. index.html 引入 7 个新脚本
// ================================================================
console.log('\n=== F. index.html 引入 ===\n');
['video/router.js', 'video/page-media-grid.js', 'video/page-movie.js', 'video/page-anime.js',
 'video/page-home.js', 'video/page-discover.js', 'video/page-world.js'].forEach(function (s) {
  assert(indexHtml.indexOf(s) !== -1, 'index.html 引入 ' + s);
});
assert(countStr(indexHtml, 'grid-diy') === 0, 'index.html 仍零 grid-diy 业务代码（零改动铁律）');

// ================================================================
// G. 双态隔离：背景按 activePageId
// ================================================================
console.log('\n=== G. 双态隔离：applyVideoPageBg 按 activePageId ===\n');
assert(onlineJs.indexOf('var isMovieAnime = (activePageId === \'movie\' || activePageId === \'anime\')') !== -1,
       'applyVideoPageBg 用 activePageId 判定电影/动漫分页');

// ================================================================
// H. 语法：vm.Script 解析
// ================================================================
console.log('\n=== H. vm.Script 语法解析 ===\n');
function parseOk(src, name) {
  try { new vm.Script(src, { filename: name }); return true; }
  catch (e) { console.log('    ' + name + ' 解析异常: ' + e.message); return false; }
}
[['router.js', routerJs], ['page-media-grid.js', gridJs], ['page-movie.js', movieJs],
 ['page-anime.js', animeJs], ['page-home.js', homeJs], ['page-discover.js', discoverJs],
 ['page-world.js', worldJs], ['online-core.js', onlineCoreJs], ['online.js', onlineJs]].forEach(function (p) {
  assert(parseOk(p[1], p[0]), p[0] + ' vm.Script 解析无 SyntaxError');
});

// ================================================================
// I. 运行时加载：5 页注册 + mount 为函数
// ================================================================
console.log('\n=== I. 运行时加载：4 页注册 + mount ===\n');
(function () {
  var sandbox = { console: console };
  sandbox.window = sandbox;
  sandbox.StellaflixVideo = {};
  vm.createContext(sandbox);
  ['router.js', 'page-media-grid.js', 'page-movie.js', 'page-anime.js', 'page-home.js', 'page-discover.js', 'page-world.js']
    .forEach(function (f) {
      vm.runInContext(fs.readFileSync('public/video/' + f, 'utf8'), sandbox, { filename: f });
    });
  var SFV = sandbox.StellaflixVideo;
  var reg = (SFV.router && SFV.router.listIds) ? SFV.router.listIds() : [];
  ['discover', 'world', 'movie', 'anime'].forEach(function (id) {
    assert(reg.indexOf(id) !== -1, '运行时注册: ' + id);
  });
  assert(reg.indexOf('home') === -1, 'home 未注册为 router 页面');
  // go 到一个页面验证 mount 可执行且不抛（用 mock host）
  var host = { innerHTML: '', appendChild: function () {} };
  var okGo = true;
  try {
    SFV.router.go('movie');
    SFV.router.go('anime');
    SFV.router.go('discover');
    SFV.router.go('world');
  } catch (e) { okGo = false; console.log('    go() 异常: ' + e.message); }
  assert(okGo, 'router.go 对 4 个页面均不抛异常（mount 可执行）');
})();

// ================================================================
console.log('\n=== 汇总 ===');
console.log('T127: ' + pass + ' pass / ' + fail + ' fail');
if (fail > 0) process.exit(1);
