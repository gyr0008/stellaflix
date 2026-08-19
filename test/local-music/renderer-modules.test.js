'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// local-library.js 是经典脚本 IIFE(挂 window.SFLocalLibrary),node 下以最小 window 桩加载执行。
function loadLocalLibrary(windowStub) {
  global.window = windowStub || {};
  const modulePath = path.join(__dirname, '../../src/music/local-library.js');
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  return global.window.SFLocalLibrary;
}

test('local-library module loads headless and resolves proxy urls per song', () => {
  const api = loadLocalLibrary({ localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  } });
  assert.ok(api && typeof api.importFolder === 'function');
  assert.equal(api.state.ready, false);

  assert.equal(api.ensureLocalSongUrl({ localUrl: 'http://127.0.0.1:3/api/local-file?token=T&path=a' }), 'http://127.0.0.1:3/api/local-file?token=T&path=a');
  assert.equal(api.ensureLocalSongUrl({ localUrl: '', localFile: { url: 'http://127.0.0.1:3/b' } }), 'http://127.0.0.1:3/b');
  assert.equal(api.ensureLocalSongUrl({}), '');
  assert.equal(api.ensureLocalSongUrl(null), '');

  // 边界:desktop API 缺失时歌词读取返回空串并缓存,不抛错
  const song = { localLyricFile: null, localLyricText: null };
  return api.readLocalLyricText(song).then(text => {
    assert.equal(text, '');
    assert.equal(song.localLyricText, '');
  });
});

test('local-library headless import reports desktop-only without throwing', () => {
  let toasted = null;
  global.showToast = msg => { toasted = msg; };
  const api = loadLocalLibrary({});
  api.importFolder();
  assert.match(toasted, /仅桌面版可用/);
  delete global.showToast;
});
