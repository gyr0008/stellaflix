/*
 * 弹幕渲染引擎 vm 沙箱测试
 * 加载真实源码 public/video/danmaku/{entry,episode,index,engine}.js
 * 测试纯逻辑：字重/颜色/类型过滤/屏蔽/去重/轨道分配/调度循环
 * DOM 渲染（_spawn）在无 document 的沙箱中不执行，用 _spawn 计数验证调度决策。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'video', 'danmaku');
const FILES = ['entry.js', 'episode.js', 'index.js', 'engine.js'];

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.Math = Math; sandbox.Object = Object; sandbox.String = String;
sandbox.Number = Number; sandbox.Array = Array; sandbox.Promise = Promise;
vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
}

const SFV = sandbox.StellaflixVideo;
const danmaku = SFV.danmaku;
const E = danmaku.engine;
const DANMAKU_TYPE = danmaku.DANMAKU_TYPE;
check('engine 挂载', !!E && !!E.DanmakuEngine);

// 1. 字重映射
check('resolveFontWeight(4)=400', E.resolveFontWeight(4) === 400);
check('resolveFontWeight(9)=900', E.resolveFontWeight(9) === 900);
check('resolveFontWeight(0)→clamp 100', E.resolveFontWeight(0) === 100);

// 2. 颜色
check('colorToCss 白', E.colorToCss({ r: 255, g: 255, b: 255 }) === 'rgb(255,255,255)');
check('colorToCss 红', E.colorToCss({ r: 255, g: 0, b: 0 }) === 'rgb(255,0,0)');

// 3. 类型过滤
const baseOpts = E.defaultOptions();
check('滚动 默认显示', E.shouldShow({ type: DANMAKU_TYPE.SCROLL }, baseOpts) === true);
check('顶部 默认显示', E.shouldShow({ type: DANMAKU_TYPE.TOP }, baseOpts) === true);
check('底部 默认隐藏', E.shouldShow({ type: DANMAKU_TYPE.BOTTOM }, baseOpts) === false);
const noTop = Object.assign({}, baseOpts, { showTop: false });
check('关闭顶部后头部隐藏', E.shouldShow({ type: DANMAKU_TYPE.TOP }, noTop) === false);

// 4. 关键词屏蔽
check('屏蔽命中', E.isBlocked('这是广告内容', ['广告']) === true);
check('屏蔽不命中', E.isBlocked('普通弹幕', ['广告']) === false);
check('空屏蔽词不误伤', E.isBlocked('任何文字', []) === false);

// 5. 去重键
check('dedupKey 区分类型', E.dedupKey({ type: 1, message: 'x' }) !== E.dedupKey({ type: 5, message: 'x' }));
check('dedupKey 同文本同类型', E.dedupKey({ type: 1, message: 'x' }) === E.dedupKey({ type: 1, message: 'x' }));

// 6. 穿越时长
const entry10 = { type: DANMAKU_TYPE.SCROLL, message: 'abcdefghij' };
const tt = E.traverseTime(entry10, baseOpts, 1280);
check('traverseTime 为正', tt > 0, 'tt=' + tt);
const fast = E.traverseTime(entry10, Object.assign({}, baseOpts, { scrollSpeed: 99999 }), 1280);
check('速度越大时长越短', fast < tt);

// 7. 滚动轨道分配
const tracks = [0, 0, 0];
let e1 = { type: DANMAKU_TYPE.SCROLL, message: 'aaaa' };
let t1 = E.pickScrollTrack(tracks, e1, 0, baseOpts, 1280, 3);
let t2 = E.pickScrollTrack(tracks, e1, 0, baseOpts, 1280, 3);
let t3 = E.pickScrollTrack(tracks, e1, 0, baseOpts, 1280, 3);
check('三条同时滚动分配不同轨道', t1 === 0 && t2 === 1 && t3 === 2, [t1, t2, t3].join(','));
let t4 = E.pickScrollTrack(tracks, e1, 0, baseOpts, 1280, 3);
check('无空闲且非海量→丢弃(-1)', t4 === -1);
const massive = Object.assign({}, baseOpts, { massiveMode: true });
let t5 = E.pickScrollTrack(tracks, e1, 0, massive, 1280, 3);
check('海量模式→选最早空闲轨道', t5 === 0);
// 时间推进超过穿越时长后轨道复用
let t6 = E.pickScrollTrack(tracks, e1, 9999, baseOpts, 1280, 3);
check('轨道空闲后复用', t6 === 0, 't6=' + t6);

// 8. 固定弹幕堆叠
const stack = [0, 0];
let s1 = E.pickFixedSlot(stack, 0, 8, baseOpts, 2);
let s2 = E.pickFixedSlot(stack, 0, 8, baseOpts, 2);
check('两条固定弹幕不同行', s1 === 0 && s2 === 1);
check('固定堆叠满→非海量丢弃', E.pickFixedSlot(stack, 0, 8, baseOpts, 2) === -1);

// 9. 调度循环（用 _spawn 计数验证决策）
function makeEntry(time, type, msg) {
  return danmaku.DanmakuEntry.fromJson({ p: time + ',' + type + ',16777215,', m: msg || ('d' + time) });
}
const eng = new E.DanmakuEngine(E.defaultOptions());
let spawnCount = 0;
eng._spawn = function () { spawnCount++; };
const entries = [
  makeEntry(1, DANMAKU_TYPE.SCROLL),
  makeEntry(2, DANMAKU_TYPE.SCROLL),
  makeEntry(3, DANMAKU_TYPE.TOP),
  makeEntry(4, DANMAKU_TYPE.BOTTOM) // 默认隐藏
];
eng.load(entries);
check('load 后按时间排序', eng.entries[0].time === 1 && eng.entries[3].time === 4);
eng.update(0); // 边界，不 spawn
check('update(0) 不 spawn', spawnCount === 0);
eng.update(2); // 应 spawn 前两条滚动
check('update(2) spawn 2 条滚动', spawnCount === 2, 'count=' + spawnCount);
check('pointer 推进到 2', eng.pointer === 2);
eng.update(4); // spawn 顶部(3)，底部(4)被隐藏跳过
check('update(4) 再 spawn 1 条(顶部)', spawnCount === 3, 'count=' + spawnCount);

// 10. 关键词屏蔽在调度中生效
const eng2 = new E.DanmakuEngine(Object.assign(E.defaultOptions(), { blockedWords: ['广告'] }));
let c2 = 0; eng2._spawn = function () { c2++; };
eng2.load([makeEntry(1, DANMAKU_TYPE.SCROLL, '这是广告'), makeEntry(2, DANMAKU_TYPE.SCROLL, '正常')]);
eng2.update(5);
check('屏蔽词弹幕被跳过(仅1条正常)', c2 === 1, 'count=' + c2);

// 11. 去重在调度中生效
const eng3 = new E.DanmakuEngine(Object.assign(E.defaultOptions(), { dedup: true, dedupWindow: 5 }));
let c3 = 0; eng3._spawn = function () { c3++; };
// 两条完全相同（同文本同类型）间隔 2s < 5s 窗口 → 第二条跳过
eng3.load([makeEntry(1, DANMAKU_TYPE.SCROLL, '重复弹幕'), makeEntry(3, DANMAKU_TYPE.SCROLL, '重复弹幕')]);
eng3.update(5);
check('去重窗口内重复弹幕仅 1 条', c3 === 1, 'count=' + c3);

// 12. seek 回退重置
eng.pointer = 4; eng.lastTime = 10;
eng.update(1); // 回退 → reset 并从头重放
check('seek 回退触发 reset(重新从头消费)', eng.pointer === 1 && eng.lastTime === 1);

console.log('\n弹幕引擎测试：' + pass + ' pass / ' + fail + ' fail');
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('=== ALL PASS ===');
process.exit(0);
