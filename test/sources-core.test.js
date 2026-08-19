// T-#6-A 回归闸门：sources-core.js 纯函数 / 存储 / 缓存层行为锁定。
// 在 vm 沙箱中加载 sources-core.js（不加载 sources.js IO 层），直接断言核心函数。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const store = {};
const fakeLocalStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

function loadCore() {
  const ctx = {
    window: null,
    document: { addEventListener() {}, createElement: () => ({}) },
    localStorage: fakeLocalStorage,
    console,
    URL, // normalizeSource 用 new global.URL(...)
  };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(ROOT, 'public/video/sources-core.js'), 'utf8');
  vm.runInContext(code, ctx);
  return ctx.StellaflixVideo.sources;
}

test('facade 含 __core 标记与全部存储/解析方法', () => {
  const S = loadCore();
  assert.equal(S.__core, true);
  ['getSources', 'getEnabledSources', 'addSource', 'updateSource', 'removeSource', 'setEnabled',
   'normalizeSource', 'readDetailCache', 'writeDetailCache', 'cacheValid',
   'buildListUrl', 'buildDetailUrl', 'buildDetailUrlWithApi',
   'parsePlayUrl', 'countEpisodes', 'normalizeVod', 'extractList', 'dedupe'].forEach((m) => {
    assert.equal(typeof S[m], 'function', '缺少方法: ' + m);
  });
});

test('normalizeSource 拒绝非法 scheme', () => {
  const S = loadCore();
  const r = S.normalizeSource({ name: 'x', api: 'ftp://bad' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported-scheme/);
});

test('normalizeSource 接受 https 并补全 hostname', () => {
  const S = loadCore();
  const r = S.normalizeSource({ api: 'https://example.com/api' });
  assert.equal(r.ok, true);
  assert.equal(r.source.api, 'https://example.com/api');
  assert.equal(r.source.name, 'example.com');
  assert.equal(r.source.enabled, true);
});

test('normalizeSource 忽略非法镜像', () => {
  const S = loadCore();
  const r = S.normalizeSource({ api: 'https://example.com/api', mirrors: ['not-a-url', 'https://m.com'] });
  assert.equal(r.ok, true);
  // 跨 vm realm 数组不可直接用 deepEqual，逐元素断言。
  assert.equal(r.source.mirrors.length, 1);
  assert.equal(r.source.mirrors[0], 'https://m.com/');
});

test('parsePlayUrl 基本解析 + 丢弃非 http 段', () => {
  const S = loadCore();
  const res = S.parsePlayUrl('default', 'a$https://x/1.mp4#https://x/2.mp4');
  assert.equal(res.length, 1);
  assert.equal(res[0].from, 'default');
  assert.equal(res[0].episodes.length, 2);
  // 段内第一个 $ 分隔「集名」与「地址」：name='a'，url=后续。
  assert.equal(res[0].episodes[0].name, 'a');
  assert.equal(res[0].episodes[0].url, 'https://x/1.mp4');
  // 非 http 段被忽略
  const res2 = S.parsePlayUrl('a', 'a$xxx#https://a/1.mp4');
  assert.equal(res2[0].episodes.length, 1);
  assert.equal(res2[0].episodes[0].url, 'https://a/1.mp4');
});

test('parsePlayUrl 多源 $$$ 分隔', () => {
  const S = loadCore();
  const res = S.parsePlayUrl('f1$$$f2', 'a$https://a/1.mp4#https://a/2.mp4$$$b$https://b/1.mp4');
  assert.equal(res.length, 2);
  assert.equal(res[0].from, 'f1');
  assert.equal(res[1].from, 'f2');
});

test('normalizeVod 丢弃无 vod_id', () => {
  const S = loadCore();
  assert.equal(S.normalizeVod(null, {}), null);
  assert.equal(S.normalizeVod({ vod_name: 'x' }, {}), null);
  const v = S.normalizeVod({ vod_id: 5, vod_name: 'Test' }, { id: 's1', name: 'Src' });
  assert.equal(v.key, 's1:5');
  assert.equal(v.title, 'Test');
  assert.equal(v.sourceId, 's1');
});

test('dedupe 同片名+年份归并 variants', () => {
  const S = loadCore();
  const out = S.dedupe([
    { title: 'A', year: '2020', sourceId: 's1' },
    { title: 'A', year: '2020', sourceId: 's2' },
    { title: 'B', year: '2021', sourceId: 's1' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].variants.length, 2);
  assert.equal(out[1].variants.length, 1);
});

test('countEpisodes 与 search-filter-junk 期望一致', () => {
  const S = loadCore();
  assert.equal(S.countEpisodes(''), 0);
  assert.equal(S.countEpisodes(null), 0);
  assert.equal(S.countEpisodes('a$https://x/1.mp4#https://x/2.mp4'), 2);
  assert.equal(S.countEpisodes('m3u8$https://x/1.m3u8#https://x/2.m3u8#https://x/3.m3u8'), 3);
  assert.equal(S.countEpisodes('a$https://a/1.mp4#https://a/2.mp4$$$b$'), 2);
  assert.equal(S.countEpisodes('a$xxx#https://a/1.mp4'), 1);
  assert.equal(S.countEpisodes('play$https://v/only.mp4'), 1);
});

test('extractList 兼容多种包装', () => {
  const S = loadCore();
  // 跨 vm realm 数组用 JSON.stringify 比较，避免 deepEqual realm 报错。
  assert.equal(JSON.stringify(S.extractList({ list: [1, 2] })), JSON.stringify([1, 2]));
  assert.equal(JSON.stringify(S.extractList({ data: [3] })), JSON.stringify([3]));
  assert.equal(JSON.stringify(S.extractList({ data: { list: [4, 5] } })), JSON.stringify([4, 5]));
  assert.equal(JSON.stringify(S.extractList(null)), JSON.stringify([]));
  assert.equal(JSON.stringify(S.extractList('nope')), JSON.stringify([]));
});

test('存储 addSource / getSources / removeSource（出厂为空）', () => {
  const S = loadCore();
  assert.equal(S.getSources().length, 0); // 出厂为空数组
  const added = S.addSource({ name: 'S1', api: 'https://s1.com/api' });
  assert.equal(added.ok, true);
  assert.equal(S.getSources().length, 1);
  // 重复 api 被拒
  const dup = S.addSource({ api: 'https://s1.com/api' });
  assert.equal(dup.ok, false);
  assert.equal(dup.reason, 'duplicate-api');
  // 删除
  S.removeSource(added.source.id);
  assert.equal(S.getSources().length, 0);
});
