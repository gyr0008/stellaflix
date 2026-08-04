/*
 * 弹幕多数据源框架 (sources.js) vm 沙箱测试
 * 加载真实源码 public/video/danmaku/{entry,episode,index,client,sources,engine}.js
 * 注入 mock localStorage + 注册「测试用假源」验证：注册 / 启用停用 / 并行合并 / 跨源去重 / 单源失败不影响其它。
 *
 * 诚实边界：本测试中的假源仅为验证合并/去重逻辑，不代表任何真实 B站/Gamer 实现；
 *           真实源只有 DanDanPlay（client.js），测试中将其停用以免触及真实网络/凭证。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'video', 'danmaku');
const FILES = ['entry.js', 'episode.js', 'index.js', 'client.js', 'sources.js', 'engine.js'];

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

// ---- mock localStorage（sources.js 依赖）----
const _store = {};
const localStorageMock = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem(k, v) { _store[k] = String(v); },
  removeItem(k) { delete _store[k]; }
};

const sandbox = {};
sandbox.window = sandbox;
sandbox.localStorage = localStorageMock;
sandbox.URLSearchParams = URLSearchParams;
sandbox.TextEncoder = TextEncoder;
sandbox.Buffer = Buffer;
sandbox.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
sandbox.Promise = Promise;
sandbox.Math = Math; sandbox.Object = Object; sandbox.String = String;
sandbox.Number = Number; sandbox.Array = Array; sandbox.console = console;
sandbox.fetch = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ success: true, comments: [] }); } }); };

vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
}

const SFV = sandbox.StellaflixVideo;
const sources = SFV.danmaku.sources;
check('sources 框架已挂载', !!sources);
check('默认已注册 dandanplay 源', !!sources.getSource && !!sources.getSource('dandanplay'));
check('listSources 含 dandanplay', sources.listSources().some(s => s.id === 'dandanplay'));

// 停用 dandanplay（避免真实网络），注册两个假源做合并/去重验证
sources.setEnabled('dandanplay', false);
check('停用 dandanplay 生效', sources.isEnabled('dandanplay') === false);

function mkEntry(time, type, msg) { return { time: time, type: type, color: { r: 255, g: 255, b: 255 }, message: msg }; }

function fakeSource(id, label, entries) {
  return {
    id: id, label: label, requiresCredentials: false,
    fetchForEpisode: function () { return Promise.resolve({ entries: entries, origin: id }); }
  };
}

const srcA = fakeSource('fakesrc-a', '假源A', [
  mkEntry(1.0, 1, 'hello'),
  mkEntry(2.0, 1, 'dup')
]);
const srcB = fakeSource('fakesrc-b', '假源B', [
  mkEntry(2.0, 1, 'dup'),       // 与 A 重复，应去重
  mkEntry(3.0, 5, 'top')        // 顶部
]);
sources.registerSource(srcA);
sources.registerSource(srcB);
check('注册假源 A/B 成功', sources.getSource('fakesrc-a') && sources.getSource('fakesrc-b'));

(async () => {
  // 合并去重：A(2) + B(2) 去掉 1 个重复 = 3
  const merged = await sources.fetchAll({ animeTitle: 'x', episode: '1' });
  check('并行合并后共 3 条（跨源去重）', merged.length === 3, 'len=' + merged.length);
  check('按时间排序 1,2,3', merged[0].time === 1.0 && merged[1].time === 2.0 && merged[2].time === 3.0);
  check('来源标记存在', merged.every(e => !!e.origin), JSON.stringify(merged.map(e => e.origin)));
  check('_sourcesSucceeded = 2', merged._sourcesSucceeded === 2, 'v=' + merged._sourcesSucceeded);
  check('_sourceErrors 为空', Array.isArray(merged._sourceErrors) && merged._sourceErrors.length === 0);

  // 停用 B：仅 A 的 2 条
  sources.setEnabled('fakesrc-b', false);
  const onlyA = await sources.fetchAll({ animeTitle: 'x', episode: '1' });
  check('停用 B 后仅来自 A 的 2 条', onlyA.length === 2, 'len=' + onlyA.length);
  sources.setEnabled('fakesrc-b', true);

  // 单源失败不影响其它源：C 拒绝
  const srcC = fakeSource('fakesrc-c', '假源C', [mkEntry(4.0, 1, 'c-only')]);
  srcC.fetchForEpisode = function () { return Promise.reject(new Error('SRC_C_DOWN')); };
  sources.registerSource(srcC);
  const withFail = await sources.fetchAll({ animeTitle: 'x', episode: '1' });
  check('单源失败时仍合并成功（3 条）', withFail.length === 3, 'len=' + withFail.length);
  check('_sourceErrors 记录 1 个失败', Array.isArray(withFail._sourceErrors) && withFail._sourceErrors.length === 1);

  // 全部停用时 fetchAll 应拒绝
  sources.setEnabled('fakesrc-a', false);
  sources.setEnabled('fakesrc-b', false);
  sources.setEnabled('fakesrc-c', false);
  let rejected = false;
  try { await sources.fetchAll({ animeTitle: 'x', episode: '1' }); } catch (e) { rejected = (e && e.message === 'DANMAKU_NO_SOURCE_ENABLED'); }
  check('全部停用后 fetchAll 拒绝 DANMAKU_NO_SOURCE_ENABLED', rejected);

  // 恢复
  sources.setEnabled('fakesrc-a', true);
  sources.setEnabled('fakesrc-b', true);
  sources.setEnabled('fakesrc-c', false);
  sources.setEnabled('dandanplay', true);

  // 纯函数 mergeEntries 去重 + keepAll
  const pure = sources.mergeEntries([
    [mkEntry(1.0, 1, 'a'), mkEntry(2.0, 1, 'b')],
    [mkEntry(2.0, 1, 'b'), mkEntry(3.0, 1, 'c')]
  ]);
  check('mergeEntries 去重 3 条', pure.length === 3, 'len=' + pure.length);
  const pureAll = sources.mergeEntries([
    [mkEntry(1.0, 1, 'a')], [mkEntry(1.0, 1, 'a')]
  ], true);
  check('mergeEntries keepAll 保留重复 2 条', pureAll.length === 2, 'len=' + pureAll.length);

  console.log('\n多数据源测试通过 ' + pass + ' / ' + (pass + fail) + '，失败 ' + fail);
  if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
  else process.exit(0);
})();
