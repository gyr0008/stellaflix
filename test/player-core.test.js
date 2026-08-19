/*
 * player-core.js F5 回归测试
 * 锁：makeEpisodeSelection 值对象（对齐 Kazumi VideoEpisodeSelection）
 *     - 内容相等（equals）
 *     - 稳定 key（"road:episode"）
 *     - 确定性 hash（同值相等 / 异值不等）
 *     - toString 可读性
 * 用 vm 沙箱加载模块（player-core 为纯层，无 DOM 依赖）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

test('makeEpisodeSelection 值对象 equals/key/hash/toString（F5）', () => {
  const ctx = { window: null, console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  const code = fs.readFileSync(path.join(ROOT, 'public/video/player-core.js'), 'utf8');
  vm.runInContext(code, ctx);
  const PC = ctx.StellaflixVideo.playerCore;
  assert.ok(PC && typeof PC.makeEpisodeSelection === 'function', 'playerCore.makeEpisodeSelection 应存在');

  const a = PC.makeEpisodeSelection(2, 5);
  const b = PC.makeEpisodeSelection(2, 5);
  const c = PC.makeEpisodeSelection(2, 6);

  assert.equal(a.equals(b), true, '同 road/episode 应相等');
  assert.equal(a.equals(c), false, '异 episode 应不等');
  assert.equal(a.key(), '2:5', 'key 应为 "road:episode"');
  assert.equal(a.hash(), b.hash(), '同值 hash 应相等');
  assert.equal(a.hash() !== c.hash(), true, '异值 hash 应不等');
  assert.ok(/EpisodeSelection/.test(a.toString()), 'toString 应含类型名');

  // 边界：非整数入参应被 |0 归一
  const d = PC.makeEpisodeSelection('3', '7');
  assert.equal(d.road, 3, 'road 应被 |0 归一');
  assert.equal(d.episode, 7, 'episode 应被 |0 归一');
  assert.equal(d.key(), '3:7');
});
