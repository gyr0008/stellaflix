'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const musicSrc = fs.readFileSync(path.join(__dirname, '../../src/music/legacy-music.js'), 'utf8');

/**
 * 从 legacy-music.js 截取取源模式真实实现(常量 + 读写在 vm 沙箱中执行,
 * apiJson/resolveOfficialPlaybackData/SFLocalLibrary 由用例注入,记录真实调用顺序)。
 */
function loadResolver({ storedMode, customResponses, officialResponse, localSongUrl }) {
  const start = musicSrc.indexOf('var SOURCE_MODE_STORE_KEY');
  const end = musicSrc.indexOf('function playbackRestrictionMessage', start);
  assert.ok(start >= 0 && end > start, '未找到取源模式实现切片');

  const calls = [];
  const storage = new Map();
  if (storedMode) storage.set('stellaflix-source-mode-v1', storedMode);
  const sandbox = {
    console: { warn: () => {} },
    window: { localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, v),
      removeItem: k => storage.delete(k),
    } },
    normalizePlaybackQuality: q => String(q || 'standard'),
    resolveOfficialPlaybackData: async (song, q) => {
      calls.push(['official', song && song.id, q]);
      if (officialResponse instanceof Error) throw officialResponse;
      return officialResponse;
    },
    apiJson: async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : {};
      calls.push(['custom', url, body]);
      const queued = customResponses.shift();
      if (queued instanceof Error) throw queued;
      return queued;
    },
    SFLocalLibrary: { ensureLocalSongUrl: song => (song && song.localUrl) || localSongUrl || '' },
  };
  vm.runInNewContext(musicSrc.slice(start, end), sandbox);
  return { resolveOnlinePlaybackData: sandbox.resolveOnlinePlaybackData, tryCustomSourceResolve: sandbox.tryCustomSourceResolve, readPlaybackSourceMode: sandbox.readPlaybackSourceMode, calls };
}

test('runtime: default (custom-first) resolves third-party first and skips official on success', async () => {
  const h = loadResolver({
    customResponses: [{ attempted: true, url: '/api/custom-source/audio?ticket=t1', thirdParty: true, source: 'kw' }],
    officialResponse: { url: '/official.mp3' },
  });
  assert.equal(h.readPlaybackSourceMode(), 'custom-first');
  const out = await h.resolveOnlinePlaybackData({ provider: 'netease', id: 'n1', name: 'S' }, 'hires');
  assert.equal(out.url, '/api/custom-source/audio?ticket=t1');
  assert.equal(out.thirdParty, true);
  assert.equal(out.requestedQuality, 'hires');
  assert.deepEqual(h.calls.map(c => c[0]), ['custom'], '官方接口不应被调用');
  assert.equal(h.calls[0][2].mode, 'custom-first', 'mode 必须随请求体透传');
  assert.equal(h.calls[0][2].song.id, 'n1');
});

test('runtime: custom-first falls back to official when custom fails', async () => {
  const h = loadResolver({
    customResponses: [{ attempted: true, url: '', reason: 'resolve_failed' }],
    officialResponse: { url: '/official.mp3', level: 'lossless' },
  });
  const out = await h.resolveOnlinePlaybackData({ provider: 'netease', id: 'n2' }, 'hires');
  assert.equal(out.url, '/official.mp3');
  assert.deepEqual(h.calls.map(c => c[0]), ['custom', 'official'], '失败后回退官方且不再二次请求第三方');
});

test('runtime: custom-first returns official failure when both fail (进入换源流程)', async () => {
  const h = loadResolver({
    customResponses: [{ attempted: true, url: '', reason: 'resolve_failed' }],
    officialResponse: { url: '', reason: 'vip_required', restriction: { category: 'vip_required' } },
  });
  const out = await h.resolveOnlinePlaybackData({ provider: 'netease', id: 'n3' }, 'hires');
  assert.equal(out.url, '');
  assert.equal(out.reason, 'vip_required');
  assert.deepEqual(h.calls.map(c => c[0]), ['custom', 'official']);
});

test('runtime: custom-only never touches official and reports unavailability', async () => {
  const h = loadResolver({
    storedMode: 'custom-only',
    customResponses: [{ attempted: false, reason: 'inactive' }],
    officialResponse: { url: '/official.mp3' },
  });
  const out = await h.resolveOnlinePlaybackData({ provider: 'netease', id: 'n4' }, 'hires');
  assert.equal(out.url, '');
  assert.equal(out.reason, 'custom_source_unavailable');
  assert.match(out.message, /仅自定义音源模式/);
  assert.deepEqual(h.calls.map(c => c[0]), ['custom'], '仅自定义模式不得回退官方');
});

test('runtime: official-first keeps legacy order and sends officialResult context', async () => {
  const h = loadResolver({
    storedMode: 'official-first',
    customResponses: [],
    officialResponse: { url: '/official.mp3' },
  });
  const ok = await h.resolveOnlinePlaybackData({ provider: 'netease', id: 'n5' }, 'hires');
  assert.equal(ok.url, '/official.mp3');
  assert.deepEqual(h.calls.map(c => c[0]), ['official'], '官方成功时不得触发第三方');

  const h2 = loadResolver({
    storedMode: 'official-first',
    customResponses: [{ attempted: true, url: '', reason: 'policy_blocked' }],
    officialResponse: { url: '', reason: 'url_unavailable', error: 'boom' },
  });
  const out2 = await h2.resolveOnlinePlaybackData({ provider: 'netease', id: 'n6' }, 'hires');
  assert.equal(out2.reason, 'url_unavailable');
  assert.deepEqual(h2.calls.map(c => c[0]), ['official', 'custom']);
  const customBody = h2.calls[1][2];
  assert.equal(customBody.mode, undefined, 'official-first 兜底请求不带 mode,与旧策略一致');
  assert.equal(customBody.officialResult.reason, 'url_unavailable');
});

test('runtime: local songs short-circuit to the proxy url without any network calls', async () => {
  const h = loadResolver({
    customResponses: [],
    officialResponse: { url: '/official.mp3' },
    localSongUrl: 'http://127.0.0.1:3000/api/local-file?token=T&path=C%3A%2Fm.mp3',
  });
  const out = await h.resolveOnlinePlaybackData({ provider: 'local', type: 'local', id: 'local:C:/m.mp3', localUrl: '' }, 'hires');
  assert.equal(out.url, 'http://127.0.0.1:3000/api/local-file?token=T&path=C%3A%2Fm.mp3');
  assert.equal(out.local, true);
  assert.deepEqual(h.calls, [], '本地歌不得发起任何在线请求');

  const h2 = loadResolver({ customResponses: [], officialResponse: { url: '/x' } });
  const missing = await h2.resolveOnlinePlaybackData({ provider: 'local', id: 'local:C:/gone.mp3' }, 'hires');
  assert.equal(missing.url, '');
  assert.equal(missing.reason, 'local_file_unavailable');
  assert.deepEqual(h2.calls, []);
});

test('runtime: custom resolve throwing or returning junk degrades to official path', async () => {
  const h = loadResolver({
    customResponses: [new Error('network down')],
    officialResponse: { url: '/official.mp3' },
  });
  const out = await h.resolveOnlinePlaybackData({ provider: 'netease', id: 'n7' }, 'hires');
  assert.equal(out.url, '/official.mp3');
  assert.deepEqual(h.calls.map(c => c[0]), ['custom', 'official']);

  const h2 = loadResolver({
    customResponses: [{ attempted: true, url: 'https://third.example/a.mp3', thirdParty: false }],
    officialResponse: { url: '', reason: 'url_unavailable' },
  });
  const out2 = await h2.resolveOnlinePlaybackData({ provider: 'netease', id: 'n8' }, 'hires');
  assert.equal(out2.url, '', 'thirdParty!==true 的响应不得被采用');
  assert.equal(out2.reason, 'url_unavailable');
});
