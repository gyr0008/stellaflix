/*
 * #6-序7 — online 零依赖纯过滤谓词层单测（Node vm 沙箱，无 DOM/localStorage/SFV 依赖）
 * 覆盖：_containsEither / _typeMatches / _item*Excluded / _scoreKey + 幂等守卫 + facade 形状。
 * 这些谓词是"纯排除模型"的客户端过滤逻辑，仅依赖入参，不触碰 SFV.* / window / document / DOM。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const CORE = path.join(__dirname, '..', 'public', 'video', 'online-core.js');

function newCtx() {
  const ctx = { StellaflixVideo: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}
function loadCore(ctx) {
  const code = fs.readFileSync(CORE, 'utf8');
  vm.runInContext(code, ctx, { filename: CORE });
}

test('_containsEither：a 含 b 或 b 含 a 任一为真', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._containsEither;
  assert.equal(f('abc', 'bc'), true);   // a 含 b
  assert.equal(f('bc', 'abc'), true);   // b 含 a
  assert.equal(f('abc', 'xy'), false);  // 互不包含
  assert.equal(f(null, 'x'), false);    // a 为 null
  // 边界（继承自原 online.js，抽取未改行为）：空串 indexOf('')===0，
  // 故任意串"包含"空串、空串也"被包含"于任意非空串 → 返回 true。
  // 若要让空输入不参与匹配，需单独硬化 _containsEither（超出本次抽取范围，待用户决策）。
  assert.equal(f('', 'x'), true);
  assert.equal(f('abc', ''), true);
});

test('_typeMatches：动漫/纪录片/综艺直接包含；动作片/喜剧片（纪录片单列）；国产剧/日韩剧/电视剧', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._typeMatches;
  assert.equal(f('动漫', '动漫'), true);
  assert.equal(f('纪录片', '纪录片'), true);
  assert.equal(f('综艺', '综艺'), true);
  assert.equal(f('电影', '动作片'), true);    // 片$ 且非纪录片
  assert.equal(f('电影', '动画电影'), true);  // 片$ 且非纪录片
  assert.equal(f('电影', '纪录片'), false);   // 纪录片单列
  assert.equal(f('电影', '电视剧'), false);   // 电视剧以"剧"结尾，不匹配电影
  assert.equal(f('剧集', '国产剧'), true);    // 剧$
  assert.equal(f('剧集', '日韩剧'), true);    // 剧$
  assert.equal(f('电影', ''), false);        // 无类型
});

test('_itemTypeExcluded：按 typeName/vodType 匹配排除列表', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._itemTypeExcluded;
  assert.equal(f({ typeName: '动漫' }, ['电影']), false);
  assert.equal(f({ typeName: '动作片' }, ['电影']), true);
  assert.equal(f({ typeName: '国产剧' }, ['剧集']), true);
  assert.equal(f({ vodType: '纪录片' }, ['电影']), false);  // 纪录片不被电影排除
  assert.equal(f({ typeName: '动漫' }, []), false);          // 空排除列表
});

test('_itemRegionExcluded：地区双向包含即隐藏', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._itemRegionExcluded;
  assert.equal(f({ area: '中国大陆' }, ['大陆']), true);  // a 含 b
  assert.equal(f({ area: '大陆' }, ['中国大陆']), true);  // b 含 a
  assert.equal(f({ area: '日本' }, ['大陆']), false);
  // 边界：空 area 经 _containsEither 空串子串命中 → 当前对任意非空地区过滤返回 true
  // （既有行为，抽取未改；若要让"未知地区"项不被误杀，应单独硬化 _containsEither，待用户决策）。
  assert.equal(f({ area: '' }, ['大陆']), true);
});

test('_itemYearExcluded：年份低于阈值即隐藏；无年份不剔除', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._itemYearExcluded;
  assert.equal(f({ year: '2020' }, 2021), true);   // 2020 < 2021
  assert.equal(f({ year: '2022' }, 2021), false);
  assert.equal(f({ year: 'abc' }, 2021), false);   // 非数字
  assert.equal(f({ year: '' }, 2021), false);
  assert.equal(f({}, 2021), false);
});

test('_itemScoreExcluded：score/vodScore 低于阈值即隐藏；无评分不误杀', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._itemScoreExcluded;
  assert.equal(f({ score: '8.5' }, 8), false);   // 8.5 >= 8
  assert.equal(f({ score: '7.0' }, 8), true);    // 7 < 8
  assert.equal(f({ vodScore: '9' }, 8), false);  // 回退到 vodScore
  assert.equal(f({ score: 'na' }, 8), false);    // 非数字
  assert.equal(f({}, 8), false);                 // 无评分
});

test('_itemKeywordExcluded：标题/简介/备注任一含关键词即隐藏（大小写不敏感）', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._itemKeywordExcluded;
  assert.equal(f({ title: '测试 电影' }, ['电影']), true);
  assert.equal(f({ content: '这是恐怖片' }, ['恐怖']), true);
  assert.equal(f({ remarks: 'HD' }, ['4K']), false);
  assert.equal(f({ title: 'Normal' }, []), false);
  assert.equal(f({ title: 'ABC' }, ['abc']), true);  // 大小写不敏感
});

test('_scoreKey：title|year 小写缓存键', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore._scoreKey;
  assert.equal(f({ title: 'Abc', year: '2020' }), 'abc|2020');
  assert.equal(f({ title: '', year: '' }), '|');
  assert.equal(f({ year: '2020' }), '|2020');
});

test('esc：HTML 五字符转义 + null/undefined/数字边界', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore.esc;
  assert.equal(typeof f, 'function');
  assert.equal(f('<a>&"\''), '&lt;a&gt;&amp;&quot;&#39;');
  assert.equal(f(null), '');
  assert.equal(f(undefined), '');
  assert.equal(f(123), '123');
});

test('trackLabel + TRACK_META：5 状态查表，未知返回空串', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const C = ctx.StellaflixVideo.onlineCore;
  assert.equal(Array.isArray(C.TRACK_META), true);
  assert.equal(C.TRACK_META.length, 5);
  assert.equal(C.TRACK_META[0].status, 'watching');
  assert.equal(C.TRACK_META[0].label, '在看');
  const f = C.trackLabel;
  assert.equal(f('watching'), '在看');
  assert.equal(f('planToWatch'), '想看');
  assert.equal(f('onHold'), '搁置');
  assert.equal(f('watched'), '看过');
  assert.equal(f('abandoned'), '抛弃');
  assert.equal(f('unknown'), '');
  assert.equal(f(''), '');
});

test('fmtAgo：相对时间格式化（毫秒时间戳），非法返回空串', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const f = ctx.StellaflixVideo.onlineCore.fmtAgo;
  assert.equal(typeof f, 'function');
  assert.equal(f(0), '');
  assert.equal(f(null), '');
  assert.equal(f(Date.now()), '刚刚');
  assert.equal(f(Date.now() - 5 * 60 * 1000), '5 分钟前');
  assert.equal(f(Date.now() - 3 * 3600 * 1000), '3 小时前');
  assert.equal(f(Date.now() - 2 * 86400 * 1000), '2 天前');
});

test('幂等守卫：core 重复加载不覆盖已有 facade', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const first = ctx.StellaflixVideo.onlineCore;
  assert.ok(first && typeof first._containsEither === 'function');
  loadCore(ctx); // 第二次加载应跳过（if (SFV.onlineCore) return）
  assert.equal(ctx.StellaflixVideo.onlineCore, first, 'facade 引用不变');
});

test('facade 形状：onlineCore 暴露 8 谓词 + esc/trackLabel/fmtAgo(函数) + TRACK_META(数组)', () => {
  const ctx = newCtx();
  loadCore(ctx);
  const C = ctx.StellaflixVideo.onlineCore;
  assert.ok(C && typeof C === 'object');
  for (const k of [
    '_containsEither', '_typeMatches', '_itemTypeExcluded', '_itemRegionExcluded',
    '_itemYearExcluded', '_itemScoreExcluded', '_itemKeywordExcluded', '_scoreKey',
    'esc', 'trackLabel', 'fmtAgo',
  ]) {
    assert.equal(typeof C[k], 'function', k + ' 应为 function');
  }
  assert.equal(Array.isArray(C.TRACK_META), true, 'TRACK_META 应为数组');
});
