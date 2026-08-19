/**
 * 本地音乐库主进程层(移植自 1.5.7 分支 desktop/main.js 的本地曲库实现)。
 * 职责:
 *  - 授权根目录管理:仅放行已导入曲库根目录内的文件(IPC 与 HTTP 代理共用同一授权函数)
 *  - 文件夹递归扫描:扩展名白名单、访问上限、限流 stat、全量/增量两种模式
 *  - 授权范围读取:分块 base64 范围读取(歌词/封面/标签头部)与图片 dataURL
 * 播放地址由 localFileProxyUrl 生成本地 HTTP 代理 URL(server.js /api/local-file,支持 Range)。
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const authorizedLocalMusicRoots = new Set();
const LOCAL_FILE_TOKEN = crypto.randomBytes(16).toString('hex');
let proxyPort = 0;

const LOCAL_LIBRARY_EXTS = new Set(['.mp3', '.flac', '.m4a', '.wav', '.ogg', '.lrc', '.txt', '.jpg', '.jpeg', '.png', '.webp']);
const LOCAL_LIBRARY_MIME = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.lrc': 'text/plain',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const LOCAL_LIBRARY_SCAN_STAT_CONCURRENCY = 24;
const LOCAL_LIBRARY_SCAN_VISIT_LIMIT = 60000;
const LOCAL_LIBRARY_INCREMENTAL_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LOCAL_LIBRARY_NAME_COMPARE = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' }).compare;

function compareLocalLibraryEntries(a, b) {
  return LOCAL_LIBRARY_NAME_COMPARE(a.name, b.name);
}

function localLibraryScanStatConcurrency(count) {
  count = Math.max(0, Number(count) || 0);
  if (count >= 24000) return 8;
  if (count >= 12000) return 10;
  if (count >= 5000) return 12;
  if (count >= 1200) return 16;
  return LOCAL_LIBRARY_SCAN_STAT_CONCURRENCY;
}

function yieldLocalLibraryScanTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function normalizeLocalMusicRoot(folderPath) {
  const resolved = path.resolve(String(folderPath || ''));
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error('LOCAL_LIBRARY_NOT_DIRECTORY');
  return resolved;
}

function rememberLocalMusicRoot(folderPath) {
  const root = normalizeLocalMusicRoot(folderPath);
  authorizedLocalMusicRoots.add(root);
  return root;
}

function resolveAuthorizedLocalFile(filePath) {
  const target = path.resolve(String(filePath || ''));
  for (const root of authorizedLocalMusicRoots) {
    if (target === root || target.startsWith(root + path.sep)) return target;
  }
  throw new Error('LOCAL_FILE_NOT_AUTHORIZED');
}

function localLibraryRelativePath(root, relPath) {
  return path.join(path.basename(root), relPath).replace(/\\/g, '/');
}

function isPathInsideLocalLibraryRoot(root, absPath) {
  const rel = path.relative(root, absPath);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function normalizeLocalLibraryRelPath(relPath) {
  return String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function localLibraryRelPathFromRecord(root, record) {
  if (!record) return '';
  const fullPath = record.fullPath || record.filePath || record.path || record.localFilePathAbsolute || '';
  if (fullPath) {
    const abs = path.resolve(String(fullPath));
    if (isPathInsideLocalLibraryRoot(root, abs)) return normalizeLocalLibraryRelPath(path.relative(root, abs));
  }
  let rel = record.relativePath || record.webkitRelativePath || record.name || '';
  rel = normalizeLocalLibraryRelPath(rel);
  const rootBase = normalizeLocalLibraryRelPath(path.basename(root));
  if (rootBase && (rel === rootBase || rel.startsWith(rootBase + '/'))) rel = rel.slice(rootBase.length).replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return '';
  return rel;
}

function localLibraryDirRelPath(relPath) {
  const dir = normalizeLocalLibraryRelPath(path.dirname(String(relPath || '')));
  return dir === '.' ? '' : dir;
}

function localFileProxyUrl(filePath) {
  if (!proxyPort) return pathToFileURL(filePath).href;
  return `http://127.0.0.1:${proxyPort}/api/local-file?token=${encodeURIComponent(LOCAL_FILE_TOKEN)}&path=${encodeURIComponent(filePath)}`;
}

function makeLocalLibraryFileRecord(root, item, stat) {
  const webkitRelativePath = localLibraryRelativePath(root, item.rel);
  return {
    ...(item.source || {}),
    fullPath: item.abs,
    filePath: item.abs,
    url: localFileProxyUrl(item.abs),
    name: item.entry.name,
    relativePath: webkitRelativePath,
    webkitRelativePath,
    size: stat.size,
    lastModified: Math.round(stat.mtimeMs),
    type: LOCAL_LIBRARY_MIME[item.ext] || '',
  };
}

function rehydrateLocalLibraryFileRecord(root, record, relPath) {
  const rel = normalizeLocalLibraryRelPath(relPath || localLibraryRelPathFromRecord(root, record));
  if (!rel) return null;
  const abs = path.resolve(root, rel);
  if (!isPathInsideLocalLibraryRoot(root, abs)) return null;
  const ext = path.extname(record && record.name || abs).toLowerCase();
  if (!LOCAL_LIBRARY_EXTS.has(ext)) return null;
  const webkitRelativePath = localLibraryRelativePath(root, rel);
  return {
    ...(record || {}),
    fullPath: abs,
    filePath: abs,
    url: localFileProxyUrl(abs),
    name: (record && record.name) || path.basename(abs),
    relativePath: webkitRelativePath,
    webkitRelativePath,
    size: Number(record && record.size) || 0,
    lastModified: Number(record && record.lastModified) || 0,
    type: (record && record.type) || LOCAL_LIBRARY_MIME[ext] || '',
  };
}

function makeLocalLibraryDirectoryRecord(root, relPath, stat) {
  const rel = normalizeLocalLibraryRelPath(relPath);
  return {
    fullPath: path.join(root, rel),
    relativePath: rel,
    lastModified: Math.round(stat.mtimeMs),
  };
}

/**
 * 并发执行本地库文件 stat。大曲库逐个 await 会把文件夹导入时间拉长,这里限制并发避免压满磁盘队列。
 */
async function statLocalLibraryFiles(root, items) {
  const files = [];
  let cursor = 0;
  let processed = 0;
  let found = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      processed += 1;
      if (processed % 160 === 0) await yieldLocalLibraryScanTurn();
      let stat = null;
      try {
        stat = await fs.promises.stat(item.abs);
      } catch (_e) {
        continue;
      }
      if (!stat.isFile()) continue;
      files[item.index] = makeLocalLibraryFileRecord(root, item, stat);
      found += 1;
    }
  }
  const workerCount = Math.min(localLibraryScanStatConcurrency(items.length), Math.max(1, items.length));
  const workers = new Array(workerCount);
  for (let i = 0; i < workerCount; i += 1) workers[i] = worker();
  await Promise.all(workers);
  const compact = new Array(found);
  let write = 0;
  for (let i = 0; i < files.length; i += 1) {
    if (files[i]) compact[write++] = files[i];
  }
  return compact;
}

async function collectLocalLibraryFolderEntries(root) {
  const files = [];
  const directories = [];
  const stack = [''];
  let visited = 0;
  let scannedDirs = 0;
  while (stack.length) {
    const relDir = stack.pop();
    const absDir = path.join(root, relDir);
    scannedDirs += 1;
    if (scannedDirs % 32 === 0) await yieldLocalLibraryScanTurn();
    let dirStat = null;
    try {
      dirStat = await fs.promises.stat(absDir);
    } catch (_e) {
      continue;
    }
    if (!dirStat.isDirectory()) continue;
    directories.push(makeLocalLibraryDirectoryRecord(root, relDir, dirStat));
    let entries = [];
    try {
      entries = await fs.promises.readdir(absDir, { withFileTypes: true });
    } catch (_e) {
      continue;
    }
    entries.sort(compareLocalLibraryEntries);
    for (const entry of entries) {
      visited += 1;
      if (visited % 360 === 0) await yieldLocalLibraryScanTurn();
      if (visited > LOCAL_LIBRARY_SCAN_VISIT_LIMIT) break;
      const rel = path.join(relDir, entry.name);
      const abs = path.join(root, rel);
      if (entry.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!LOCAL_LIBRARY_EXTS.has(ext)) continue;
      files.push({ abs, rel, entry, ext, index: files.length });
    }
    if (visited > LOCAL_LIBRARY_SCAN_VISIT_LIMIT) break;
  }
  return { files, directories, truncated: visited > LOCAL_LIBRARY_SCAN_VISIT_LIMIT };
}

function normalizeLocalLibraryPreviousSnapshot(snapshot) {
  const source = Array.isArray(snapshot) ? { files: snapshot } : (snapshot || {});
  const files = Array.isArray(source.files) ? source.files : [];
  const directories = Array.isArray(source.directories) ? source.directories : [];
  return { files, directories, truncated: !!source.truncated, savedAt: Number(source.savedAt) || 0 };
}

function createPreviousLocalLibraryLookups(root, snapshot) {
  const previous = normalizeLocalLibraryPreviousSnapshot(snapshot);
  const filesByRel = new Map();
  const dirsByRel = new Map();
  for (const file of previous.files) {
    const rel = localLibraryRelPathFromRecord(root, file);
    if (rel && !filesByRel.has(rel)) filesByRel.set(rel, file);
  }
  for (const dir of previous.directories) {
    let rel = normalizeLocalLibraryRelPath(dir && dir.relativePath || '');
    const fullPath = dir && (dir.fullPath || dir.path);
    if (fullPath) {
      const abs = path.resolve(String(fullPath));
      if (isPathInsideLocalLibraryRoot(root, abs)) rel = normalizeLocalLibraryRelPath(path.relative(root, abs));
    }
    dirsByRel.set(rel, dir);
  }
  return { previous, filesByRel, dirsByRel };
}

async function scanLocalMusicFolderFull(folderPath) {
  const root = rememberLocalMusicRoot(folderPath);
  const listed = await collectLocalLibraryFolderEntries(root);
  return {
    ok: true,
    folderPath: root,
    files: await statLocalLibraryFiles(root, listed.files),
    directories: listed.directories,
    truncated: listed.truncated,
    scanMode: 'full',
  };
}

async function scanLocalMusicFolderIncremental(folderPath, previousSnapshot) {
  const root = rememberLocalMusicRoot(folderPath);
  const { previous, filesByRel, dirsByRel } = createPreviousLocalLibraryLookups(root, previousSnapshot);
  if (!previous.files.length || !previous.directories.length || previous.truncated) return scanLocalMusicFolderFull(root);
  if (previous.savedAt && Date.now() - previous.savedAt > LOCAL_LIBRARY_INCREMENTAL_MAX_AGE_MS) return scanLocalMusicFolderFull(root);

  const listed = await collectLocalLibraryFolderEntries(root);
  // 本次遍历若已达访问上限,listed.files/listed.directories 与磁盘现状不一致;此时增量合并会把缺失项误判为删除。
  // 与 previous.truncated 分支同源处理:改用全量语义返回已遍历结果,避免残缺增量覆盖当前会话与持久快照。
  if (listed.truncated) {
    return {
      ok: true,
      folderPath: root,
      files: await statLocalLibraryFiles(root, listed.files),
      directories: listed.directories,
      truncated: true,
      scanMode: 'full',
    };
  }
  const changedDirs = new Set();
  for (const dir of listed.directories) {
    const rel = normalizeLocalLibraryRelPath(dir.relativePath);
    const prev = dirsByRel.get(rel);
    if (!prev || Number(prev.lastModified) !== Number(dir.lastModified)) changedDirs.add(rel);
  }

  const pending = [];
  const reusedByRel = new Map();
  for (const item of listed.files) {
    const rel = normalizeLocalLibraryRelPath(item.rel);
    const previousFile = filesByRel.get(rel);
    if (!previousFile || changedDirs.has(localLibraryDirRelPath(rel))) {
      pending.push({ ...item, index: pending.length, source: previousFile || {} });
      continue;
    }
    const reused = rehydrateLocalLibraryFileRecord(root, previousFile, rel);
    if (reused) reusedByRel.set(rel, reused);
    else pending.push({ ...item, index: pending.length, source: previousFile || {} });
  }

  const fresh = await statLocalLibraryFiles(root, pending);
  const freshByRel = new Map();
  for (const file of fresh) {
    const rel = localLibraryRelPathFromRecord(root, file);
    if (rel) freshByRel.set(rel, file);
  }

  const files = [];
  for (const item of listed.files) {
    const rel = normalizeLocalLibraryRelPath(item.rel);
    const file = freshByRel.get(rel) || reusedByRel.get(rel);
    if (file) files.push(file);
  }

  return {
    ok: true,
    folderPath: root,
    files,
    directories: listed.directories,
    truncated: listed.truncated,
    scanMode: 'incremental',
    reused: reusedByRel.size,
    refreshed: fresh.length,
  };
}

async function scanLocalMusicFolder(folderPath, options) {
  const snapshot = options && options.previousSnapshot;
  if (snapshot && Array.isArray(snapshot.files) && Array.isArray(snapshot.directories)) {
    return scanLocalMusicFolderIncremental(folderPath, snapshot);
  }
  return scanLocalMusicFolderFull(folderPath);
}

async function refreshLocalMusicFileEntries(folderPath, snapshotOrFiles) {
  const root = rememberLocalMusicRoot(folderPath);
  const snapshot = normalizeLocalLibraryPreviousSnapshot(snapshotOrFiles);
  const list = snapshot.files;
  const files = [];
  for (const file of list) {
    if (!file) continue;
    const record = rehydrateLocalLibraryFileRecord(root, file);
    if (record) files.push(record);
  }
  return {
    ok: true,
    folderPath: root,
    files,
    directories: snapshot.directories,
    snapshot: true,
    restoredFromSnapshot: true,
  };
}

/**
 * 分块读取已授权本地文件范围并编码,避免完整范围 Buffer 与 base64 大字符串同时驻留。
 */
async function readAuthorizedLocalFileRange(filePath, start, end) {
  const target = resolveAuthorizedLocalFile(filePath);
  const stat = await fs.promises.stat(target);
  if (!stat.isFile()) throw new Error('LOCAL_FILE_NOT_FOUND');
  const fileSize = stat.size;
  const from = Math.max(0, Math.min(fileSize, Number(start) || 0));
  const requestedEnd = end == null ? fileSize : Number(end);
  const to = Math.max(from, Math.min(fileSize, Number.isFinite(requestedEnd) ? requestedEnd : fileSize));
  const maxBytes = 64 * 1024 * 1024;
  const length = Math.min(maxBytes, to - from);
  if (!length) return { ok: true, size: fileSize, start: from, end: from, byteLength: 0, base64Chunks: [] };
  const handle = await fs.promises.open(target, 'r');
  try {
    const chunkSize = 768 * 1024;
    const buffer = Buffer.allocUnsafe(Math.min(chunkSize, length));
    const base64Chunks = [];
    let bytesReadTotal = 0;
    // 文件读取允许短读;每轮沿实际字节数推进,直到范围结束或底层明确返回 EOF。
    while (bytesReadTotal < length) {
      const requestLength = Math.min(buffer.length, length - bytesReadTotal);
      const result = await handle.read(buffer, 0, requestLength, from + bytesReadTotal);
      const bytesRead = result && result.bytesRead || 0;
      if (!bytesRead) break;
      base64Chunks.push(buffer.subarray(0, bytesRead).toString('base64'));
      bytesReadTotal += bytesRead;
    }
    return {
      ok: true,
      size: fileSize,
      start: from,
      end: from + bytesReadTotal,
      byteLength: bytesReadTotal,
      base64Chunks,
    };
  } finally {
    await handle.close();
  }
}

async function readAuthorizedLocalFileDataUrl(filePath) {
  const target = resolveAuthorizedLocalFile(filePath);
  const ext = path.extname(target).toLowerCase();
  const mime = LOCAL_LIBRARY_MIME[ext] || 'application/octet-stream';
  if (!mime.startsWith('image/')) throw new Error('LOCAL_FILE_NOT_IMAGE');
  const stat = await fs.promises.stat(target);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('LOCAL_IMAGE_TOO_LARGE');
  const buffer = await fs.promises.readFile(target);
  return { ok: true, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
}

function setLocalMusicProxyPort(port) {
  proxyPort = Math.max(0, Number(port) || 0);
}

function getLocalFileToken() {
  return LOCAL_FILE_TOKEN;
}

module.exports = {
  compareLocalLibraryEntries,
  localLibraryScanStatConcurrency,
  normalizeLocalMusicRoot,
  rememberLocalMusicRoot,
  resolveAuthorizedLocalFile,
  isPathInsideLocalLibraryRoot,
  normalizeLocalLibraryRelPath,
  localLibraryRelPathFromRecord,
  localFileProxyUrl,
  makeLocalLibraryFileRecord,
  rehydrateLocalLibraryFileRecord,
  statLocalLibraryFiles,
  collectLocalLibraryFolderEntries,
  scanLocalMusicFolder,
  scanLocalMusicFolderFull,
  scanLocalMusicFolderIncremental,
  refreshLocalMusicFileEntries,
  readAuthorizedLocalFileRange,
  readAuthorizedLocalFileDataUrl,
  setLocalMusicProxyPort,
  getLocalFileToken,
  LOCAL_LIBRARY_EXTS,
  LOCAL_LIBRARY_MIME,
  LOCAL_LIBRARY_SCAN_VISIT_LIMIT,
  LOCAL_LIBRARY_INCREMENTAL_MAX_AGE_MS,
};
