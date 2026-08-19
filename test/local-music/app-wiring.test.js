'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const musicSrc = fs.readFileSync(path.join(root, 'src/music/legacy-music.js'), 'utf8');
const librarySrc = fs.readFileSync(path.join(root, 'src/music/local-library.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'public/assets/local-library.js'), 'utf8');

test('desktop main and preload expose sender-checked local music IPC', () => {
  assert.match(main, /stellaflix-local-music-choose-folder/);
  assert.match(main, /stellaflix-local-music-scan-folder/);
  assert.match(main, /stellaflix-local-music-refresh-entries/);
  assert.match(main, /stellaflix-local-file-read-range/);
  assert.match(main, /stellaflix-local-file-read-data-url/);
  assert.match(main, /LOCAL_MUSIC_UNAUTHORIZED/);
  assert.match(main, /setLocalFileAuthorizer\(localMusic\.resolveAuthorizedLocalFile\)/);
  assert.match(main, /process\.env\.STELLAFLIX_LOCAL_FILE_TOKEN = localMusic\.getLocalFileToken\(\)/);
  assert.match(preload, /chooseLocalMusicFolder/);
  assert.match(preload, /scanLocalMusicFolder/);
  assert.match(preload, /readLocalFileRange/);
});

test('renderer wiring short-circuits playback, lyrics and source tags for local songs', () => {
  assert.match(page, /id="local-library-btn"/);
  assert.match(page, /id="local-library-open-btn"/);
  assert.match(page, /\/assets\/local-library\.js/);
  assert.match(librarySrc, /window\.SFLocalLibrary\s*=/);
  assert.match(bundle, /SFLocalLibrary/);
  // 播放短路:本地歌直接用代理地址,失败提示本地文件不可用
  assert.match(musicSrc, /SFLocalLibrary\.ensureLocalSongUrl\(song\)/);
  assert.match(musicSrc, /local_file_unavailable/);
  // 直连条件包含 data.local(不经 /api/audio 二次包装)
  assert.match(musicSrc, /\(data\.thirdParty\s*\|\|\s*data\.local\)\s*\?\s*data\.url/);
  // provider 识别与歌词短路
  assert.match(musicSrc, /return 'local';/);
  assert.match(musicSrc, /SFLocalLibrary\.readLocalLyricText\(song\)/);
});

test('local library module keeps snapshot and folder keys namespaced', () => {
  assert.match(librarySrc, /stellaflix-local-library-folder-v1/);
  assert.match(librarySrc, /stellaflix-local-library-snapshot-v1/);
});
