/*
 * 弹幕 API 客户端 (DanDanPlay) vm 沙箱测试
 * 加载真实源码 public/video/danmaku/{entry,episode,index,client}.js
 * 注入 Node crypto 计算预期签名 + mock fetch 捕获请求
 * 用 async/await 顺序隔离每个用例（避免共享 responder 串味）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'video', 'danmaku');
const FILES = ['entry.js', 'episode.js', 'index.js', 'client.js'];

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

let FIXED_NOW = 1735660800 * 1000; // 2025-01-01 UTC
const RealDate = Date;
function SandboxDate(...args) { return new RealDate(...args); }
SandboxDate.now = function () { return FIXED_NOW; };
SandboxDate.prototype = RealDate.prototype;

function expectedSig(appId, ts, p, secret) {
  return crypto.createHash('sha256').update(appId + ts + p + secret).digest('base64');
}

const sandbox = {};
sandbox.window = sandbox;
sandbox.Date = SandboxDate;
sandbox.URLSearchParams = URLSearchParams;
sandbox.TextEncoder = TextEncoder;
sandbox.Buffer = Buffer;
sandbox.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
sandbox.Promise = Promise;
sandbox.Math = Math; sandbox.Object = Object; sandbox.String = String;
sandbox.Number = Number; sandbox.Array = Array; sandbox.console = console;

let lastFetch = null;
let fetchResponder = null;
sandbox.fetch = function (url, opts) {
  lastFetch = { url: url, headers: (opts && opts.headers) || {} };
  const r = fetchResponder ? fetchResponder() : { ok: true, status: 200, json: { success: true, comments: [] } };
  return Promise.resolve({ ok: r.ok, status: r.status, json: function () { return Promise.resolve(r.json); } });
};

vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
}

const SFV = sandbox.StellaflixVideo;
const client = SFV.danmaku.client;
check('client 已挂载到 SFV.danmaku.client', !!client);
check('DanmakuEntry 可用', !!SFV.danmaku.DanmakuEntry);
client.setSha256Base64(function (s) { return crypto.createHash('sha256').update(s).digest('base64'); });

const APP_ID = 'test_app', APP_SECRET = 'test_secret';
const TS = '1735660800', PATH = '/api/v2/comment/123450001';

(async function run() {
  // 1. 无凭证 → 拒绝
  client.setCredentials('', '');
  try { await client.makeAuthHeaders(PATH); check('无凭证应拒绝', false, 'resolve 而非 reject'); }
  catch (e) { check('无凭证抛出 DANMAKU_AUTH_REQUIRED', e && e.message === 'DANMAKU_AUTH_REQUIRED', e && e.message); }

  // 2. 有凭证 → 正确签名头
  client.setCredentials(APP_ID, APP_SECRET);
  const h = await client.makeAuthHeaders(PATH);
  check('X-AppId 正确', h['X-AppId'] === APP_ID);
  check('X-Timestamp 正确', h['X-Timestamp'] === TS, h['X-Timestamp']);
  const exp = expectedSig(APP_ID, TS, PATH, APP_SECRET);
  check('X-Signature 符合 base64(sha256(AppId+Ts+Path+Secret))', h['X-Signature'] === exp, h['X-Signature'] + ' vs ' + exp);
  check('X-Auth 头为 "1" (对齐 Kazumi danmaku_client.dart)', h['X-Auth'] === '1', JSON.stringify(h['X-Auth']));

  // 3. searchEpisodes → 正确代理 URL + 认证头
  fetchResponder = function () { return { ok: true, status: 200, json: { success: true, episodes: [{ episodeId: 123450001, episodeTitle: '第1话' }] } }; };
  const eps = await client.searchEpisodes('进击的巨人', 1);
  check('searchEpisodes 返回剧集', eps.length === 1 && eps[0].episodeId === 123450001, JSON.stringify(eps));
  check('请求走 /api/proxy', lastFetch.url.indexOf('/api/proxy?url=') === 0, lastFetch.url.slice(0, 30));
  check('代理目标含 search/episodes', decodeURIComponent(lastFetch.url).indexOf('/api/v2/search/episodes') > -1);
  check('代理目标含 anime 参数', decodeURIComponent(lastFetch.url).indexOf('anime=') > -1);
  check('请求带 X-AppId 头', !!lastFetch.headers['X-AppId'], JSON.stringify(lastFetch.headers));
  check('请求带 X-Signature 头', !!lastFetch.headers['X-Signature']);
  check('请求带 X-Auth 头 (对齐 Kazumi)', lastFetch.headers['X-Auth'] === '1', JSON.stringify(lastFetch.headers));

  // 4. getComments → 弹幕映射正确
  fetchResponder = function () { return { ok: true, status: 200, json: { success: true, comments: [
    { cid: '1', p: '12.5,1,16777215,[BiliBili]u1', m: '滚动弹幕' },
    { cid: '2', p: '30,5,16711680,[Gamer]u2', m: '顶部弹幕' },
    { cid: '3', p: '45.2,4,16776960', m: '底部弹幕无来源' }
  ] } }; };
  const list = await client.getComments(123450001);
  check('getComments 解析 3 条', list.length === 3, 'len=' + list.length);
  const scroll = list[0];
  check('滚动弹幕 message', scroll.message === '滚动弹幕');
  check('滚动弹幕 time', Math.abs(scroll.time - 12.5) < 1e-6);
  check('滚动弹幕 type=1', scroll.type === 1);
  check('滚动弹幕 color 白', scroll.color.r === 255 && scroll.color.g === 255 && scroll.color.b === 255);
  check('滚动弹幕 source', scroll.source === '[BiliBili]u1');
  const top = list[1];
  check('顶部弹幕 type=5', top.type === 5);
  check('顶部弹幕 color 红', top.color.r === 255 && top.color.g === 0 && top.color.b === 0);
  const bottom = list[2];
  check('底部弹幕 type=4', bottom.type === 4);
  check('底部弹幕 source 为空', bottom.source === '');

  // 5. 401 → DANMAKU_AUTH_FAILED
  fetchResponder = function () { return { ok: false, status: 401, json: { success: false, errorCode: 401, errorMessage: '签名错误' } }; };
  try { await client.getComments(999); check('401 应拒绝', false, 'resolve 而非 reject'); }
  catch (e) { check('401 抛出 DANMAKU_AUTH_FAILED', e && e.message.indexOf('DANMAKU_AUTH_FAILED') === 0, e && e.message); }

  // 6. success=false → DANMAKU_API_ERROR
  fetchResponder = function () { return { ok: true, status: 200, json: { success: false, errorCode: 1001, errorMessage: '参数错误' } }; };
  try { await client.getComments(999); check('API 错误应拒绝', false, 'resolve 而非 reject'); }
  catch (e) { check('success=false 抛出 DANMAKU_API_ERROR', e && e.message.indexOf('DANMAKU_API_ERROR') === 0, e && e.message); }

  // 7. fetchForEpisode 一站式
  fetchResponder = function () { return { ok: true, status: 200, json: { success: true, episodes: [{ episodeId: 555, episodeTitle: '全集' }] } }; };
  let progressMsg = null;
  const fl = await client.fetchForEpisode('测试番', 1, function (m) { progressMsg = m; });
  check('fetchForEpisode 先搜到剧集', progressMsg !== null, String(progressMsg));
  check('fetchForEpisode 返回弹幕数组', Array.isArray(fl));

  console.log('\n弹幕客户端测试：' + pass + ' pass / ' + fail + ' fail');
  if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('=== ALL PASS ===');
  process.exit(0);
})();
