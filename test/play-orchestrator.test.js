/*
 * 播放编排器（P4）单元测试
 * 验证 play-orchestrator.js 作为单集播放唯一真相源：
 *  - CMS 直链：调 SFV.source.open，记录 meta/history，关闭浏览层。
 *  - Kazumi 解析为直链(embed:false)：走 doPlay → source.open。
 *  - Kazumi 解析为内嵌(embed:true)：走 openEmbed → player.openEmbed。
 *  - Kazumi 解析失败/拒绝：回退原始地址直连。
 *  - 缺 ep.url：仅 toast，不触发播放。
 * 运行：node test/play-orchestrator.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'video', 'play-orchestrator.js'), 'utf8'
);
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const SFV = sandbox.window.StellaflixVideo;

let pass = 0, fail = 0;
function expect(name, cond) {
  if (cond) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name); }
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

// ---- 依赖桩（online.js 注入的闭包）----
const calls = { toast: [], recordMeta: [], recordHistory: [], close: [] };
function spy(name) { return function () { calls[name].push(Array.prototype.slice.call(arguments)); }; }
SFV.playOrchestrator.init({
  toast: spy('toast'),
  recordMeta: spy('recordMeta'),
  recordHistory: spy('recordHistory'),
  resolvePic: function () { return 'http://pic/x.jpg'; },
  close: spy('close')
});

// ---- 播放器/源桩 ----
let sourceOpen = null, playerOpenUrl = null, playerOpenEmbed = null, playerSetMeta = null;
SFV.source = { open: function (m) { sourceOpen = m; } };
SFV.player = {
  openUrl: function (u, m) { playerOpenUrl = { u: u, m: m }; },
  openEmbed: function (u, o) { playerOpenEmbed = { u: u, o: o }; },
  setMeta: function (o) { playerSetMeta = o; },
  setPlaylist: function () {},
  setPlayEpisodeAt: function () {},
  setPlayNext: function () {}
};

function reset() {
  calls.toast.length = 0; calls.recordMeta.length = 0; calls.recordHistory.length = 0; calls.close.length = 0;
  sourceOpen = null; playerOpenUrl = null; playerOpenEmbed = null; playerSetMeta = null;
}

const cmsView = { key: 'k1', title: '电影A', year: '2024', pic: 'http://pic/a.jpg', source: { id: 'cms1', name: '源1' }, vodId: 'v1' };
const cmsEp = { url: 'http://m3u8/a.m3u8', index: 0, name: '第1集' };
const kzView = { key: 'k2', title: '番B', year: '', pic: '', source: { id: 'kazumi:r1', name: 'r1' }, vodId: 'k1', isKazumi: true, ruleName: 'r1' };
const kzEp = { url: 'http://page/b', index: 0, name: '第1集' };

let kazResolve = Promise.resolve({ url: 'http://m3u8/k.m3u8', embed: false });

(async function () {
  console.log('CMS 直链:');
  reset();
  SFV.playOrchestrator.play(cmsView, cmsEp, null);
  await tick();
  expect('调 source.open', !!sourceOpen && sourceOpen.url === 'http://m3u8/a.m3u8');
  expect('meta.id = cms1:v1:0', !!sourceOpen && sourceOpen.id === 'cms1:v1:0');
  expect('recordMeta 被调', calls.recordMeta.length === 1);
  expect('recordHistory 被调', calls.recordHistory.length === 1);
  expect('close 被调', calls.close.length === 1);
  expect('未走 openEmbed', playerOpenEmbed === null);

  console.log('Kazumi 解析→直链(embed:false):');
  reset();
  kazResolve = Promise.resolve({ url: 'http://m3u8/k.m3u8', embed: false });
  SFV.kazumi = { resolvePlayUrl: function () { return kazResolve; } };
  SFV.playOrchestrator.play(kzView, kzEp, null);
  await tick();
  expect('source.open 收到解析后直链', !!sourceOpen && sourceOpen.url === 'http://m3u8/k.m3u8');
  expect('未走 openEmbed', playerOpenEmbed === null);

  console.log('Kazumi 解析→内嵌(embed:true):');
  reset();
  kazResolve = Promise.resolve({ url: 'http://parser/b', embed: true });
  SFV.kazumi = { resolvePlayUrl: function () { return kazResolve; } };
  SFV.playOrchestrator.play(kzView, kzEp, null);
  await tick();
  expect('openEmbed 被调且拿到解析器页', !!playerOpenEmbed && playerOpenEmbed.u === 'http://parser/b');
  expect('未走 source.open', sourceOpen === null);

  console.log('Kazumi 解析失败→回退原始地址:');
  reset();
  kazResolve = Promise.reject(new Error('boom'));
  SFV.kazumi = { resolvePlayUrl: function () { return kazResolve; } };
  SFV.playOrchestrator.play(kzView, kzEp, null);
  await tick();
  expect('回退 source.open 原始地址', !!sourceOpen && sourceOpen.url === 'http://page/b');

  console.log('缺 ep.url:');
  reset();
  SFV.playOrchestrator.play(cmsView, {}, null);
  await tick();
  expect('仅 toast', calls.toast.length === 1 && sourceOpen === null && playerOpenEmbed === null);

  console.log('\nTotal: pass=' + pass + ', fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
