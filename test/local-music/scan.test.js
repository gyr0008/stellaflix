'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const localMusic = require('../../desktop/local-music');
// 测试进程无主进程注入端口,显式设置后 file 记录才会生成本地 HTTP 代理 URL(否则回退 file://)。
localMusic.setLocalMusicProxyPort(3000);

function buildLibrary() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-localscan-'));
  const root = path.join(workDir, 'library');
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'b.flac'), Buffer.from([0x0b]));
  fs.writeFileSync(path.join(root, 'a.mp3'), Buffer.from([0x01, 0x02, 0x03]));
  fs.writeFileSync(path.join(root, 'a.lrc'), '[00:00.00] line');
  fs.writeFileSync(path.join(root, 'cover.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  fs.writeFileSync(path.join(root, 'ignored.exe'), Buffer.from([0x00]));
  fs.writeFileSync(path.join(root, 'sub', 'c.mp3'), Buffer.from([0x04]));
  return { workDir, root };
}

test('scan collects whitelisted audio/lyric/cover entries with proxy urls', async () => {
  const { root } = buildLibrary();
  const result = await localMusic.scanLocalMusicFolder(root);
  assert.equal(result.ok, true);
  assert.equal(result.scanMode, 'full');
  assert.equal(result.truncated, false);
  const names = result.files.map(file => file.name).sort();
  assert.deepEqual(names, ['a.lrc', 'a.mp3', 'b.flac', 'c.mp3', 'cover.jpg']);
  const mp3 = result.files.find(file => file.name === 'a.mp3');
  assert.equal(mp3.type, 'audio/mpeg');
  assert.equal(mp3.size, 3);
  assert.ok(mp3.url.indexOf('/api/local-file?token=') >= 0);
  assert.ok(mp3.webkitRelativePath.indexOf('library/') === 0);
  assert.ok(result.directories.length >= 2);
});

test('authorization only accepts files inside remembered roots', async () => {
  const { workDir, root } = buildLibrary();
  const resolvedRoot = localMusic.rememberLocalMusicRoot(root);
  assert.equal(localMusic.resolveAuthorizedLocalFile(path.join(root, 'sub', 'c.mp3')), path.join(root, 'sub', 'c.mp3'));
  assert.equal(localMusic.resolveAuthorizedLocalFile(resolvedRoot), resolvedRoot);
  assert.throws(() => localMusic.resolveAuthorizedLocalFile(path.join(workDir, 'outside.mp3')), /LOCAL_FILE_NOT_AUTHORIZED/);
  assert.throws(() => localMusic.resolveAuthorizedLocalFile(root.replace(/c\.mp3$/i, '') + '..\\..\\windows\\win.ini'), /LOCAL_FILE_NOT_AUTHORIZED/);
});

test('incremental scan reuses unchanged records and stats only new files', async () => {
  const { root } = buildLibrary();
  const first = await localMusic.scanLocalMusicFolder(root);
  const before = first.files.length;

  const second = await localMusic.scanLocalMusicFolder(root, { previousSnapshot: first });
  assert.equal(second.scanMode, 'incremental');
  assert.equal(second.files.length, before);
  assert.equal(second.reused, before);

  fs.writeFileSync(path.join(root, 'new.mp3'), Buffer.from([0x09]));
  const third = await localMusic.scanLocalMusicFolder(root, { previousSnapshot: second });
  assert.equal(third.scanMode, 'incremental');
  assert.equal(third.files.length, before + 1);
  assert.ok(third.refreshed >= 1);
});

test('refresh rehydrates snapshot entries under the authorized root', async () => {
  const { root } = buildLibrary();
  const first = await localMusic.scanLocalMusicFolder(root);
  const restored = await localMusic.refreshLocalMusicFileEntries(root, first);
  assert.equal(restored.ok, true);
  assert.equal(restored.restoredFromSnapshot, true);
  assert.deepEqual(restored.files.map(file => file.name).sort(), first.files.map(file => file.name).sort());
  for (const file of restored.files) {
    assert.ok(file.fullPath.startsWith(root + path.sep));
    assert.ok(file.url.indexOf('/api/local-file?token=') >= 0);
  }
});

test('authorized range reads return chunked base64 and data-url readers guard images', async () => {
  const { root } = buildLibrary();
  await localMusic.scanLocalMusicFolder(root);
  const mp3 = path.join(root, 'a.mp3');
  const range = await localMusic.readAuthorizedLocalFileRange(mp3, 0, 2);
  assert.equal(range.ok, true);
  assert.equal(range.byteLength, 2);
  assert.equal(Buffer.from(range.base64Chunks.join(''), 'base64').equals(Buffer.from([0x01, 0x02])), true);
  await assert.rejects(() => localMusic.readAuthorizedLocalFileDataUrl(mp3), /LOCAL_FILE_NOT_IMAGE/);
  const image = await localMusic.readAuthorizedLocalFileDataUrl(path.join(root, 'cover.jpg'));
  assert.equal(image.ok, true);
  assert.ok(image.dataUrl.startsWith('data:image/jpeg;base64,'));
});
