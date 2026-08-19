/**
 * Phase 2 桥接层集成测试
 *
 * 验证 kazumi-bridge.js 与 Kazumi 引擎的真实编排链路：
 *   importRule → manager.load → search（经 engine → mocked http → mocked xpath）→ 归一化为 Stellaflix item
 *   getChapters（经 engine → mocked xpath）→ 归一化为 CMS plays 形状
 *   setEnabled / isEnabled / hasRules / removeRule
 *
 * 不 mock 桥接层本身，只 mock 最底层的 http(网络) 与 xpath(解析)，
 * 因为那两层已在 Phase 1 单测覆盖；本测试验证的是「接线」是否正确。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const VIDEO = path.resolve(__dirname, '..', 'public', 'video');

function makeLS() {
  const map = {};
  return {
    getItem: k => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: k => { delete map[k]; }
  };
}

const g = {};
g.console = console;
g.localStorage = makeLS();
g.URL = URL;
g.setTimeout = setTimeout;
g.clearTimeout = clearTimeout;
g.Promise = Promise;
g.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9, ORDERED_NODE_SNAPSHOT_TYPE: 5 };
g.DOMParser = function () {}; // 不被调用（xpath 已 mock）
g.fetch = function () { return Promise.reject(new Error('fetch not mocked')); };
g.document = { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }) };
g.globalThis = g; g.window = g; g.self = g;
g.module = undefined;

// 捕获所有创建的节点，便于测试 inspected（本测试未用，但保持通用）
const ctx = vm.createContext(g);

const files = [
  'kazumi/rule-schema.js',
  'kazumi/url-utils.js',
  'kazumi/http-client.js',
  'kazumi/xpath-engine.js',
  'kazumi/rule-engine.js',
  'kazumi/index.js',
  'kazumi-bridge-core.js',
  'sources-core.js',
  'kazumi-bridge.js'
];
for (const f of files) {
  const code = fs.readFileSync(path.join(VIDEO, f), 'utf8');
  vm.runInContext(code, ctx, { filename: f });
}

// ---- mock 最底层：HTTP 与 XPath 解析（引擎其余逻辑真实运行）----
g.KazumiHttpClient.get = function () { return Promise.resolve('<html>mocked</html>'); };
g.KazumiHttpClient.post = function () { return Promise.resolve('<html>mocked</html>'); };
g.KazumiXPathEngine.parseSearch = function () {
  return {
    items: [
      { name: 'Test Movie', src: '/detail/123' },
      { name: 'Another Film', src: '/detail/999' }
    ],
    diagnostics: []
  };
};
g.KazumiXPathEngine.parseChapters = function () {
  return {
    roads: [{
      name: '播放线路1',
      data: ['https://cdn.example.com/x.m3u8', 'https://cdn.example.com/y.m3u8'],
      identifier: ['第1集', '第2集']
    }],
    diagnostics: []
  };
};

let pass = 0, fail = 0; const fails = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; fails.push(msg); console.log('  ✗ ' + msg); } }

const SFV = g.StellaflixVideo;
const KZ = SFV.kazumi;

(async function () {
  console.log('=== Phase 2 Bridge Integration Test ===\n');

  const rule = {
    name: 'TestRule', type: 'movie', baseURL: 'https://example.com',
    searchURL: '/search?wd=@keyword',
    searchList: '//div', searchName: '//a/text()', searchResult: '//a',
    chapterRoads: '//div', chapterResult: '//a'
  };

  // 1) 导入
  const added = KZ.importRule(rule);
  ok(Array.isArray(added) && added[0] === 'TestRule', 'importRule 返回导入的规则名 [TestRule]');

  // 2) 列表 / 启用 / 有效
  let list = KZ.listRules();
  ok(list.length === 1, 'listRules 返回 1 条');
  ok(list[0].enabled === true, '新导入规则默认启用');
  ok(list[0].valid === true, '规则通过 validate（字段完整）');
  ok(list[0].searchMode === 'xpath', 'searchMode 为 xpath');

  // 3) hasRules
  ok(KZ.hasRules() === true, 'hasRules() === true');

  // 4) 搜索归一化（Kazumi {name,src} → Stellaflix item）
  const sres = await KZ.search('hero');
  ok(sres.items.length === 2, 'search 返回 2 条归一化结果');
  const it0 = sres.items[0];
  ok(it0.isKazumi === true, 'item.isKazumi === true');
  ok(typeof it0.key === 'string' && it0.key.indexOf('kazumi:TestRule:') === 0, 'item.key 以 kazumi:TestRule: 开头');
  ok(it0.title === 'Test Movie', 'item.title === Test Movie');
  ok(it0.variants && it0.variants.length === 1, 'item 含 1 个 variant');
  ok(it0.variants[0].ruleName === 'TestRule' && it0.variants[0].src === '/detail/123', 'variant 携带 ruleName + src');
  ok(it0.variants[0].isKazumi === true, 'variant.isKazumi === true');

  // 5) 禁用后搜索应被过滤
  KZ.setEnabled('TestRule', false);
  list = KZ.listRules();
  ok(list[0].enabled === false, 'setEnabled(false) 后 listRules 显示已禁用');
  const sres2 = await KZ.search('hero');
  ok(sres2.items.length === 0, '禁用规则后 search 返回 0 条（启用过滤生效）');
  KZ.setEnabled('TestRule', true); // 恢复

  // 6) getChapters 归一化为 CMS plays 形状
  const cres = await KZ.getChapters('TestRule', '/detail/123');
  ok(Array.isArray(cres.plays) && cres.plays.length === 1, 'getChapters 返回 1 条 play 线路');
  const play = cres.plays[0];
  ok(play.from === '播放线路1', 'play.from === 播放线路1');
  ok(play.episodes.length === 2, 'play 含 2 个 episode');
  ok(play.episodes[0].name === '第1集' && play.episodes[0].index === 0, 'episode[0] name=第1集 index=0');
  ok(play.episodes[0].url === 'https://cdn.example.com/x.m3u8', 'episode[0].url 为归一化后的绝对 m3u8');

  // 7) 移除
  KZ.removeRule('TestRule');
  ok(KZ.listRules().length === 0, 'removeRule 后列表为空');
  ok(KZ.hasRules() === false, 'removeRule 后 hasRules() === false');

  // 8) 无效规则：导入后仍存（信任来源），但 validate 不过、不参与搜索
  const bad = { name: 'Bad', baseURL: '' }; // 缺 searchURL 等
  KZ.importRule(bad);
  list = KZ.listRules();
  ok(list.length === 1 && list[0].valid === false, '无效规则仍被存入（validate.valid=false）');
  const sres3 = await KZ.search('x');
  ok(sres3.items.length === 0, '无效规则不参与搜索');
  KZ.removeRule('Bad');

  console.log('\n--------------------------------');
  console.log('Phase 2 Bridge: ' + pass + ' pass / ' + fail + ' fail');
  if (fail) {
    console.log('FAILURES:\n - ' + fails.join('\n - '));
    process.exit(1);
  } else {
    console.log('✅ All bridge integration tests passed!');
    process.exit(0);
  }
})().catch(function (e) {
  console.error('FATAL:', e && e.stack ? e.stack : e);
  process.exit(1);
});
