'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const updater = require('../../desktop/custom-source/bundled-updater');

const LOCAL_SCRIPT = [
  '/**',
  ' * @name TestLxSource',
  ' * @version 1.0.0',
  ' * @author tester',
  ' */',
  'console.log("v1")',
].join('\n');

function remoteScript(version, extra) {
  return [
    '/**',
    ' * @name TestLxSource',
    ` * @version ${version}`,
    ' * @author tester',
    ' */',
    `console.log(${JSON.stringify(extra || version)})`,
  ].join('\n');
}

function textResponse(text) {
  return { ok: true, status: 200, text: async () => text };
}

function jsonResponse(obj, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => obj };
}

// 可注入的缓存(默认 TTL 短,便于在测试中触发过期)
function makeCache() {
  const m = new Map();
  return {
    DEFAULT_TTL: 1000,
    ERROR_TTL: 500,
    get: (k) => m.get(k),
    set: (k, v) => m.set(k, v),
    clear: () => m.clear(),
  };
}

function buildDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-bundled-'));
  fs.writeFileSync(path.join(dir, 'test_source.js'), LOCAL_SCRIPT, 'utf8');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    sources: [
      { fileName: 'test_source.js', repo: 'a/b', ref: 'master', path: 'src/test_source.js' },
      // 非法项应被过滤:文件名带路径 / repo 形状错误 / path 带 ..
      { fileName: '../evil.js', repo: 'a/b', ref: 'master', path: 'x.js' },
      { fileName: 'dup.js', repo: 'not-a-repo', ref: 'master', path: 'x.js' },
      { fileName: 'local-only.js', repo: 'c/d', ref: 'main', path: 'p/local-only.js' },
    ],
  }), 'utf8');
  fs.writeFileSync(path.join(dir, 'local-only.js'), LOCAL_SCRIPT.replace('TestLxSource', 'LocalOnly'), 'utf8');
  return dir;
}

test('manifest loads valid entries and filters malformed ones', () => {
  const dir = buildDir();
  const manifest = updater.loadBundledManifest(dir);
  assert.deepEqual(manifest.sources.map(entry => entry.fileName), ['test_source.js', 'local-only.js']);
  assert.equal(manifest.sources[0].ref, 'master');
  assert.equal(manifest.sources[1].ref, 'main');
});

test('check reports update available when upstream differs, latest when identical', async () => {
  const dir = buildDir();
  const results = await updater.checkBundledUpdates(dir, {
    fetchImpl: async url => {
      if (url.includes('/c/d/')) return textResponse(LOCAL_SCRIPT.replace('TestLxSource', 'LocalOnly'));
      if (url.includes('raw.githubusercontent.com')) throw new Error('HTTP_000');
      return textResponse(remoteScript('1.2.0'));
    },
  });
  const byFile = Object.fromEntries(results.map(item => [item.fileName, item]));
  const tracked = byFile['test_source.js'];
  assert.equal(tracked.ok, true);
  assert.equal(tracked.updateAvailable, true);
  assert.equal(tracked.localVersion, '1.0.0');
  assert.equal(tracked.remoteVersion, '1.2.0');
  // raw 失败时回退 jsdelivr 线路
  assert.match(tracked.fetchedVia, /jsdelivr\.net/);
  assert.equal(byFile['local-only.js'].ok, true);
  assert.equal(byFile['local-only.js'].updateAvailable, false);
});

test('check reports error without throwing when every mirror fails', async () => {
  const dir = buildDir();
  const results = await updater.checkBundledUpdates(dir, {
    fetchImpl: async () => { throw new Error('HTTP_502'); },
  });
  assert.equal(results.length, 2);
  for (const item of results) {
    assert.equal(item.ok, false);
    assert.match(item.error, /HTTP_502/);
  }
});

test('apply rejects renamed scripts and oversized payloads, keeps local file intact', async () => {
  const dir = buildDir();
  await assert.rejects(
    () => updater.checkAndUpdateBundledSource(dir, 'test_source.js', {
      fetchImpl: async () => textResponse(remoteScript('9.9.9').replace('@name TestLxSource', '@name SomeoneElse')),
    }),
    /NAME_MISMATCH/
  );
  await assert.rejects(
    () => updater.checkAndUpdateBundledSource(dir, 'test_source.js', {
      fetchImpl: async () => textResponse('x'.repeat(1024 * 1024 + 10)),
    }),
    /SCRIPT_TOO_LARGE/
  );
  assert.equal(fs.readFileSync(path.join(dir, 'test_source.js'), 'utf8'), LOCAL_SCRIPT, '失败不得破坏本地脚本');
  assert.equal((await updater.checkAndUpdateBundledSource(dir, 'not-tracked.js', { fetchImpl: async () => textResponse(LOCAL_SCRIPT) }) .then(() => 'no', e => e.message)), 'BUNDLED_SOURCE_NOT_TRACKED');
});

test('apply writes the new script atomically and reports no-op for identical content', async () => {
  const dir = buildDir();
  const updated = await updater.checkAndUpdateBundledSource(dir, 'test_source.js', {
    fetchImpl: async () => textResponse(remoteScript('1.2.0', 'v2-body')),
  });
  assert.equal(updated.updated, true);
  assert.equal(updated.version, '1.2.0');
  assert.match(fs.readFileSync(path.join(dir, 'test_source.js'), 'utf8'), /v2-body/);
  assert.equal(fs.readdirSync(dir).filter(name => name.includes('.tmp-')).length, 0, '临时文件必须被清理');

  const noop = await updater.checkAndUpdateBundledSource(dir, 'test_source.js', {
    fetchImpl: async () => textResponse(remoteScript('1.2.0', 'v2-body')),
  });
  assert.equal(noop.updated, false);
});

test('compareVersions handles semver, leading v, and non-numeric as incomparable', () => {
  assert.equal(updater.compareVersions('v1.3.9', 'v1.3.8'), 1);
  assert.equal(updater.compareVersions('v1.3.8', 'v1.3.8'), 0);
  assert.equal(updater.compareVersions('1.3.7', 'v1.3.8'), -1);
  assert.equal(updater.compareVersions('master', 'v1.3.8'), 0, '非数字版本不可比');
  assert.equal(updater.compareVersions('v1.3.8', ''), 0, '缺 basedOn 不可比');
});

test('probeUpstreamSignal detects newer release and isolates failures', async () => {
  const entry = {
    fileName: 'x.js',
    upstream: { repo: 'a/b', kind: 'github-release', basedOn: 'v1.3.8', signalUrl: 'https://api.github.com/repos/a/b/releases/latest' },
  };
  const releaseFetch = async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v1.3.9', name: 'v1.3.9' }) });
  const newer = await updater.probeUpstreamSignal(entry, releaseFetch);
  assert.equal(newer.available, true);
  assert.equal(newer.latestVersion, 'v1.3.9');
  assert.equal(newer.basedOn, 'v1.3.8');

  const sameFetch = async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v1.3.8' }) });
  const same = await updater.probeUpstreamSignal(entry, sameFetch);
  assert.equal(same.available, false);

  const failFetch = async () => { throw new Error('HTTP_500'); };
  const failed = await updater.probeUpstreamSignal(entry, failFetch);
  assert.equal(failed.available, false);
  assert.match(failed.error, /HTTP_500/);

  const skipped = await updater.probeUpstreamSignal({ fileName: 'y.js' }, releaseFetch);
  assert.equal(skipped.skipped, true);
});

test('checkBundledUpdates surfaces upstream update without blocking script check', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-up-'));
  fs.writeFileSync(path.join(dir, 'up_source.js'), LOCAL_SCRIPT, 'utf8');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    sources: [{
      fileName: 'up_source.js', repo: 'a/b', ref: 'main', path: 'p/up_source.js',
      upstream: { repo: 'kejichangqing/QingMusic', kind: 'github-release', basedOn: 'v1.3.8', signalUrl: 'https://api.github.com/repos/kejichangqing/QingMusic/releases/latest' },
    }],
  }), 'utf8');
  const results = await updater.checkBundledUpdates(dir, {
    fetchImpl: async url => {
      if (url.includes('api.github.com/repos/kejichangqing/QingMusic/releases')) {
        return { ok: true, status: 200, json: async () => ({ tag_name: 'v1.3.9' }) };
      }
      return textResponse(LOCAL_SCRIPT);
    },
  });
  const r = results[0];
  assert.equal(r.ok, true);
  assert.equal(r.updateAvailable, false, '脚本未变');
  assert.equal(r.upstreamSignal.available, true, '上游有更新');
  assert.equal(r.upstreamSignal.latestVersion, 'v1.3.9');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('wiring: manifest tracks keep-alive and ipc/preload/renderer expose update flow', () => {
  const root = path.join(__dirname, '../..');
  const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
  const manifestRaw = fs.readFileSync(path.join(root, 'desktop/custom-source/bundled/manifest.json'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const musicSrc = fs.readFileSync(path.join(root, 'src/music/legacy-music.js'), 'utf8');

  const manifest = JSON.parse(manifestRaw);
  const qing = manifest.sources.find(entry => entry.fileName === 'qing_haitang_resolve.js');
  assert.ok(qing, 'manifest 应声明内置青听·海棠解析器');
  assert.equal(fs.existsSync(path.join(root, 'desktop/custom-source/bundled', qing.fileName)), true);

  assert.match(main, /stellaflix-custom-source-bundled-check-updates/);
  assert.match(main, /stellaflix-custom-source-bundled-apply-update/);
  assert.match(main, /replaceScript\(activeId/);
  assert.match(preload, /checkBundledSourceUpdates/);
  assert.match(preload, /applyBundledSourceUpdate/);
  assert.match(musicSrc, /function checkBundledSourceUpdates/);
  assert.match(musicSrc, /function applyBundledSourceUpdate/);
  assert.match(page, /checkBundledSourceUpdates\(\)/);
});

test('probeUpstreamSignal serves cached result without re-hitting network', async () => {
  const entry = { fileName: 'x.js', upstream: { repo: 'a/b', kind: 'github-release', basedOn: 'v1.3.8', signalUrl: 'https://api.github.com/repos/a/b/releases/latest' } };
  const cache = makeCache();
  const first = await updater.probeUpstreamSignal(entry, async () => jsonResponse({ tag_name: 'v1.3.9' }), { cache, now: 1000 });
  assert.equal(first.available, true);
  assert.notEqual(first.cached, true);
  let calls = 0;
  const second = await updater.probeUpstreamSignal(entry, async () => { calls += 1; throw new Error('HTTP_500'); }, { cache, now: 1500 });
  assert.equal(calls, 0, '缓存命中不得再打网络');
  assert.equal(second.cached, true);
  assert.equal(second.available, true, '返回缓存中的可用结果');
});

test('probeUpstreamSignal cache expires after TTL and re-fetches', async () => {
  const entry = { fileName: 'x.js', upstream: { repo: 'a/b', kind: 'github-release', basedOn: 'v1.3.8', signalUrl: 'https://api.github.com/repos/a/b/releases/latest' } };
  const cache = makeCache();
  await updater.probeUpstreamSignal(entry, async () => jsonResponse({ tag_name: 'v1.3.8' }), { cache, now: 1000 });
  const refreshed = await updater.probeUpstreamSignal(entry, async () => jsonResponse({ tag_name: 'v1.4.0' }), { cache, now: 2500 });
  assert.notEqual(refreshed.cached, true, '已过期应重新探测');
  assert.equal(refreshed.latestVersion, 'v1.4.0', '返回新探测值');
});

test('probeUpstreamSignal isolates cache by repo and hits network per distinct repo', async () => {
  const a = { fileName: 'a.js', upstream: { repo: 'a/b', kind: 'github-release', basedOn: 'v1.0.0', signalUrl: 'https://api.github.com/repos/a/b/releases/latest' } };
  const b = { fileName: 'b.js', upstream: { repo: 'c/d', kind: 'github-release', basedOn: 'v1.0.0', signalUrl: 'https://api.github.com/repos/c/d/releases/latest' } };
  const cache = makeCache();
  let calls = 0;
  const fetchImpl = async (url) => { calls += 1; return jsonResponse({ tag_name: url.includes('/a/b/') ? 'v2.0.0' : 'v3.0.0' }); };
  await updater.probeUpstreamSignal(a, fetchImpl, { cache, now: 1000 });
  await updater.probeUpstreamSignal(b, fetchImpl, { cache, now: 1000 });
  await updater.probeUpstreamSignal(a, fetchImpl, { cache, now: 1100 }); // 命中 a 的缓存
  assert.equal(calls, 2, 'a 仅打 1 次 + b 打 1 次 = 2,重复查 a 应走缓存');
});

test('probeUpstreamSignal caches rate-limit(403) long and does not re-hit within TTL', async () => {
  const entry = { fileName: 'x.js', upstream: { repo: 'a/b', kind: 'github-release', basedOn: 'v1.3.8', signalUrl: 'https://api.github.com/repos/a/b/releases/latest' } };
  // 生产同款缓存(成功/限流 1 小时; 其他瞬时错误 10 分钟)
  const cache = (function () { const m = new Map(); return { DEFAULT_TTL: 60 * 60 * 1000, ERROR_TTL: 10 * 60 * 1000, get: k => m.get(k), set: (k, v) => m.set(k, v), clear: () => m.clear() }; })();
  const first = await updater.probeUpstreamSignal(entry, async () => { throw new Error('HTTP_403'); }, { cache, now: 1000 });
  assert.match(first.error, /HTTP_403/);
  let calls = 0;
  const second = await updater.probeUpstreamSignal(entry, async () => { calls += 1; return jsonResponse({ tag_name: 'v1.3.9' }); }, { cache, now: 1000 + 60 * 60 * 1000 - 1 });
  assert.equal(calls, 0, '限流期内不得再打 API');
  assert.equal(second.cached, true);
  assert.match(second.error, /HTTP_403/);
});

test('signalCache export is a usable cache container', () => {
  assert.equal(typeof updater.signalCache.get, 'function');
  assert.equal(typeof updater.signalCache.set, 'function');
  assert.equal(updater.signalCache.DEFAULT_TTL, 60 * 60 * 1000);
});
