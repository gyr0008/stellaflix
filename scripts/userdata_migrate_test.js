/*
 * ④ 用户数据迁移测试（真实文件系统，临时目录）
 * 覆盖：
 *   A. 正常迁移：旧目录 → 新目录，含嵌套子目录与二进制文件，内容逐字节一致
 *   B. 缓存目录被跳过（Cache / GPUCache / updates / Crashpad ...）
 *   C. 幂等：marker 存在时不再迁移；二次调用不改动文件
 *   D. 不覆盖：目标已有实质数据 → 跳过并写 marker
 *   E. 旧目录不存在 / 旧目录为空 / 旧目录仅含缓存 → no-legacy-data
 *   F. 参数缺失 / legacyNames 为空 / 旧目录与新目录同路径 → 安全跳过
 *   G. 只拷不删：旧目录完好无损
 *   H. 多候选旧名按顺序命中第一个有数据的
 *   I. marker 内容含 schema 版本与来源
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const M = require('../desktop/userdata-migrate');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n[' + t + ']'); }

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sfv-migrate-'));
let caseNo = 0;
function newCase() {
  const root = path.join(TMP_ROOT, 'case' + (++caseNo));
  const appData = path.join(root, 'AppData');
  fs.mkdirSync(appData, { recursive: true });
  return { root, appData, newDir: path.join(appData, 'Stellaflix'), oldDir: path.join(appData, 'Mineradio') };
}
function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function listAll(dir, base) {
  base = base || dir;
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listAll(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

// ================================================================ A + B + G + I
section('A/B/G/I 正常迁移 · 跳过缓存 · 只拷不删 · marker 内容');
{
  const c = newCase();
  write(path.join(c.oldDir, 'config.json'), '{"volume":0.8}');
  write(path.join(c.oldDir, 'Local Storage', 'leveldb', '000003.log'), Buffer.from([0x01, 0x02, 0xff, 0x00, 0x7f]));
  write(path.join(c.oldDir, 'Local Storage', 'leveldb', 'CURRENT'), 'MANIFEST-000001\n');
  write(path.join(c.oldDir, 'nested', 'deep', 'a.txt'), '深层文件');
  // 应被跳过的缓存
  write(path.join(c.oldDir, 'Cache', 'data_0'), 'x'.repeat(1000));
  write(path.join(c.oldDir, 'GPUCache', 'index'), 'y');
  write(path.join(c.oldDir, 'updates', 'Setup.exe'), 'z'.repeat(500));
  write(path.join(c.oldDir, 'Crashpad', 'settings.dat'), 'c');

  const r = M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData, legacyNames: ['Mineradio'] });
  assert(r.migrated === true, '迁移返回 migrated=true');
  assert(r.reason === 'ok', 'reason=ok 实得=' + r.reason);
  assert(r.from === c.oldDir, 'from 指向旧目录');
  assert(r.errors.length === 0, '无错误 实得=' + JSON.stringify(r.errors));

  const files = listAll(c.newDir).filter(f => f !== M.MARKER);
  assert(files.indexOf('config.json') >= 0, 'config.json 已迁移');
  assert(files.indexOf('Local Storage/leveldb/000003.log') >= 0, 'localStorage leveldb 已迁移（含 mineradio-* 键的载体）');
  assert(files.indexOf('nested/deep/a.txt') >= 0, '多层嵌套目录已迁移');
  assert(r.files === 4, '仅迁移 4 个非缓存文件 实得=' + r.files);

  assert(files.every(f => f.indexOf('Cache/') !== 0), 'Cache/ 被跳过');
  assert(files.every(f => f.indexOf('GPUCache/') !== 0), 'GPUCache/ 被跳过');
  assert(files.every(f => f.indexOf('updates/') !== 0), 'updates/ 被跳过（不搬安装包）');
  assert(files.every(f => f.indexOf('Crashpad/') !== 0), 'Crashpad/ 被跳过');

  // 二进制逐字节一致
  const src = fs.readFileSync(path.join(c.oldDir, 'Local Storage', 'leveldb', '000003.log'));
  const dst = fs.readFileSync(path.join(c.newDir, 'Local Storage', 'leveldb', '000003.log'));
  assert(Buffer.compare(src, dst) === 0, '二进制文件逐字节一致');
  assert(fs.readFileSync(path.join(c.newDir, 'nested', 'deep', 'a.txt'), 'utf8') === '深层文件', 'UTF-8 内容一致');

  // 只拷不删
  assert(fs.existsSync(path.join(c.oldDir, 'config.json')), '旧目录文件未被删除');
  assert(listAll(c.oldDir).length === 8, '旧目录内容完好（8 个文件）实得=' + listAll(c.oldDir).length);

  // marker
  const mk = JSON.parse(fs.readFileSync(path.join(c.newDir, M.MARKER), 'utf8'));
  assert(mk.schema === M.SCHEMA_VERSION, 'marker 含 schema 版本 ' + M.SCHEMA_VERSION);
  assert(mk.migrated === true && mk.from === c.oldDir, 'marker 记录迁移结果与来源');
  assert(typeof mk.at === 'string' && mk.at.length > 0, 'marker 含时间戳');

  // ---- C 幂等 ----
  const before = listAll(c.newDir).join('|');
  write(path.join(c.oldDir, 'newfile-after.txt'), 'should-not-copy');
  const r2 = M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData, legacyNames: ['Mineradio'] });
  assert(r2.migrated === false && r2.reason === 'already-migrated', '二次调用返回 already-migrated');
  assert(listAll(c.newDir).join('|') === before, '二次调用未改动目标目录内容');
}

// ================================================================ D 不覆盖
section('D 目标已有数据 → 不覆盖');
{
  const c = newCase();
  write(path.join(c.oldDir, 'config.json'), 'OLD');
  write(path.join(c.newDir, 'config.json'), 'NEW-USER-DATA');

  const r = M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData, legacyNames: ['Mineradio'] });
  assert(r.migrated === false && r.reason === 'target-has-data', 'reason=target-has-data 实得=' + r.reason);
  assert(fs.readFileSync(path.join(c.newDir, 'config.json'), 'utf8') === 'NEW-USER-DATA', '现有数据未被旧数据覆盖');
  assert(fs.existsSync(path.join(c.newDir, M.MARKER)), '仍写入 marker 防止后续误迁');

  // 目标只有缓存目录时不算"有数据"
  const c2 = newCase();
  write(path.join(c2.oldDir, 'config.json'), 'OLD');
  write(path.join(c2.newDir, 'Cache', 'data_0'), 'cache');
  const r2 = M.migrateUserData({ userDataPath: c2.newDir, appDataRoot: c2.appData, legacyNames: ['Mineradio'] });
  assert(r2.migrated === true, '目标仅含缓存目录时仍执行迁移');
  assert(fs.readFileSync(path.join(c2.newDir, 'config.json'), 'utf8') === 'OLD', '迁移后新目录含旧配置');
}

// ================================================================ E 无旧数据
section('E 旧目录缺失 / 空 / 仅缓存');
{
  const c = newCase();
  const r = M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData, legacyNames: ['Mineradio'] });
  assert(r.migrated === false && r.reason === 'no-legacy-data', '旧目录不存在 → no-legacy-data');
  assert(!fs.existsSync(path.join(c.newDir, M.MARKER)), '无旧数据时不写 marker（保留将来迁移的可能）');

  const c2 = newCase();
  fs.mkdirSync(c2.oldDir, { recursive: true });
  const r2 = M.migrateUserData({ userDataPath: c2.newDir, appDataRoot: c2.appData, legacyNames: ['Mineradio'] });
  assert(r2.reason === 'no-legacy-data', '旧目录为空 → no-legacy-data');

  const c3 = newCase();
  write(path.join(c3.oldDir, 'Cache', 'data_0'), 'only-cache');
  write(path.join(c3.oldDir, 'GPUCache', 'index'), 'only-cache');
  const r3 = M.migrateUserData({ userDataPath: c3.newDir, appDataRoot: c3.appData, legacyNames: ['Mineradio'] });
  assert(r3.reason === 'no-legacy-data', '旧目录仅含缓存 → no-legacy-data');
}

// ================================================================ F 异常参数
section('F 异常输入');
{
  const c = newCase();
  assert(M.migrateUserData().reason === 'bad-args', '无参数 → bad-args');
  assert(M.migrateUserData({}).reason === 'bad-args', '空对象 → bad-args');
  assert(M.migrateUserData({ userDataPath: c.newDir }).reason === 'bad-args', '缺 appDataRoot → bad-args');
  assert(M.migrateUserData({ appDataRoot: c.appData }).reason === 'bad-args', '缺 userDataPath → bad-args');

  write(path.join(c.oldDir, 'a.txt'), 'x');
  assert(M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData, legacyNames: [] }).reason === 'no-legacy-data',
    'legacyNames 为空数组 → no-legacy-data');
  assert(M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData }).reason === 'no-legacy-data',
    'legacyNames 未传 → no-legacy-data');
  assert(M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData, legacyNames: [null, '', undefined] }).reason === 'no-legacy-data',
    'legacyNames 含空值 → 安全跳过');

  // 旧名与新目录同名 → 不自我迁移
  const c2 = newCase();
  write(path.join(c2.newDir, 'a.txt'), 'x');
  const rSelf = M.migrateUserData({ userDataPath: c2.newDir, appDataRoot: c2.appData, legacyNames: ['Stellaflix'] });
  assert(rSelf.migrated === false, '旧名==新名时不自我迁移');

  let threw = false;
  try { M.migrateUserData({ userDataPath: c.newDir, appDataRoot: '/绝对不存在的路径/xyz', legacyNames: ['Mineradio'] }); }
  catch (e) { threw = true; }
  assert(!threw, 'appDataRoot 不存在时不抛异常');
}

// ================================================================ H 多候选
section('H 多候选旧产品名');
{
  const c = newCase();
  const lower = path.join(c.appData, 'mineradio');
  write(path.join(lower, 'from-lower.txt'), 'L');
  const r = M.migrateUserData({ userDataPath: c.newDir, appDataRoot: c.appData, legacyNames: ['Mineradio', 'mineradio'] });
  assert(r.migrated === true, '首选名不存在时回退到次选名');
  assert(fs.existsSync(path.join(c.newDir, 'from-lower.txt')), '从次选目录迁移成功');

  const c2 = newCase();
  write(path.join(c2.appData, 'Mineradio', 'a.txt'), 'A');
  write(path.join(c2.appData, 'mineradio2', 'b.txt'), 'B');
  const r2 = M.migrateUserData({ userDataPath: c2.newDir, appDataRoot: c2.appData, legacyNames: ['Mineradio', 'mineradio2'] });
  assert(fs.existsSync(path.join(c2.newDir, 'a.txt')) && !fs.existsSync(path.join(c2.newDir, 'b.txt')),
    '按顺序只迁移第一个命中的旧目录');
}

// ================================================================ 清理
try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (e) {}

console.log('\n========================================');
console.log('  用户数据迁移测试: ' + pass + ' pass / ' + fail + ' fail');
console.log('========================================');
if (fail) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
