/*
 * Stellaflix TMDB 客户端单元测试（vm 沙箱 + mock fetch）
 * 真实网络已由 curl 验证（HTTP 200 + 中文数据），本测试覆盖纯逻辑层：
 *   search / bestMatch / getDetails / posterUrl / hasKey / 无 key 拒绝。
 * 运行：node scripts/tmdb_test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public', 'video', 'tmdb.js');
const code = fs.readFileSync(SRC, 'utf8');

// mock 数据（基于真实 curl 响应结构）
const SEARCH_JSON = { page: 1, results: [
  { media_type: 'tv', id: 1429, name: '进击的巨人', original_name: '進撃の巨人',
    overview: '曾几何时，世界上突然出现无数身形庞大的巨人……', poster_path: '/1j3s19nko8OtGhCRwRMDGmr0m5O.jpg',
    vote_average: 8.684, first_air_date: '2013-04-07' },
  { media_type: 'person', id: 999, name: '某人', overview: '', profile_path: '/x.jpg' },
  { media_type: 'movie', id: 123, title: '进击的巨人真人版', overview: '真人版',
    poster_path: '/9TRg9JrhqJukE7Fd1KD4P0gb2sW.jpg', vote_average: 6.12, release_date: '2015-01-01' }
] };
const DETAIL_JSON = { id: 1429, media_type: 'tv', name: '进击的巨人',
  overview: '详情简介：人类与巨人的战争……', poster_path: '/1j3s19nko8OtGhCRwRMDGmr0m5O.jpg',
  backdrop_path: '/rqbCbjB19amtOtFQbb3K2lgm2zv.jpg', vote_average: 8.684, first_air_date: '2013-04-07' };

function mockFetch(url) {
  const marker = '/api/proxy?url=';
  const idx = url.indexOf(marker);
  const target = decodeURIComponent(url.slice(idx + marker.length));
  let body;
  if (target.includes('/search/multi')) body = SEARCH_JSON;
  else if (target.match(/\/(movie|tv)\/\d+/)) body = DETAIL_JSON;
  else body = { results: [] };
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

const sandbox = {
  fetch: mockFetch, console, Object, JSON,
  encodeURIComponent, decodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.window = undefined; // 强制 global = this(=sandbox)
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const tmdb = sandbox.StellaflixVideo.tmdb;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ' == ' + JSON.stringify(b) + ')', a === b); }

(async () => {
  ok('hasKey 默认 true（开发期 key 已内置）', tmdb.hasKey() === true);
  eq('posterUrl 拼接', tmdb.posterUrl('/a.jpg', 'w500'), 'https://image.tmdb.org/t/p/w500/a.jpg');
  eq('posterUrl 默认 w500', tmdb.posterUrl('/a.jpg'), 'https://image.tmdb.org/t/p/w500/a.jpg');

  const list = await tmdb.search('进击的巨人');
  ok('search 返回数组', Array.isArray(list));
  eq('search 过滤 person（3→2）', list.length, 2);
  eq('search 第一条标题=进击的巨人', list[0].title, '进击的巨人');
  ok('search poster 为完整 CDN URL', list[0].poster.startsWith('https://image.tmdb.org/t/p/'));
  eq('search 评分', list[0].rating, 8.684);
  eq('search 年份', list[0].year, '2013');

  const m = await tmdb.bestMatch('进击的巨人');
  ok('bestMatch 返回首条', m && m.title === '进击的巨人');

  const d = await tmdb.getDetails(1429, 'tv');
  ok('getDetails 有简介', typeof d.overview === 'string' && d.overview.length > 0);
  ok('getDetails poster 完整 URL', d.poster.startsWith('https://image.tmdb.org/t/p/'));
  ok('getDetails backdrop 完整 URL', d.backdrop && d.backdrop.startsWith('https://image.tmdb.org/t/p/'));

  tmdb.setApiKey('');
  ok('无 key hasKey=false', tmdb.hasKey() === false);
  let rejected = false;
  try { await tmdb.search('x'); } catch (e) { rejected = (e.message === 'TMDB_KEY_REQUIRED'); }
  ok('无 key search reject TMDB_KEY_REQUIRED', rejected);
  tmdb.setApiKey('9dec1a00115e77d571c734a831289c30');

  console.log('\nTMDB TEST: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
