// 纯 node 验证 model.js 追片互斥单值模型（不依赖 jsdom）
// 运行：node test/track-model.test.js
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = global;
require('../public/video/model.js');
const M = global.StellaflixVideo.model;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } }

ok('初始 getTrackCount=0', M.getTrackCount() === 0);
ok('初始 getTrackStatus=null', M.getTrackStatus('k1') === null);

M.setTrackStatus('k1', 'watching');
ok('set watching', M.getTrackStatus('k1') === 'watching');
ok('count=1', M.getTrackCount() === 1);
ok('getKeysByTrack(watching) 含 k1', M.getKeysByTrack('watching').indexOf('k1') >= 0);

M.setTrackStatus('k1', 'planToWatch');
ok('互斥：仅 planToWatch', M.getTrackStatus('k1') === 'planToWatch');
ok('互斥：watching 不含 k1', M.getKeysByTrack('watching').indexOf('k1') < 0);
ok('count 仍为 1', M.getTrackCount() === 1);

M.setTrackStatus('k1', 'none');
ok('清除后 status=null', M.getTrackStatus('k1') === null);
ok('清除后 count=0', M.getTrackCount() === 0);

M.setTrackStatus('k2', 'watched');
ok('set watched', M.getTrackStatus('k2') === 'watched');
M.clearTrack('k2');
ok('clearTrack 生效', M.getTrackStatus('k2') === null);

M.setTrackStatus('k3', 'watching');
M.setTrackStatus('k3', 'bogus');
ok('无效状态不覆盖', M.getTrackStatus('k3') === 'watching');

ok('FLAG_FIELDS 不含 faved', M.FLAG_FIELDS.indexOf('faved') < 0);
ok('getFlag 无 faved 字段', !('faved' in M.getFlag('k3')));

console.log(`\n追片模型自测：${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
