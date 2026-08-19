// 验证：搜索筛选「智能屏蔽」垃圾视频（A 预置词库 + C 集数结构识别）
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const store = {};
const fakeLocalStorage = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

function makeCtx() {
  const ctx = {
    window: null,
    document: {
      body: { classList: { toggle: () => {}, contains: () => false } },
      addEventListener: () => {},
      createElement: () => ({ classList: { toggle: () => {} }, appendChild: () => {}, setAttribute: () => {} })
    },
    localStorage: fakeLocalStorage,
    CustomEvent: function (name, init) { this.name = name; this.detail = init && init.detail; },
    dispatchEvent: () => {},
    console: console
  };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  return ctx;
}

const coreCode = fs.readFileSync(path.join(ROOT, 'public/video/search-filter-core.js'), 'utf8');
const sourcesCoreCode = fs.readFileSync(path.join(ROOT, 'public/video/sources-core.js'), 'utf8');
const sourcesCode = fs.readFileSync(path.join(ROOT, 'public/video/sources.js'), 'utf8');

let pass = 0, fail = 0;
function expect(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log('  PASS:', name, '=', JSON.stringify(got)); }
  else { fail++; console.log('  FAIL:', name, 'got=' + JSON.stringify(got), 'want=' + JSON.stringify(want)); }
}
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name); }
}

// === 加载模块 ===
const ctx = makeCtx();
vm.runInContext(coreCode, ctx);
vm.runInContext(sourcesCoreCode, ctx);
vm.runInContext(sourcesCode, ctx);
const Core = ctx.StellaflixVideo.SearchFilterCore;
const Sources = ctx.StellaflixVideo.sources;

console.log('--- A. 智能屏蔽默认池 ---');
ok('DEFAULT_JUNK_TYPES 存在且为数组', Array.isArray(Core.DEFAULT_JUNK_TYPES));
expect('DEFAULT_JUNK_TYPES 含 微短剧', Core.DEFAULT_JUNK_TYPES.indexOf('微短剧') >= 0, true);
expect('DEFAULT_JUNK_TYPES 含 竖屏剧', Core.DEFAULT_JUNK_TYPES.indexOf('竖屏剧') >= 0, true);
expect('DEFAULT_JUNK_TYPES 含 AI漫剧', Core.DEFAULT_JUNK_TYPES.indexOf('AI漫剧') >= 0, true);
ok('DEFAULT_JUNK_KEYWORDS 存在且为数组', Array.isArray(Core.DEFAULT_JUNK_KEYWORDS));
expect('DEFAULT_JUNK_KEYWORDS 含 竖屏短剧', Core.DEFAULT_JUNK_KEYWORDS.indexOf('竖屏短剧') >= 0, true);
expect('DEFAULT_JUNK_KEYWORDS 含 霸总', Core.DEFAULT_JUNK_KEYWORDS.indexOf('霸总') >= 0, true);
expect('DEFAULT_JUNK_KEYWORDS 含 龙傲天', Core.DEFAULT_JUNK_KEYWORDS.indexOf('龙傲天') >= 0, true);

console.log('--- B. buildJunkDefaults 返回全新数组 ---');
const jd1 = Core.buildJunkDefaults();
const jd2 = Core.buildJunkDefaults();
ok('返回对象含 excludeTypes', Array.isArray(jd1.excludeTypes));
ok('返回对象含 excludeKeywords', Array.isArray(jd1.excludeKeywords));
expect('与常量不是同一引用（types）', jd1.excludeTypes !== Core.DEFAULT_JUNK_TYPES, true);
expect('两次调用返回不同引用', jd1.excludeTypes !== jd2.excludeTypes, true);
expect('默认含 6 个类型', jd1.excludeTypes.length, 6);

console.log('--- C. SearchFilterState 集数维度 ---');
const st = new Core.SearchFilterState({ excludeEpisodeAbove: 80 });
expect('excludeEpisodeAbove 读取', st.excludeEpisodeAbove, 80);
expect('hasAdvancedFilters 因集数阈值 true', st.hasAdvancedFilters(), true);
const stEmpty = new Core.SearchFilterState({});
expect('空构造 excludeEpisodeAbove 为 null', stEmpty.excludeEpisodeAbove, null);
expect('空构造 hasAdvancedFilters false', stEmpty.hasAdvancedFilters(), false);
const cp = st.copyWith();
expect('copyWith 保留 excludeEpisodeAbove', cp.excludeEpisodeAbove, 80);
const cp2 = stEmpty.copyWith({ excludeEpisodeAbove: 120 });
expect('copyWith 覆盖 excludeEpisodeAbove', cp2.excludeEpisodeAbove, 120);

console.log('--- D. 注入 junk 默认后 advanced 生效 ---');
const stJunk = new Core.SearchFilterState(Core.buildJunkDefaults());
expect('注入 junk 后 excludeTypes 非空', stJunk.excludeTypes.length > 0, true);
expect('注入 junk 后 hasAdvancedFilters true', stJunk.hasAdvancedFilters(), true);

console.log('--- E. countEpisodes（结构识别）---');
ok('sources.countEpisodes 为函数', typeof Sources.countEpisodes === 'function');
expect('空串 → 0', Sources.countEpisodes(''), 0);
expect('null → 0', Sources.countEpisodes(null), 0);
expect('单源 2 集 → 2', Sources.countEpisodes('a$https://x/1.mp4#https://x/2.mp4'), 2);
expect('单源 3 集(m3u8) → 3',
  Sources.countEpisodes('m3u8$https://x/1.m3u8#https://x/2.m3u8#https://x/3.m3u8'), 3);
expect('多源取最大：2 vs 90 → 90',
  Sources.countEpisodes('a$https://a/1.mp4#https://a/2.mp4$$$b$' +
    Array.from({ length: 90 }, function (_, i) { return 'https://b/' + (i + 1) + '.mp4'; }).join('#')), 90);
expect('非 http 段被忽略 → 1', Sources.countEpisodes('a$xxx#https://a/1.mp4'), 1);
expect('电影单集 → 1（天然安全）', Sources.countEpisodes('play$https://v/only.mp4'), 1);

console.log('---');
console.log('Total: pass=' + pass + ', fail=' + fail);
process.exit(fail ? 1 : 0);
