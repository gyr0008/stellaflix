/**
 * 番名归一化测试（T79）：从真实 public/video/player-core.js 切片提取
 * extractEpisode + normalizeAnimeName 两个纯函数，在 vm 沙箱验证。
 *
 * 关键：不复制函数逻辑，而是正则提取真实源码后 eval，确保测的是线上代码。
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var playerSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'video', 'player-core.js'), 'utf8');

// 从真实源码切片提取一个具名函数（含嵌套括号）
function extractFn(name) {
  var start = playerSrc.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('函数未找到: ' + name);
  var i = playerSrc.indexOf('{', start);
  if (i < 0) throw new Error('函数体未找到: ' + name);
  var depth = 0;
  for (; i < playerSrc.length; i++) {
    var ch = playerSrc[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return playerSrc.slice(start, i + 1); }
  }
  throw new Error('函数括号不匹配: ' + name);
}

var fnSrc = extractFn('extractEpisode') + '\n' + extractFn('normalizeAnimeName');

var sandbox = {};
vm.runInNewContext(fnSrc + '\n; this.extractEpisode = extractEpisode; this.normalizeAnimeName = normalizeAnimeName;', sandbox);
var extractEpisode = sandbox.extractEpisode;
var normalizeAnimeName = sandbox.normalizeAnimeName;

// ========== 测试框架 ==========
var pass = 0, fail = 0;
function t(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail != null ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail != null ? '  [' + detail + ']' : '')); }
}

// ========== ① normalizeAnimeName 番名清洗 ==========
console.log('\n===== ① 番名归一化 (normalizeAnimeName) =====');
var cases = [
  ['进击的巨人.03.BDRip', '进击的巨人'],
  ['一念永恒·第1话', '一念永恒'],
  ['间谍过家家 第03话', '间谍过家家'],
  ['My Hero Academia EP05', 'My Hero Academia'],
  ['海贼王 第 25 集', '海贼王'],
  ['葬送的芙莉莲 第12集', '葬送的芙莉莲'],
  ['进击的巨人 第三季 第15集', '进击的巨人 第三季'],
  ['[AGE] 咒术回战 - 12 [1080p]', '咒术回战'],
  // 站点标签剥离：标题格式 {番名} · {标签}，' · ' 后的标签必须被截断
  ['你的名字。 · 正片', '你的名字。'],                    // 电影标签"正片"（修复前会污染搜索词）
  ['间谍过家家 第03话 · 线路A', '间谍过家家'],              // 线路标签"线路A"+集数
  ['进击的巨人 · 第1话', '进击的巨人'],                    // 标签位的集数标记
  ['Forza Horizon 4', 'Forza Horizon 4'],          // 游戏名无集数，原样保留
  ['', ''],                                          // 空串边界
  [null, null]                                       // null 边界
];
cases.forEach(function (c) {
  var got = normalizeAnimeName(c[0]);
  t('「' + c[0] + '」→ 「' + c[1] + '」', got === c[1], '得到=' + JSON.stringify(got));
});

// ========== ② extractEpisode 增强（点分集数）+ 旧用例不回归 ==========
console.log('\n===== ② 集数提取 (extractEpisode) =====');
var epCases = [
  ['进击的巨人.03.BDRip', 3],        // 新增：点分集数
  ['[AGE] 咒术回战 - 12 [1080p]', 12], // 横杠集数
  ['进击的巨人 第3集', 3],
  ['间谍过家家 第03话', 3],
  ['葬送的芙莉莲 第12集', 12],
  ['My Hero Academia EP05', 5],
  ['Anime Name ep7', 7],
  ['Something E.15 Final', 15],
  ['海贼王 第 25 集', 25],
  ['第一季 开播了', null],           // 中文数字不匹配（已知边界）
  ['剧场版 总集篇', null],           // 无集数
  ['', null],
  [null, null]
];
epCases.forEach(function (c) {
  var got = extractEpisode(c[0]);
  t('「' + c[0] + '」→ ' + c[1], got === c[1], '得到=' + got);
});

// ========== ③ 集成：autoLoadDanmaku 实际传给 loadFromClient 的值 ==========
console.log('\n===== ③ 集成：传给弹幕引擎的 (cleanTitle, ep) =====');
function simulateCall(title) {
  var ep = extractEpisode(title);
  var cleanTitle = normalizeAnimeName(title);
  return { title: cleanTitle, episode: ep };
}
var dirty = simulateCall('进击的巨人.03.BDRip');
t('脏标题番名被清洗', dirty.title === '进击的巨人', JSON.stringify(dirty.title));
t('脏标题集数被正确提取', dirty.episode === 3, 'ep=' + dirty.episode);
t('传给引擎的番名不含 .03.BDRip 后缀', dirty.title.indexOf('.03') < 0 && dirty.title.indexOf('BDRip') < 0);

var clean = simulateCall('一念永恒·第1话');
t('中文标点被正确剥离', clean.title === '一念永恒', JSON.stringify(clean.title));
t('中文集数标记被正确剥离且集数提取', clean.episode === 1, 'ep=' + clean.episode);

// 站点标签场景：模拟真实自动加载路径（电影/带线路标签的番剧）
// 修复前："你的名字。 · 正片" → 搜索词"你的名字。 正片" → DANMAKU_NO_EPISODE
var movie = simulateCall('你的名字。 · 正片');
t('电影标签"正片"被截断', movie.title === '你的名字。', JSON.stringify(movie.title));
t('电影无集数', movie.episode === null, 'ep=' + movie.episode);
t('搜索词不含"正片"', movie.title.indexOf('正片') < 0);

var tagged = simulateCall('间谍过家家 第03话 · 线路A');
t('线路标签"线路A"被截断', tagged.title === '间谍过家家', JSON.stringify(tagged.title));
t('线路番剧集数仍正确提取', tagged.episode === 3, 'ep=' + tagged.episode);
t('搜索词不含"线路A"', tagged.title.indexOf('线路A') < 0);

// ========== 结果汇总 ==========
console.log('\n===== 番名归一化测试 ' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) { console.log('### 有 ' + fail + ' 项失败 ###'); process.exit(1); }
else { console.log('=== ALL PASS ==='); }
