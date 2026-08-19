/*
 * movie-filter-config.js 拆分回归测试
 * 锁 常量+状态层 的行为与值，作为 #6-B 拆债闸门。
 *
 * 注意：vm 沙箱返回的数组属于 vm realm 的 Array，
 * node:assert/strict 的 deepEqual 会报 "not reference-equal"（值实际相等）。
 * 故跨 realm 比较统一用 JSON.stringify 或 typeof/长度断言。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadConfig() {
  const code = fs.readFileSync(path.join(ROOT, 'public/video/movie-filter-config.js'), 'utf8');
  const ctx = { window: null, document: null, console };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const SFV = ctx.StellaflixVideo;
  assert.ok(SFV && SFV.movieFilterConfig, 'SFV.movieFilterConfig 应已定义');
  return SFV.movieFilterConfig;
}

test('SORT_OPTIONS 为 3 项且含 TMDB sortBy', () => {
  const C = loadConfig();
  assert.equal(typeof C.SORT_OPTIONS, 'object');
  assert.equal(C.SORT_OPTIONS.length, 3);
  const keys = C.SORT_OPTIONS.map((o) => o.key);
  assert.equal(JSON.stringify(keys), JSON.stringify(['popularity', 'rating', 'newest']));
  const hasSortBy = C.SORT_OPTIONS.every((o) => typeof o.sortBy === 'string');
  assert.equal(hasSortBy, true);
});

test('REGION_OPTIONS 为 5 项，首项华语 language=zh', () => {
  const C = loadConfig();
  assert.equal(C.REGION_OPTIONS.length, 5);
  assert.equal(C.REGION_OPTIONS[0].key, 'cn');
  assert.equal(C.REGION_OPTIONS[0].language, 'zh');
  const last = C.REGION_OPTIONS[C.REGION_OPTIONS.length - 1];
  assert.equal(last.key, 'other');
  assert.equal(last.language, null);
});

test('MOVIE_GENRES / DOC_GENRES 数量与可见数', () => {
  const C = loadConfig();
  assert.equal(C.MOVIE_GENRES.length, 17);
  assert.equal(C.DOC_GENRES.length, 14);
  assert.equal(C.MOVIE_GENRE_VISIBLE, 6);
  assert.equal(C.DOC_GENRE_VISIBLE, 6);
  // 电影纪录片类别映射 genre 99
  const doc99 = C.MOVIE_GENRES.find((g) => g.id === 99);
  assert.ok(doc99, 'MOVIE_GENRES 应含 id=99 纪录片类别');
});

test('buildYearOptions 返回最近5年 + 4 段更早', () => {
  const C = loadConfig();
  const y = C.buildYearOptions();
  assert.equal(y.recent.length, 5);
  assert.equal(y.earlier.length, 4);
  // 最近年份应为当前年
  const now = new Date().getFullYear();
  assert.equal(y.recent[0], now);
  // 每段含 min/max
  const allHaveRange = y.earlier.every((s) => typeof s.min === 'number' && typeof s.max === 'number');
  assert.equal(allHaveRange, true);
});

test('createState 默认 movie/popularity 且三类 Set 为空', () => {
  const C = loadConfig();
  const st = C.createState();
  assert.equal(st.category, 'movie');
  assert.equal(st.sort, 'popularity');
  assert.equal(JSON.stringify(st.years), JSON.stringify({}));
  assert.equal(JSON.stringify(st.genres), JSON.stringify({}));
  assert.equal(JSON.stringify(st.regions), JSON.stringify({}));
});

test('cloneSets 浅拷贝状态中的 Set 对象', () => {
  const C = loadConfig();
  const st = C.createState();
  st.years['2026'] = true;
  const cp = C.cloneSets(st);
  assert.equal(JSON.stringify(cp.years), JSON.stringify({ '2026': true }));
  // 浅拷贝：修改副本不影响原
  cp.years['2025'] = true;
  assert.equal(st.years['2025'], undefined);
});

test('幂等守卫：重复执行不覆盖', () => {
  const code = fs.readFileSync(path.join(ROOT, 'public/video/movie-filter-config.js'), 'utf8');
  const ctx = { window: null, document: null, console };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const first = ctx.StellaflixVideo.movieFilterConfig;
  // 篡改再重跑，应保留首次定义
  first.__tampered = true;
  vm.runInContext(code, ctx);
  const second = ctx.StellaflixVideo.movieFilterConfig;
  assert.equal(second.__tampered, true, '幂等守卫应保留首次定义');
});
