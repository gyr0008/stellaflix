const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const ROOT = path.join(__dirname, '..');

// 在 vm 沙箱中加载 kazumi-bridge-core.js（纯算法层，零 DOM/localStorage/Kazumi 依赖）。
// 注意 realm 陷阱：vm 返回的数组是沙箱 realm 的 Array 实例，与宿主 deepEqual 会报
// "not reference-equal" 而 FAIL（值实际相等）。比较一律用 JSON.stringify / 标量 ===。
function loadCore() {
  const store = {};
  const ctx = {};
  ctx.window = ctx; ctx.global = ctx;
  ctx.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  ctx.JSON = JSON; ctx.URL = URL; ctx.Array = Array;
  ctx.Object = Object; ctx.String = String; ctx.Number = Number; ctx.RegExp = RegExp;
  ctx.console = console;
  ctx.StellaflixVideo = {};
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(ROOT, 'public/video/kazumi-bridge-core.js'), 'utf8');
  vm.runInContext(code, ctx);
  return ctx.StellaflixVideo.kazumiCore;
}

test('hash 确定性且带 k 前缀', () => {
  const KC = loadCore();
  const h = KC.hash('abc');
  assert.equal(typeof h, 'string');
  assert.ok(h.startsWith('k'));
  assert.equal(h, KC.hash('abc'));
  assert.notEqual(h, KC.hash('abd'));
});

test('cmsJsonPathRead 求值列表/字段', () => {
  const KC = loadCore();
  const doc = { list: [{ name: 'A' }, { name: 'B' }] };
  // 列表通配返回数组（简易实现不支持 arr[*].field 一步取子字段，仅返回整元素）
  const list = KC.cmsJsonPathRead(doc, '$.list[*]');
  assert.ok(Array.isArray(list));
  assert.equal(list.length, 2);
  // 单字段取值（点号路径）
  assert.equal(KC.cmsJsonPathFirst(doc, '$.list[0].name'), 'A');
  // 不存在路径 → undefined
  assert.equal(KC.cmsJsonPathFirst(doc, '$.nope'), undefined);
  // 非 $ 前缀 → []
  assert.equal(KC.cmsJsonPathRead(doc, 'list').length, 0);
});

test('parseApiSearchRaw 富化海报/ID', () => {
  const KC = loadCore();
  const raw = JSON.stringify({ list: [{ vod_name: 'X', vod_id: '1', vod_pic: 'p.jpg' }] });
  const items = KC.parseApiSearchRaw(raw, {});
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'X');
  assert.equal(items[0].src, '1');
  assert.equal(items[0].pic, 'p.jpg');
  assert.equal(items[0].vodId, '1');
  // 缺 src 字段跳过
  const raw2 = JSON.stringify({ list: [{ vod_name: 'Y' }] });
  assert.equal(KC.parseApiSearchRaw(raw2, {}).length, 0);
  // 非法 JSON → []
  assert.equal(KC.parseApiSearchRaw('not json', {}).length, 0);
});

test('cmsRenderTpl 占位符替换 + lookbehind 保护', () => {
  const KC = loadCore();
  assert.equal(KC.cmsRenderTpl('@keyword', { keyword: '猫' }), '猫');
  assert.equal(KC.cmsRenderTpl('@keyword/@source', { keyword: 'a', source: 'b' }), 'a/b');
  // 字母前的 @ 不被替换（lookbehind (?<![A-Za-z0-9_])）
  assert.equal(KC.cmsRenderTpl('pre@b', { b: 'X' }), 'pre@b');
  // 缺失变量保留原样
  assert.equal(KC.cmsRenderTpl('@missing', {}), '@missing');
});

test('normalizeUrlLocal 绝对/相对', () => {
  const KC = loadCore();
  assert.equal(KC.normalizeUrlLocal('http://a.com/b/', 'c.m3u8'), 'http://a.com/b/c.m3u8');
  assert.equal(KC.normalizeUrlLocal('http://a.com', 'http://x/y.m3u8'), 'http://x/y.m3u8');
  assert.equal(KC.normalizeUrlLocal('', '/rel.mp4'), '/rel.mp4');
  assert.equal(KC.normalizeUrlLocal('', ''), '');
});

test('isParserUrl 识别解析器域名/参数', () => {
  const KC = loadCore();
  assert.equal(KC.isParserUrl('http://jx.foo.com/vip/?url=age_abc'), true);
  assert.equal(KC.isParserUrl('https://x.com/player.php?url=http://y/z.m3u8'), true);
  assert.equal(KC.isParserUrl('http://a.com/play/1-2.html'), false);
  assert.equal(KC.isParserUrl(''), false);
});

test('parseDelimitedChaptersLocal 分隔符章节', () => {
  const KC = loadCore();
  const doc = {
    roadNames: '线路1$线路2',
    roadEpisodes: '名称A$http://a/1.m3u8$$$名称B$http://a/2.m3u8'
  };
  const roads = KC.parseDelimitedChaptersLocal(doc, {
    roadNamesPath: '$.roadNames', roadEpisodesPath: '$.roadEpisodes'
  }, 'http://a/');
  assert.equal(roads.length, 2);
  assert.equal(roads[0].name, '线路1');
  assert.equal(roads[0].data[0], 'http://a/1.m3u8');
  assert.equal(roads[0].identifier[0], '名称A');
  assert.equal(roads[1].data[0], 'http://a/2.m3u8');
  // 空 episodes → []
  assert.equal(KC.parseDelimitedChaptersLocal({ roadEpisodes: '' }, { roadEpisodesPath: '$.roadEpisodes' }, 'http://a/').length, 0);
});

test('幂等守卫：重复加载安全跳过', () => {
  const KC1 = loadCore();
  // 重新加载同一上下文应返回同一对象（守卫 return）
  const code = fs.readFileSync(path.join(ROOT, 'public/video/kazumi-bridge-core.js'), 'utf8');
  const ctx = { window: null, global: null };
  ctx.window = ctx; ctx.global = ctx;
  ctx.StellaflixVideo = { kazumiCore: KC1 };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  assert.equal(ctx.StellaflixVideo.kazumiCore, KC1);
});
