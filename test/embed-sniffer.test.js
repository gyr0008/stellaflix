'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isMediaUrl, scoreCandidate, createSniffer } = require('../desktop/embed-sniffer.js');

// ---------- isMediaUrl ----------
test('isMediaUrl: 资源分类为 media 一律判真（含 blob 外壳包裹的真实流）', () => {
  assert.equal(isMediaUrl('https://x.com/a/blob-ish', 'media'), true);
  assert.equal(isMediaUrl('https://x.com/index.m3u8', 'subFrame'), true);
});

test('isMediaUrl: 真实媒体扩展名判真', () => {
  const cases = [
    'https://x.com/a/index.m3u8',
    'https://x.com/b/video.mp4',
    'https://x.com/c/seg.flv',
    'https://x.com/d/001.ts',
    'https://x.com/e/init.mp4?foo=bar'
  ];
  cases.forEach(u => assert.equal(isMediaUrl(u, 'xhr'), true, u));
});

test('isMediaUrl: 媒体关键字命中（playlist/segment/mpd 等）', () => {
  assert.equal(isMediaUrl('https://x.com/dash/manifest.mpd', 'xhr'), true);
  assert.equal(isMediaUrl('https://x.com/hls/playlist_720.m3u8', 'xhr'), true);
  assert.equal(isMediaUrl('https://x.com/seg/segment-001.ts', 'other'), true);
});

test('isMediaUrl: 非媒体扩展名一律判假', () => {
  const cases = [
    'https://x.com/index.html',
    'https://x.com/app.js',
    'https://x.com/style.css',
    'https://x.com/poster.png',
    'https://x.com/data.json'
  ];
  cases.forEach(u => assert.equal(isMediaUrl(u, 'other'), false, u));
});

test('isMediaUrl: 非法输入安全返回 false', () => {
  assert.equal(isMediaUrl(null), false);
  assert.equal(isMediaUrl(''), false);
  assert.equal(isMediaUrl(undefined), false);
});

// ---------- scoreCandidate ----------
test('scoreCandidate: mp4/flv 直链高分', () => {
  assert.ok(scoreCandidate({ url: 'https://x.com/a/video.mp4', resourceType: 'media' }) >= 190);
});

test('scoreCandidate: m3u8 高但未及直链 mp4', () => {
  const s = scoreCandidate({ url: 'https://x.com/a/index.m3u8', resourceType: 'xhr' });
  assert.ok(s >= 90 && s < 190, 'm3u8 score in expected band: ' + s);
});

test('scoreCandidate: ts 分片中等分', () => {
  const s = scoreCandidate({ url: 'https://x.com/a/001.ts', resourceType: 'other' });
  assert.ok(s >= 60 && s < 100, 'ts score in expected band: ' + s);
});

test('scoreCandidate: blob 源低分（需 Tier-2 preload 嗅探）', () => {
  assert.ok(scoreCandidate({ url: 'blob:https://x.com/abc', resourceType: 'media' }) < 100);
});

test('scoreCandidate: 页面/脚本/广告负分', () => {
  assert.ok(scoreCandidate({ url: 'https://x.com/index.html', resourceType: 'mainFrame' }) < 0);
  assert.ok(scoreCandidate({ url: 'https://x.com/app.js', resourceType: 'script' }) < 0);
  assert.ok(scoreCandidate({ url: 'https://ads.doubleclick.net/foo', resourceType: 'other' }) < 0);
});

// ---------- createSniffer（使用最小 fake session 驱动纯逻辑，不依赖 electron） ----------
test('createSniffer: 命中媒体 URL 回传候选 + 超时后停止', () => {
  const captured = [];
  let registered = null;
  // fake session：记录 onResponseStarted 监听；stop() 时置 null
  const fakeSession = {
    webRequest: {
      listeners: {},
      onResponseStarted(filter, cb) {
        if (cb === null) { this.listeners.onResponseStarted = null; return; }
        this.listeners.onResponseStarted = { filter, cb };
        registered = { filter, cb };
      }
    }
  };

  const sniffer = createSniffer(fakeSession);
  const handle = sniffer.start({
    onCandidate: c => captured.push(c),
    timeoutMs: 50,
    maxCandidates: 5,
    filter: { urls: ['*://*/*'] }
  });
  assert.equal(handle.started, true, '嗅探应成功启动');
  assert.ok(registered && typeof registered.cb === 'function', 'onResponseStarted 应被注册');

  // 模拟 Chromium 相继派发响应事件
  registered.cb({ url: 'https://x.com/index.html', resourceType: 'mainFrame' }); // 非媒体
  registered.cb({ url: 'https://x.com/a/video.mp4', resourceType: 'media' });    // 媒体
  registered.cb({ url: 'https://x.com/a/index.m3u8', resourceType: 'xhr' });     // 媒体

  // 跨 realm 比较用 JSON.stringify，避免 deepEqual 引用不等误判
  assert.equal(JSON.stringify(captured.map(c => c.url)),
    JSON.stringify(['https://x.com/a/video.mp4', 'https://x.com/a/index.m3u8']),
    '仅媒体候选被回传');
  assert.ok(captured[0].score >= 190, 'mp4 候选高分');

  // 超时解注册
  return new Promise(resolve => setTimeout(() => {
    assert.equal(fakeSession.webRequest.listeners.onResponseStarted, null, '超时后监听应被解注册');
    resolve();
  }, 90));
});

test('createSniffer: 缺 session/webRequest 时安全返回未启动', () => {
  const sniffer = createSniffer(null);
  const handle = sniffer.start({ onCandidate: () => {} });
  assert.equal(handle.started, false);
});

test('createSniffer: maxCandidates 触发即停止', () => {
  const captured = [];
  const fakeSession = {
    webRequest: {
      listeners: {},
      onResponseStarted(filter, cb) { if (cb === null) { this.listeners.onResponseStarted = null; return; } this.listeners.onResponseStarted = { filter, cb }; }
    }
  };
  const sniffer = createSniffer(fakeSession);
  const handle = sniffer.start({ onCandidate: c => captured.push(c), timeoutMs: 100000, maxCandidates: 2, filter: { urls: ['*://*/*'] } });
  const cb = fakeSession.webRequest.listeners.onResponseStarted.cb;
  cb({ url: 'https://x.com/1.mp4', resourceType: 'media' });
  cb({ url: 'https://x.com/2.mp4', resourceType: 'media' });
  cb({ url: 'https://x.com/3.mp4', resourceType: 'media' }); // 应被忽略
  assert.equal(captured.length, 2, '达到 maxCandidates 后不再回传');
  assert.equal(fakeSession.webRequest.listeners.onResponseStarted, null, '达到上限后监听解注册');
});
