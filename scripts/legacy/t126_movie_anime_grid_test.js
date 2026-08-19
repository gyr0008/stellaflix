/**
 * T126 电影/动漫 真实海报网格（TMDB 热门 + 无限滚动 + TMDB 详情）— 专项测试（T127 重构后）
 *
 * T127 把电影/动漫从「online.js 内 kind 参数化视图」改为「两个独立注册页面模块」
 * （page-movie.js / page-anime.js，由 page-media-grid.js 工厂生成，传入字面量 mediaType）。
 * 本测试随之迁移断言目标：
 *  A. page-movie / page-anime 注册独立页面（id 字面量，无 kind 共享）
 *  B. page-media-grid.js 内含网格 + 评分徽章 + TMDB 详情 + 无限滚动 + popular 调用
 *  C. tmdb.js popular(mediaType,page) + 动漫 genre 16 客户端过滤（不变）
 *  D. player.css 配套类名（评分徽章 / 浏览态隐藏搜索 / 状态行 / 页脚 / 详情暗色覆盖）
 *  E. 回归：index.html 仍零 grid-diy 引用（零改动铁律）
 *  F. 语法：vm.Script 解析 online.js / tmdb.js / 5 个 page 模块 / router.js 无 SyntaxError（T111 铁律）
 *  G. 运行时加载：mock global 串起 router + page 模块，验证 5 个 nav 页面注册成功
 */
var fs = require('fs');
var vm = require('vm');
var indexHtml = fs.readFileSync('public/index.html', 'utf8');
var playerCss = fs.readFileSync('public/video/player.css', 'utf8');
var onlineJs = fs.readFileSync('public/video/online.js', 'utf8');
var onlineCoreJs = fs.readFileSync('public/video/online-core.js', 'utf8');
var tmdbJs   = fs.readFileSync('public/video/tmdb.js', 'utf8');
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
// A. 独立页面注册（无 kind 共享）
// ================================================================
console.log('\n=== A. page-movie / page-anime 独立注册 ===\n');
assert(movieJs.indexOf("createMediaGridPage({ id: 'movie'") !== -1 &&
       movieJs.indexOf("mediaType: 'movie'") !== -1,
       "page-movie 注册 id='movie' mediaType='movie'（字面量，非 kind）");
assert(animeJs.indexOf("createMediaGridPage({ id: 'anime'") !== -1 &&
       animeJs.indexOf("mediaType: 'anime'") !== -1,
       "page-anime 注册 id='anime' mediaType='anime'（字面量，非 kind）");
assert(gridJs.indexOf('SFV.router.register(page)') !== -1,
       '工厂内调用 SFV.router.register（页面经 router 注册，非在线视图栈）');
assert(onlineJs.indexOf('renderBrowse') === -1 && onlineJs.indexOf('function renderTmdbDetail') === -1,
       'online.js 已不再内联 kind 参数化 browse/detail（已迁出）');

// ================================================================
// B. page-media-grid.js 网格 + 详情 + 无限滚动逻辑
// ================================================================
console.log('\n=== B. page-media-grid.js 网格/详情/无限滚动 ===\n');
assert(gridJs.indexOf('sfv-grid') !== -1 && gridJs.indexOf('sfv-card') !== -1, '含 .sfv-grid / .sfv-card 网格');
assert(gridJs.indexOf('sfv-card-rating') !== -1, '含评分徽章 .sfv-card-rating');
assert(gridJs.indexOf('sfv-tmdb-detail') === -1, 'page-media-grid.js 不再内联废弃的 .sfv-tmdb-detail 详情样式（详情页回滚为 toast 占位）');
assert(gridJs.indexOf('SFV.tmdb.popular(mediaType') !== -1, '调用 SFV.tmdb.popular(mediaType, p)');
assert(gridJs.indexOf('IntersectionObserver') !== -1 &&
       gridJs.indexOf("rootMargin: '400px'") !== -1, '无限滚动 IntersectionObserver(rootMargin 400px)');
assert(gridJs.indexOf("mediaType === 'anime'") === -1, '网格工厂不内嵌 anime 分支（由 anime 页面传入字面量）');

// ================================================================
// C. tmdb.js popular()
// ================================================================
console.log('\n=== C. tmdb.js popular() ===\n');
assert(/function popular\s*\(/.test(tmdbJs), 'popular(mediaType, page) 函数存在');
assert(tmdbJs.indexOf('popular: popular') !== -1, 'tmdb 对象导出 popular');
assert(tmdbJs.indexOf("mediaType === 'anime'") !== -1 &&
       tmdbJs.indexOf("with_genres: '16'") !== -1 &&
       tmdbJs.indexOf('/discover/tv') !== -1,
       '动漫 = discover/tv + with_genres=16(动画) 服务端过滤');
assert(tmdbJs.indexOf("/movie/popular") !== -1, '电影 = /movie/popular');
assert(tmdbJs.indexOf('normalizeList') !== -1, 'normalizeList 归一化函数存在');

// ================================================================
// D. player.css 配套样式
// ================================================================
console.log('\n=== D. player.css 配套样式 ===\n');
assert(playerCss.indexOf('.sfv-browse--browse .sfv-browse-search') !== -1 &&
       playerCss.indexOf('.sfv-browse--browse .sfv-browse-acts') !== -1,
       '浏览态隐藏内联搜索栏与操作按钮');
assert(playerCss.indexOf('.sfv-card-rating') !== -1, '.sfv-card-rating 评分徽章样式存在');
assert(/\.sfv-card-cover\s*\{[^}]*position:\s*relative/.test(playerCss),
       '.sfv-card-cover 设 position: relative（徽章定位基准）');
assert(playerCss.indexOf('.sfv-browse-status') !== -1, '.sfv-browse-status 状态行样式存在');
assert(playerCss.indexOf('.sfv-browse-foot') !== -1, '.sfv-browse-foot TMDB 署名样式存在');
assert(playerCss.indexOf('.sfv-tmdb-detail') === -1, '.sfv-tmdb-detail 废弃详情样式已移除（v2/米白详情页清理）');

// ================================================================
// E. 回归：index.html 零 grid-diy 引用
// ================================================================
console.log('\n=== E. 回归：index.html 零改动 ===\n');
assert(countStr(indexHtml, 'grid-diy') === 0, 'index.html 仍零 grid-diy 引用（零改动铁律）');

// ================================================================
// F. 语法：vm.Script 解析（T111 铁律，禁止任何 V8 SyntaxError）
// ================================================================
console.log('\n=== F. vm.Script 语法解析 ===\n');
function parseOk(src, name) {
  try { new vm.Script(src, { filename: name }); return true; }
  catch (e) { console.log('    ' + name + ' 解析异常: ' + e.message); return false; }
}
[['online-core.js', onlineCoreJs], ['online.js', onlineJs], ['tmdb.js', tmdbJs], ['router.js', routerJs], ['page-media-grid.js', gridJs],
 ['page-movie.js', movieJs], ['page-anime.js', animeJs], ['page-home.js', homeJs],
 ['page-discover.js', discoverJs], ['page-world.js', worldJs]].forEach(function (p) {
  assert(parseOk(p[1], p[0]), p[0] + ' vm.Script 解析无 SyntaxError');
});

// ================================================================
// G. 运行时加载：验证 4 个 nav 页面注册（首页由 home.js 直接渲染，非 router 分页）
// ================================================================
console.log('\n=== G. 运行时加载：4 个 nav 页面注册（首页除外） ===\n');
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
  var ids = (SFV.router && SFV.router.listIds) ? SFV.router.listIds() : [];
  ['discover', 'world', 'movie', 'anime'].forEach(function (id) {
    assert(ids.indexOf(id) !== -1, 'nav 页面已注册: ' + id);
  });
  assert(ids.indexOf('home') === -1, 'home 未注册为 router 分页（由 home.js 渲染）');
  assert(ids.length === 4, '恰好注册 4 个页面（实际 ' + ids.length + '）');
  assert(typeof SFV.createMediaGridPage === 'function', 'SFV.createMediaGridPage 工厂存在');
})();

// ================================================================
console.log('\n=== 汇总 ===');
console.log('T126: ' + pass + ' pass / ' + fail + ' fail');
if (fail > 0) process.exit(1);
