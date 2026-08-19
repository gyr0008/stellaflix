const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const desktopHtml = fs.readFileSync(path.join(root, 'public', 'desktop-lyrics.html'), 'utf8');
const defaultArchive = JSON.parse(fs.readFileSync(path.join(root, 'public', 'default-user-fx-archive.json'), 'utf8'));
// Step 2.0 将歌词下一行配置/3D 网格状态与函数从 index.html 抽到音乐源码;
// Step 2.5b 进一步将 fx 视觉模块(含 fxDefaults 中的 lyricNextLine:true 默认字面量)拆到
// 08-fx-visual.js。故这些断言扫描 src/music 下全部经典脚本的合并文本, 不再假定单文件。
// script 标签/DOM id/desktop-lyrics.html 断言不变。
const musicSrc = fs.readdirSync(path.join(root, 'src', 'music'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(root, 'src', 'music', f), 'utf8'))
  .join('\n');

test('loads the shared lyric timeline before the player script', () => {
  assert.match(indexHtml, /<script src="lyric-timeline\.js"><\/script>/);
  assert.ok(
    indexHtml.indexOf('<script src="lyric-timeline.js"></script>') < indexHtml.indexOf('<style>'),
    'lyric timeline must be available before the inline player script',
  );
});

test('persists a default-on next lyric preference', () => {
  assert.match(musicSrc, /lyricNextLine:\s*true/);
  assert.match(musicSrc, /lyricNextLine:\s*raw\.lyricNextLine\s*!==\s*false/);
  assert.match(musicSrc, /lyricNextLine:\s*fx\.lyricNextLine\s*!==\s*false/);
  assert.match(indexHtml, /id="t-lyricNextLine"/);
  assert.match(indexHtml, /toggleFx\('lyricNextLine'\)/);
  assert.equal(defaultArchive.snapshot.lyricNextLine, true);
});

test('wires a lightweight next lyric mesh into the 3D stage', () => {
  assert.match(musicSrc, /next:\s*null/);
  assert.match(musicSrc, /nextIdx:\s*-1/);
  assert.match(musicSrc, /nextText:\s*''/);
  assert.match(musicSrc, /function buildNextLyricMesh\(/);
  assert.match(musicSrc, /function showStageNextLine\(/);
  assert.match(musicSrc, /function clearStageNextLyric\(/);
  assert.match(musicSrc, /function selectCurrentLyricWindow\(/);
  assert.match(musicSrc, /MineradioLyricTimeline\.selectLyricWindow/);
});

test('sends and renders nextText in desktop lyrics', () => {
  assert.match(musicSrc, /nextText:\s*fx\.lyricNextLine/);
  assert.match(desktopHtml, /id="nextLine"/);
  assert.match(desktopHtml, /class="next-line"/);
  assert.match(desktopHtml, /nextText:\s*''/);
  assert.match(desktopHtml, /function fitNextLyricText\(/);
  assert.match(desktopHtml, /nextLine\.textContent\s*=\s*nextText/);
});
