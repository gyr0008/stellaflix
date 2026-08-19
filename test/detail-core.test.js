/*
 * detail-core.js 拆分回归测试
 * 锁 候选/embed 分类 + logo 挑选 纯层行为，作为 #6-序1 拆债闸门。
 * 跨 realm 比较用 JSON.stringify / typeof，避免 vm 沙箱数组 deepEqual 陷阱。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadCore() {
  const code = fs.readFileSync(path.join(ROOT, 'public/video/detail-core.js'), 'utf8');
  const ctx = { window: null, document: null, console };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const SFV = ctx.StellaflixVideo;
  assert.ok(SFV && SFV.detail, 'SFV.detail 应已定义');
  return SFV.detail;
}

test('isKazumiView 识别 kazumi 规则源', () => {
  const D = loadCore();
  assert.equal(D.isKazumiView({ ruleName: 'ikun' }), true);
  assert.equal(D.isKazumiView({ isKazumi: true }), true);
  assert.equal(D.isKazumiView({ source: { id: 'kazumi:ikun' } }), true);
  assert.equal(D.isKazumiView({ source: { id: 'cms:demo' } }), false);
  assert.equal(D.isKazumiView({}), false);
  assert.equal(D.isKazumiView(null), false);
});

test('pickBestLogo 语言优先级 zh>en>null>其他，同语按评分降序', () => {
  const D = loadCore();
  assert.equal(D.pickBestLogo(null), null);
  assert.equal(D.pickBestLogo([]), null);
  const logos = [
    { iso_639_1: 'en', file_path: 'en.png', vote_average: 9 },
    { iso_639_1: 'zh', file_path: 'zh.png', vote_average: 5 },
    { iso_639_1: null, file_path: 'no.png', vote_average: 10 },
    { iso_639_1: 'fr', file_path: 'fr.png', vote_average: 8 }
  ];
  const best = D.pickBestLogo(logos);
  assert.equal(best.file_path, 'zh.png', 'zh 应最优先');
  // 同 zh 内按评分：两个 zh 时高分为先
  const zh = [
    { iso_639_1: 'zh', file_path: 'zh-low', vote_average: 3 },
    { iso_639_1: 'zh', file_path: 'zh-high', vote_average: 7 }
  ];
  assert.equal(D.pickBestLogo(zh).file_path, 'zh-high');
});

test('classifyCandidateEmbed cms 恒 false；kazumi 按规则模式', () => {
  const D = loadCore();
  assert.equal(D.classifyCandidateEmbed(null), false);
  assert.equal(D.classifyCandidateEmbed({ kind: 'cms' }), false);
  // 无 kazumi 模块 → 安全降级 false
  assert.equal(D.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'x' }), false);
  // 注入 getRuleMode 模拟
  const code = fs.readFileSync(path.join(ROOT, 'public/video/detail-core.js'), 'utf8');
  const ctx = { window: null, document: null, console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.StellaflixVideo.kazumi = { getRuleMode: (rn) => (rn === 'webRule' ? 'web' : (rn === 'apiRule' ? 'api' : null)) };
  const D2 = ctx.StellaflixVideo.detail;
  assert.equal(D2.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'webRule' }), true);
  assert.equal(D2.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'apiRule' }), false);
  assert.equal(D2.classifyCandidateEmbed({ kind: 'kazumi', ruleName: 'unknown' }), false);
});

test('buildCandidates 拼装 cms + kazumi 候选并带 isEmbed', () => {
  const D = loadCore();
  const arr = [
    { items: [{ title: '电影A', year: 2024, sourceId: 'cms1', sourceName: '源1', vodId: '99', variants: [{ sourceId: 'cms1', sourceName: '源1', vodId: '99', remarks: '高清' }] }] },
    { items: [{ title: '电影A', ruleName: 'ikun', src: 'http://x' }] }
  ];
  const cands = D.buildCandidates(arr, { title: '电影A' });
  assert.equal(cands.length, 2);
  assert.equal(cands[0].kind, 'cms');
  assert.equal(cands[0].isEmbed, false);
  assert.equal(cands[0].id, 'cms:cms1:99');
  assert.equal(cands[1].kind, 'kazumi');
  assert.equal(cands[1].id, 'kz:ikun:http://x');
  // 无候选
  assert.equal(JSON.stringify(D.buildCandidates([{ items: [] }, { items: [] }], { title: 'x' })), JSON.stringify([]));
});

test('幂等守卫：detail-core 与 detail 共享 SFV.detail 命名空间', () => {
  const code = fs.readFileSync(path.join(ROOT, 'public/video/detail-core.js'), 'utf8');
  const ctx = { window: null, document: null, console };
  ctx.window = ctx; ctx.global = ctx; vm.createContext(ctx);
  vm.runInContext(code, ctx);
  // 模拟 detail.js 已预设 SFV.detail（含 build），detail-core 应 return 不覆盖
  ctx.StellaflixVideo.detail = { build: function () {}, isKazumiView: 'old' };
  vm.runInContext(code, ctx);
  assert.equal(ctx.StellaflixVideo.detail.build !== undefined, true, 'detail 既有 facade 不被覆盖');
  assert.equal(ctx.StellaflixVideo.detail.isKazumiView, 'old', 'detail-core 幂等守卫保留首次定义');
});

test('buildCandidates 注入稳定 sourceKey（审查 P1 隔离键）', () => {
  const D = loadCore();
  const arr = [
    { items: [{ title: '电影A', sourceId: 'cms1', sourceName: '源1', vodId: '99', variants: [{ sourceId: 'cms1', sourceName: '源1', vodId: '99' }] }] },
    { items: [{ title: '电影A', ruleName: 'ikun', src: 'http://x' }] }
  ];
  const cands = D.buildCandidates(arr, { title: '电影A' });
  assert.equal(cands[0].sourceKey, 'cms:cms1', 'CMS 候选绑定源持久 id');
  assert.equal(cands[1].sourceKey, 'kazumi:ikun', 'Kazumi 候选绑定规则名');
  // 同名展示但不同源 → sourceKey 必不同（隔离不被破坏）
  const cands2 = D.buildCandidates([
    { items: [{ title: '电影A', sourceId: 'cms1', sourceName: '同名源', vodId: '1', variants: [{ sourceId: 'cms1', sourceName: '同名源', vodId: '1' }] }] },
    { items: [{ title: '电影A', sourceId: 'cms2', sourceName: '同名源', vodId: '1', variants: [{ sourceId: 'cms2', sourceName: '同名源', vodId: '1' }] }] }
  ], { title: '电影A' });
  assert.notEqual(cands2[0].sourceKey, cands2[1].sourceKey, '同名源靠 id 区分，不串台');
});

test('alignEpisodeByIdentifier 按集名跨线路精确对齐（审查 P7）', () => {
  const D = loadCore();
  const plays = [
    { from: '线路A', episodes: [
      { name: '第1集', url: 'a1' }, { name: '第2集', url: 'a2' }, { name: '第3集', url: 'a3' } ] },
    { from: '线路B', episodes: [
      { name: '第1集', url: 'b1' }, { name: '第2集', url: 'b2' } ] }
  ];
  // 第2集 → 切到线路B 同名匹配
  const r = D.alignEpisodeByIdentifier(plays, 1, '第2集', 1);
  assert.equal(r.matched, true);
  assert.equal(r.episode.url, 'b2');
  assert.equal(r.fromIndex, 1);
});

test('alignEpisodeByIdentifier 集数不等/无同名 → 返回 null 不静默错集', () => {
  const D = loadCore();
  const plays = [
    { from: '线路A', episodes: [ { name: '第1集', url: 'a1' }, { name: '第2集', url: 'a2' }, { name: '第3集', url: 'a3' } ] },
    { from: '线路B', episodes: [ { name: '第1集', url: 'b1' }, { name: '第2集', url: 'b2' } ] }
  ];
  // 线路A 第3集（仅 A 有）切到线路B → 无同名 → null（S级，不静默播 b2 错位）
  const r1 = D.alignEpisodeByIdentifier(plays, 1, '第3集', 2);
  assert.equal(r1, null, '目标线路无此集名应返回 null 而非越界/错集');
  // 越界线路索引 → null
  assert.equal(D.alignEpisodeByIdentifier(plays, 9, '第1集', 0), null, '线路索引越界返回 null');
  assert.equal(D.alignEpisodeByIdentifier(plays, -1, '第1集', 0), null);
  assert.equal(D.alignEpisodeByIdentifier([], 0, '第1集', 0), null, '空线路返回 null');
});

test('alignEpisodeByIdentifier 顺序不一致（特别篇插中间）不按 index 误匹配', () => {
  const D = loadCore();
  // 线路B 在中间插入特别篇，导致同 index 指向不同集
  const plays = [
    { from: '线路A', episodes: [ { name: '第1集', url: 'a1' }, { name: '第2集', url: 'a2' }, { name: '第3集', url: 'a3' } ] },
    { from: '线路B', episodes: [ { name: '第1集', url: 'b1' }, { name: '特别篇', url: 'bx' }, { name: '第2集', url: 'b2' }, { name: '第3集', url: 'b3' } ] }
  ];
  // 当前在线路A 第2集，若按 index=1 取 B 会得到「特别篇」(错集)；按名应得 b2
  const byName = D.alignEpisodeByIdentifier(plays, 1, '第2集', 1);
  assert.equal(byName.matched, true);
  assert.equal(byName.episode.url, 'b2', '按名对齐跳过特别篇，不误取 index 同位');
  // 从线路B「特别篇」切到线路A → A 无此集 → null（正确提示，非错集）
  const sp = D.alignEpisodeByIdentifier(plays, 0, '特别篇', 1);
  assert.equal(sp, null, 'A 线无特别篇应 null');
});

test('alignEpisodeByIdentifier 无标识 index 兜底且越界保护', () => {
  const D = loadCore();
  const plays = [ { from: '线路A', episodes: [ { name: '第1集', url: 'a1' } ] } ];
  const r = D.alignEpisodeByIdentifier(plays, 0, null, 0);
  assert.equal(r.matched, false, '无标识回退 index');
  assert.equal(r.episode.url, 'a1');
  // 越界 index 兜底 → null（防崩溃）
  assert.equal(D.alignEpisodeByIdentifier(plays, 0, null, 5), null, 'index 越界返回 null');
});
