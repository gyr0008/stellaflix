'use strict';
/*
 * 用户数据迁移（④）—— 从旧产品名 userData 目录迁入当前产品名目录。
 *
 * 背景：Electron 的 userData 路径 = <appData>/<app.getName()>。产品由 Mineradio 更名为
 * Stellaflix 后，app.setName('Stellaflix') 使 userData 指向新目录，旧安装的播放进度、
 * 设置、localStorage（含 mineradio-* 键）留在旧目录里不会自动带过来。
 *
 * 本模块在主进程启动早期（setName 之后、任何 getPath('userData') 落盘之前）执行一次性拷贝。
 *
 * 安全约束（全部为硬性）：
 *   1) 幂等：目标目录写入 marker 后永不重复迁移；
 *   2) 不覆盖：目标目录已有实质数据时直接跳过，绝不覆写用户现有数据；
 *   3) 只拷不删：旧目录原样保留，用户可回退到旧版本；
 *   4) 失败不致命：任何异常都被吞掉并记录，不阻塞应用启动；
 *   5) 跳过可再生的缓存目录，避免拷贝几百 MB 垃圾。
 *
 * 本模块不 require('electron')，纯 fs/path，便于单元测试。
 */
const fs = require('fs');
const path = require('path');

const MARKER = '.stellaflix-userdata-migration.json';
const SCHEMA_VERSION = 1;

// 可再生 / 不应迁移的目录（Chromium 缓存、崩溃转储、下载的更新包等）
const SKIP_ENTRIES = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'ShaderCache', 'GrShaderCache', 'blob_storage', 'Crashpad', 'Crash Reports',
  'component_crx_cache', 'Dictionaries', 'logs', 'updates', 'Partitions',
  'SingletonCookie', 'SingletonLock', 'SingletonSocket', 'lockfile', 'LOCK',
]);

// 判断目标目录是否已有「实质数据」：忽略 marker 与可跳过项后仍有内容即视为有数据
function hasRealData(dir) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (e) { return false; }
  for (const name of entries) {
    if (name === MARKER) continue;
    if (SKIP_ENTRIES.has(name)) continue;
    return true;
  }
  return false;
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

/**
 * 递归拷贝目录。返回 { files, errors }。
 * 遇到单个文件错误时继续拷贝其余文件（尽力而为），不抛出。
 */
function copyDirSync(src, dest, opts) {
  opts = opts || {};
  const skipTop = opts.skipTop || SKIP_ENTRIES;
  const isTop = !!opts.isTop;
  const stat = { files: 0, errors: [] };

  let entries;
  try { entries = fs.readdirSync(src, { withFileTypes: true }); }
  catch (e) { stat.errors.push(src + ': ' + e.message); return stat; }

  try { fs.mkdirSync(dest, { recursive: true }); }
  catch (e) { stat.errors.push(dest + ': ' + e.message); return stat; }

  for (const ent of entries) {
    if (isTop && skipTop.has(ent.name)) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    try {
      if (ent.isDirectory()) {
        const sub = copyDirSync(s, d, { skipTop: skipTop, isTop: false });
        stat.files += sub.files;
        for (const e of sub.errors) stat.errors.push(e);
      } else if (ent.isFile()) {
        fs.copyFileSync(s, d);
        stat.files++;
      }
      // 符号链接/设备文件等一律忽略，避免跨盘或权限问题
    } catch (e) {
      stat.errors.push(s + ': ' + e.message);
    }
  }
  return stat;
}

/**
 * 执行迁移。
 * @param {object} o
 * @param {string} o.userDataPath 当前（新）userData 目录
 * @param {string} o.appDataRoot  appData 根目录（旧目录 = appDataRoot/<legacyName>）
 * @param {string[]} o.legacyNames 候选旧产品名，按顺序取第一个存在且有数据的
 * @param {function} [o.log]
 * @returns {{migrated:boolean, reason:string, from:(string|null), files:number, errors:string[]}}
 */
function migrateUserData(o) {
  o = o || {};
  const log = typeof o.log === 'function' ? o.log : function () {};
  const userDataPath = o.userDataPath;
  const appDataRoot = o.appDataRoot;
  const legacyNames = Array.isArray(o.legacyNames) ? o.legacyNames : [];
  const out = { migrated: false, reason: '', from: null, files: 0, errors: [] };

  if (!userDataPath || !appDataRoot) {
    out.reason = 'bad-args';
    return out;
  }

  // 1) 幂等：marker 存在即不再迁移
  const markerPath = path.join(userDataPath, MARKER);
  try {
    if (fs.existsSync(markerPath)) { out.reason = 'already-migrated'; return out; }
  } catch (e) { /* 读不到就当没有 */ }

  // 2) 目标已有实质数据 → 不覆盖
  if (isDir(userDataPath) && hasRealData(userDataPath)) {
    out.reason = 'target-has-data';
    // 写 marker，避免以后用户清空目录时被"意外"迁移
    writeMarker(markerPath, { migrated: false, reason: out.reason }, log);
    return out;
  }

  // 3) 找旧目录
  let legacyDir = null;
  for (const name of legacyNames) {
    if (!name) continue;
    const p = path.join(appDataRoot, name);
    if (p === userDataPath) continue;         // 同名不迁
    if (isDir(p) && hasRealData(p)) { legacyDir = p; break; }
  }
  if (!legacyDir) { out.reason = 'no-legacy-data'; return out; }

  // 4) 拷贝
  log('[userdata-migrate] 从旧目录迁移用户数据: ' + legacyDir + ' -> ' + userDataPath);
  const st = copyDirSync(legacyDir, userDataPath, { isTop: true });
  out.migrated = st.files > 0;
  out.from = legacyDir;
  out.files = st.files;
  out.errors = st.errors;
  out.reason = out.migrated ? 'ok' : 'nothing-copied';
  log('[userdata-migrate] 完成：' + st.files + ' 个文件，' + st.errors.length + ' 个错误');

  // 5) 写 marker（无论成败都写：失败时目标目录已有部分数据，重试只会更乱）
  writeMarker(markerPath, {
    migrated: out.migrated, reason: out.reason, from: legacyDir,
    files: out.files, errors: out.errors.slice(0, 20),
  }, log);
  return out;
}

function writeMarker(markerPath, payload, log) {
  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify(Object.assign({
      schema: SCHEMA_VERSION, at: new Date().toISOString(),
    }, payload), null, 2), 'utf8');
  } catch (e) {
    log('[userdata-migrate] marker 写入失败（不致命）: ' + e.message);
  }
}

module.exports = {
  migrateUserData,
  copyDirSync,
  hasRealData,
  MARKER,
  SCHEMA_VERSION,
  SKIP_ENTRIES,
};
