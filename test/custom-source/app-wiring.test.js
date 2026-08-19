const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
// 自定义音源 IPC 通道在 rename 中由 mineradio-custom-source-* 改为 stellaflix-custom-source-* (desktop/main.js);
// resolve*PlaybackData 函数与 data.thirdParty/currentPlaybackProvider 字面量在 Step 2.0 移入 legacy-music.js。
// 故相关断言: 通道名随 main 重命名; 函数/字面量改读未压缩源码 legacy-music.js。
const musicSrc = fs.readFileSync(path.join(root, 'src', 'music', 'legacy-music.js'), 'utf8');

test('desktop main and preload expose sender-checked custom source management', () => {
  assert.match(main, /CustomSourceManager/);
  assert.match(main, /CUSTOM_SOURCE_UNAUTHORIZED/);
  assert.match(main, /stellaflix-custom-source-import/);
  assert.match(main, /stellaflix-custom-source-activate/);
  assert.match(main, /setCustomSourceBridge/);
  assert.match(preload, /listCustomSources/);
  assert.match(preload, /importCustomSource/);
  assert.match(preload, /activateCustomSource/);
  assert.match(preload, /removeCustomSource/);
});

test('player presents a script manager and honors the playback source mode', () => {
  assert.match(page, /id="custom-source-btn"/);
  assert.match(page, /aria-label="第三方音源"/);
  assert.match(page, /第三方脚本可以向网络发送歌曲信息/);
  assert.match(page, /id="custom-source-mode-row"/);
  assert.match(musicSrc, /function resolveOfficialPlaybackData\(/);
  assert.match(musicSrc, /function resolveOnlinePlaybackData\(/);
  assert.match(musicSrc, /function tryCustomSourceResolve\(/);

  const resolverStart = musicSrc.indexOf('function resolveOnlinePlaybackData(');
  const resolverEnd = musicSrc.indexOf('\n}', resolverStart);
  const resolver = musicSrc.slice(resolverStart, resolverEnd + 2);
  assert.ok(resolver.indexOf('readPlaybackSourceMode') >= 0);
  // custom-first / custom-only 先走第三方解析,失败才回官方;official-first 分支保留官方优先 + officialResult 兜底上下文。
  assert.ok(resolver.indexOf('tryCustomSourceResolve') >= 0);
  assert.ok(resolver.indexOf('tryCustomSourceResolve') < resolver.indexOf('resolveOfficialPlaybackData'));
  assert.match(resolver, /officialResult/);
});

test('custom playback uses the ticket proxy directly and is visibly identified', () => {
  // 第三方票据地址与本地音乐库代理地址都绕过 /api/audio 包装,直连播放。
  assert.match(musicSrc, /\(data\.thirdParty\s*\|\|\s*data\.local\)\s*\?\s*data\.url/);
  assert.match(page, /第三方音源/);
  assert.match(musicSrc, /currentPlaybackProvider\s*=\s*['"]lx-custom-source['"]/);
});
