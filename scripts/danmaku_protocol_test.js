/*
 * 弹幕数据/协议层测试（vm 沙箱，加载 public/video/danmaku 真实源码）
 * 覆盖（均移植自 Kazumi DanDanPlay 数据层，已按真实源码核对）：
 *   A. 颜色工具 —— generateDanmakuColor(24位int→{r,g,b}) / danmakuColorToInt 往返
 *   B. DanmakuEntry.fromJson —— 解析 p:"time,type,color,source" + m；三类弹幕；异常输入
 *   C. DanmakuEntry.toJson —— 与 fromJson 线格式一致；颜色往返
 *   D. DanmakuEpisode / DanmakuEpisodeResponse —— match 接口结构；fromTemplate；toJson
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function eq(a, b, msg) { assert(a === b, msg + ' (得到 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + ')'); }

const ROOT = path.resolve(__dirname, '..');
const files = ['public/video/danmaku/entry.js', 'public/video/danmaku/episode.js', 'public/video/danmaku/index.js'];

// 最小沙箱：window 即全局；仅需 console / URL
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.URL = URL;
sandbox.parseFloat = parseFloat;
sandbox.parseInt = parseInt;
sandbox.isNaN = isNaN;
sandbox.String = String;
sandbox.Number = Number;
sandbox.Array = Array;
sandbox.Object = Object;
sandbox.Math = Math;
vm.createContext(sandbox);

for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

const D = sandbox.StellaflixVideo.danmaku;
const T = D.DANMAKU_TYPE;

console.log('--- A. 颜色工具 ---');
(function () {
  const c = D.generateDanmakuColor(0xff0000);
  eq(c.r, 255, 'red 0xff0000 → r=255');
  eq(c.g, 0, 'red 0xff0000 → g=0');
  eq(c.b, 0, 'red 0xff0000 → b=0');
  const c2 = D.generateDanmakuColor(0x00ff00);
  eq(c2.g, 255, 'green 0x00ff00 → g=255');
  const back = D.danmakuColorToInt({ r: 255, g: 0, b: 0 });
  eq(back, 0xff0000, '往返 r255,g0,b0 → 0xff0000');
  const back2 = D.danmakuColorToInt(D.generateDanmakuColor(0x123456));
  eq(back2, 0x123456, '往返任意色 0x123456');
})();

console.log('--- B. DanmakuEntry.fromJson ---');
(function () {
  const e = D.DanmakuEntry.fromJson({ m: '你好', p: '12.5,1,16777215,[BiliBili]' });
  eq(e.message, '你好', 'message 解析');
  eq(e.time, 12.5, 'time 浮点解析');
  eq(e.type, 1, 'type=1 滚动');
  eq(e.color.r, 255, 'color 16777215 → r=255');
  eq(e.color.g, 255, 'color → g=255');
  eq(e.color.b, 255, 'color → b=255');
  eq(e.source, '[BiliBili]', 'source 解析');

  const top = D.DanmakuEntry.fromJson({ m: '顶', p: '3,5,16711680,[Gamer]' });
  eq(top.type, 5, 'type=5 顶部');
  eq(top.color.r, 255, 'color 0xff0000 → r=255');
  assert(top.isFixed(), 'type=5 视为固定弹幕(isFixed)');

  const bot = D.DanmakuEntry.fromJson({ m: '底', p: '4,4,255,' });
  eq(bot.type, 4, 'type=4 底部');
  eq(bot.source, '', 'source 缺省为空');

  const scroll = D.DanmakuEntry.fromJson({ m: '滚', p: '1,1,0,' });
  assert(!scroll.isFixed(), 'type=1 非固定弹幕');

  // 异常输入：缺 p / 缺 m / 非数字
  const noP = D.DanmakuEntry.fromJson({ m: 'x' });
  eq(noP.time, 0, '缺 p → time=0');
  eq(noP.type, 1, '缺 p → type 默认滚动');
  const nan = D.DanmakuEntry.fromJson({ m: 'y', p: 'abc,1,0,' });
  eq(nan.time, 0, 'p 首段非数字 → time=0');
  const nullJson = D.DanmakuEntry.fromJson(null);
  eq(nullJson, null, 'fromJson(null) → null');
})();

console.log('--- C. DanmakuEntry.toJson 往返 ---');
(function () {
  // 0xFFF000 = r255,g240,b0（故意用非全 255 的绿通道验证往返）
  const orig = { m: 'hello', p: '42.25,5,16773120,[BiliBili]' };
  const e = D.DanmakuEntry.fromJson(orig);
  const out = e.toJson();
  eq(out.m, 'hello', 'toJson.m 一致');
  const back = D.DanmakuEntry.fromJson(out);
  eq(back.time, 42.25, 'toJson→fromJson time 往返');
  eq(back.type, 5, 'toJson→fromJson type 往返');
  eq(back.source, '[BiliBili]', 'toJson→fromJson source 往返');
  eq(back.color.r, 255, 'color.r 往返 (0xFFF000)');
  eq(back.color.g, 240, 'color.g 往返 (0xFFF000 → 240)');
  eq(back.color.b, 0, 'color.b 往返 (0xFFF000 → 0)');
})();

console.log('--- D. DanmakuEpisode / DanmakuEpisodeResponse ---');
(function () {
  const resp = D.DanmakuEpisodeResponse.fromJson({
    bangumi: {
      animeId: 12345,
      episodes: [
        { episodeId: 1, episodeTitle: '第一集' },
        { episodeId: 2, episodeTitle: '第二集' }
      ]
    },
    success: true,
    errorCode: 0,
    errorMessage: ''
  });
  eq(resp.bangumiId, 12345, 'bangumiId 取自 animeId');
  eq(resp.episodes.length, 2, 'episodes 数量');
  eq(resp.episodes[0].episodeId, 1, 'ep0.episodeId');
  eq(resp.episodes[0].episodeTitle, '第一集', 'ep0.title');
  eq(resp.success, true, 'success 透传');
  eq(resp.errorCode, 0, 'errorCode 透传');

  // fromTemplate
  const tpl = D.DanmakuEpisodeResponse.fromTemplate();
  eq(tpl.success, false, 'template.success=false');
  eq(tpl.episodes.length, 0, 'template 无 episodes');

  // 缺 bangumi / 缺 episodes 容错
  const empty = D.DanmakuEpisodeResponse.fromJson({ success: false, errorCode: 404, errorMessage: 'not found' });
  eq(empty.episodes.length, 0, '缺 bangumi → 空 episodes');
  eq(empty.bangumiId, undefined, '缺 bangumi → bangumiId undefined');

  // toJson 结构（嵌套 bangumi.{animeId,episodes}）
  const out = resp.toJson();
  eq(out.bangumi.episodes.length, 2, 'toJson.bangumi.episodes 数量');
  eq(out.bangumi.episodes[1].episodeTitle, '第二集', 'toJson episode title');
  eq(out.bangumi.animeId, 12345, 'toJson.bangumi.animeId');
  const back = D.DanmakuEpisodeResponse.fromJson(out);
  eq(back.episodes.length, 2, 'toJson→fromJson episodes 往返');
  eq(back.bangumiId, 12345, 'toJson→fromJson bangumiId 往返');

  // null 入参 → template
  const n = D.DanmakuEpisodeResponse.fromJson(null);
  eq(n.success, false, 'fromJson(null) → template');
})();

console.log('--- E. 协议层就绪标记 ---');
eq(D.PROTOCOL_READY, true, 'SFV.danmaku.PROTOCOL_READY = true');

console.log('\n===== 弹幕数据/协议层测试 ' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) {
  console.log('失败项:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('=== ALL PASS ===');
process.exit(0);
