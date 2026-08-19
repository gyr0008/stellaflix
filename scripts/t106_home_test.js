// T106: 影视态首页改造测试（5卡 + 接着看 + 无返回按钮）
// T112 改造：第5卡由"影视空间/openBrowse"对称改为"音乐空间/setSpace('music')"，
//   此处断言随之更新；T112_video_home_grid_test 进一步覆盖对称细节。
var fs = require('fs');
var pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 ' + msg); } }

// 1. home.js 结构检查
var home = fs.readFileSync('public/video/home.js', 'utf8');

assert(home.indexOf('音乐空间') !== -1, 'cardDefs 第5卡为「音乐空间」（T112 对称设计）');
assert(home.indexOf("setSpace('music')") !== -1, '第5卡动作调用 setSpace("music")（T112 改造后）');
assert(home.indexOf('openBrowse') === -1, '第5卡不再使用旧的 openBrowse');
var cardCount = (home.match(/label:\s*['"].+?['"],/g) || []).length;
assert(cardCount === 5, 'cardDefs 恰好定义 5 个卡片 (' + cardCount + ')');

assert(home.indexOf('renderContinueWatching') !== -1, 'renderContinueWatching 函数存在');
assert(home.indexOf('接着看') !== -1, '标题为「接着看」');
assert(home.indexOf('data-sfv-key') !== -1, '接着看卡片使用 data-sfv-key 属性');
assert(home.indexOf('resumeFromHistory') !== -1, 'resumeFromHistory 函数存在');
assert(home.indexOf('openDetailFromMeta') !== -1, '点击调用 openDetailFromMeta 恢复播放');
assert(home.indexOf('sfv-continue-tile') !== -1, '接着看卡片使用 sfv-continue-tile 类名');
assert(home.indexOf('sfv-continue-empty') !== -1, '缺位占位使用 sfv-continue-empty 类名');
assert(home.indexOf('slice(0, 5)') !== -1, '限制最多 5 条记录');

// render() 不再调用 ensureBackBtn
var renderFunc = home.match(/function render\(\)[\s\S]*?^  \}/m);
assert(renderFunc && renderFunc[0].indexOf('ensureBackBtn') === -1, 'render() 不再调用 ensureBackBtn()');
assert(renderFunc && renderFunc[0].indexOf('renderContinueWatching') !== -1, 'render() 调用 renderContinueWatching()');
assert(renderFunc && renderFunc[0].indexOf("cards[i].style.display") !== -1, '多余卡位仍隐藏保护');

// restoreMusic 不再调用 hideBackBtn
var restoreFunc = home.match(/function restoreMusic\(\)[\s\S]*?^  \}/m);
assert(restoreFunc && restoreFunc[0].indexOf('hideBackBtn') === -1, 'restoreMusic 不再调用 hideBackBtn()');

// 2. player.css 检查
var css = fs.readFileSync('public/video/player.css', 'utf8');
assert(css.indexOf('.sfv-back-to-music') !== -1, 'CSS 存在 .sfv-back-to-music 规则');
assert(css.indexOf('display: none !important') !== -1, '返回按钮设为 display:none !important 隐藏');
assert(css.indexOf('.sfv-continue-tile') !== -1, 'CSS 存在 .sfv-continue-tile 样式');
assert(css.indexOf('.sfv-continue-empty') !== -1, 'CSS 存在 .sfv-continue-empty 样式');

// 3. 确认 index.html 未改动（零 DOM 变动）
var idx = fs.readFileSync('public/index.html', 'utf8');
assert(idx.indexOf('.home-card') !== -1, 'index.html 仍有 .home-card DOM（未删除）');
assert(idx.indexOf('home-video-title') !== -1, 'index.html 仍含 Video 卡 #home-video-title');

console.log('\n========================================');
console.log('T106 影视态首页改造测试: ' + pass + ' PASS / ' + fail + ' FAIL / ' + (pass + fail) + ' TOTAL');
if (fail === 0) console.log('ALL PASS ✅'); else console.log('HAS FAILURES ❌');
process.exit(fail > 0 ? 1 : 0);
