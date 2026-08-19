// 纯 node 验证 model.js 数据迁移 schema（不依赖 jsdom）
// 运行：node test/model-migration.test.js
let store;
function freshShim() {
  store = {};
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  global.window = global;
}
function reload() {
  delete require.cache[require.resolve('../public/video/model.js')];
  require('../public/video/model.js');
  return global.StellaflixVideo.model;
}

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } }

// 场景 A：全新安装（无旧数据）—— 加载即写入版本标记，migrate 幂等
freshShim();
let M = reload();
ok('A: 加载即写入版本标记=1', global.localStorage.getItem('stellaflix-video-schema-version') === '1');
ok('A: SCHEMA_VERSION 导出=1', M.SCHEMA_VERSION === 1);
ok('A: migrate 是函数', typeof M.migrate === 'function');
ok('A: 初始 history 为空', M.getHistory().length === 0);
M.migrate(); // 幂等二次执行
ok('A: 二次 migrate 不破坏标记', global.localStorage.getItem('stellaflix-video-schema-version') === '1');

// 场景 B：升级用户残留旧 mineradio-video-* 命名空间数据 → 防御性并入
freshShim();
store['mineradio-video-history'] = JSON.stringify([{ key: 'k1', title: '旧片' }]);
store['mineradio-video-flag'] = JSON.stringify({ k1: { liked: true } });
M = reload();
ok('B: 旧 history 已并入新命名空间', M.getHistory().length === 1 && M.getHistory()[0].title === '旧片');
ok('B: 旧 flag 已并入新命名空间', M.getFlag('k1').liked === true);
ok('B: 新命名空间键已写入', global.localStorage.getItem('stellaflix-video-history') !== null);
ok('B: 版本标记=1', global.localStorage.getItem('stellaflix-video-schema-version') === '1');

// 场景 B2：新键已有数据时不被旧键覆盖（防御性）
freshShim();
store['stellaflix-video-history'] = JSON.stringify([{ key: 'new', title: '新片' }]);
store['mineradio-video-history'] = JSON.stringify([{ key: 'old', title: '旧片' }]);
M = reload();
ok('B2: 新键存在时不覆盖旧数据', M.getHistory().length === 1 && M.getHistory()[0].title === '新片');

console.log(`\n数据迁移 schema 自测：${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
