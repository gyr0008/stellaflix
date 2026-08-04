// T107: 三项修复验证
// 1. 删除「还没有观看记录」文字
// 2. 修复接着看点击报「浏览模块未就绪」（openDetailFromMeta 未导出）
// 3. 封堵非按钮空间切换路径（player.close / nav home / state.js 诊断日志）
var fs = require('fs');
var pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

var home = fs.readFileSync('public/video/home.js', 'utf8');
var online = fs.readFileSync('public/video/online.js', 'utf8');
var player = fs.readFileSync('public/video/player.js', 'utf8');
var state = fs.readFileSync('public/video/state.js', 'utf8');
var idx = fs.readFileSync('public/index.html', 'utf8');

// ===== 需求1：删除「还没有观看记录」文字 =====
assert(home.indexOf('还没有观看记录') === -1, '需求1: home.js 不含「还没有观看记录」文字');

// ===== 需求2：修复「浏览模块未就绪」=====
assert(online.indexOf('openDetailFromMeta: openDetailFromMeta') !== -1, '需求2: SFV.online 导出 openDetailFromMeta');
assert(online.match(/SFV\.online\s*=\s*\{[\s\S]*?openDetailFromMeta/s) !== null, '需求2: openDetailFromMeta 在 SFV.online 对象内');
assert(home.indexOf('SFV.online.openDetailFromMeta(entry)') !== -1, '需求2: resumeFromHistory 调用 SFV.online.openDetailFromMeta');
assert(home.indexOf("toast('浏览模块未就绪')") !== -1, '需求2: fallback toast 仍保留（防御性）');

// ===== 需求3：空间切换封堵 =====
var closeFunc = player.match(/function close\(\)[\s\S]*?^  \}/m);
assert(closeFunc && closeFunc[0].indexOf('setSpace') === -1, '需求3a: player.close() 不含 setSpace 调用');
assert(closeFunc && closeFunc[0].indexOf('music') === -1, '需求3a: player.close() 不含 music 引用');

var navHome = online.match(/case 'home':[\s\S]*?break;/);
assert(navHome && navHome[0].indexOf('setSpace') === -1, '需求3b: nav home 不含 setSpace 调用');
// 用户纠正：首页不是新建独立分页，而是影视空间既有首页（home.js 渲染的主 DOM）。
// nav home 走 goHome()：关闭 #sfv-browse 覆盖层并刷新真正的影视首页，不切换空间。
assert(navHome && navHome[0].indexOf('goHome') !== -1, '需求3b: nav home 调用 goHome() 展示真正影视首页');
assert(navHome && navHome[0].indexOf("goToNav('home')") === -1, '需求3b: nav home 不再路由到 page-home 占位页');

assert(state.indexOf('[SFV-STATE] setSpace') !== -1, '需求3c: state.js 含空间切换诊断日志');
assert(state.indexOf('(new Error()).stack') !== -1, '需求3c: 诊断日志包含调用栈');

assert(idx.indexOf("setSpace('video')") !== -1, '需求3d: index.html 仍有授权的 video 空间切换入口');

console.log('\n========================================');
console.log('T107 三项修复验证: ' + pass + ' PASS / ' + fail + ' FAIL / ' + (pass + fail) + ' TOTAL');
if (fail === 0) console.log('ALL PASS ✅'); else console.log('HAS FAILURES ❌');
process.exit(fail ? 1 : 0);
