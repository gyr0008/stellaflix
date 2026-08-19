// 壁纸媒体兼容转码器单测（纯 Node，无需 Electron）。
// 覆盖：cachePath 哈希确定性、编码器优选回退、encoderArgs 映射、
// compatibleMediaFile 在 ffmpeg 缺失/失败时的静默回退、encodeMp4 缺失抛错。
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const test = require('node:test');

const { WallpaperMediaTranscoder, VIDEO_INPUT_EXTENSIONS } = require('../desktop/wallpaper-media-transcoder');
// 仅验证 library.js 的 require 接线不抛错（转码器已在模块顶部被 require）。
require('../desktop/wallpaper-engine-library');

function makeTranscoder(overrides = {}) {
  // 默认 ffmpegPath 注入空串 → 强制“ffmpeg 缺失”分支，保证沙箱/CI 可复现。
  // 允许测试覆盖 ffmpegPath 以进入 encodeMp4 mock 分支。
  return new WallpaperMediaTranscoder({
    ffmpegPath: '',
    cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wmtr-')),
    ...overrides,
  });
}

test('VIDEO_INPUT_EXTENSIONS 包含常见壁纸视频格式且含 .mp4', () => {
  for (const ext of ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi', '.wmv', '.flv']) {
    assert.ok(VIDEO_INPUT_EXTENSIONS.has(ext), `应识别 ${ext}`);
  }
  assert.ok(!VIDEO_INPUT_EXTENSIONS.has('.jpg'));
});

test('detectH264Encoders 在 ffmpeg 缺失时回退 libx264', () => {
  const t = makeTranscoder();
  assert.deepEqual(t.detectH264Encoders(), ['libx264']);
});

test('encoderArgs 按编码器返回预期参数', () => {
  const t = makeTranscoder();
  assert.deepEqual(t.encoderArgs('h264_nvenc'), ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '21', '-b:v', '0']);
  assert.deepEqual(t.encoderArgs('h264_qsv'), ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '21']);
  assert.deepEqual(t.encoderArgs('h264_amf'), ['-c:v', 'h264_amf', '-quality', 'speed', '-qp_i', '20', '-qp_p', '22']);
  assert.deepEqual(t.encoderArgs('libx264'), ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19']);
  // 未知编码器回退软件编码
  assert.deepEqual(t.encoderArgs('bogus'), ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19']);
});

test('cachePath 对同一源文件确定性一致', () => {
  const t = makeTranscoder();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wmtr-src-'));
  const src = path.join(tmp, 'clip.webm');
  fs.writeFileSync(src, Buffer.alloc(1024, 1));
  const a = t.cachePath(src, 'media-mp4-v2', '.mp4', 0);
  const b = t.cachePath(src, 'media-mp4-v2', '.mp4', 0);
  assert.equal(a, b, '相同输入应产生相同缓存路径');
  assert.ok(a.endsWith('.mp4'));
  assert.ok(path.isAbsolute(a));
});

test('cachePath 随大小/fps 变化而不同', () => {
  const t = makeTranscoder();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wmtr-src2-'));
  const src = path.join(tmp, 'clip.webm');
  fs.writeFileSync(src, Buffer.alloc(1024, 1));
  const small = t.cachePath(src, 'media-mp4-v2', '.mp4', 0);
  const fps30 = t.cachePath(src, 'media-mp4-v2', '.mp4', 30);
  assert.notEqual(small, fps30, '不同 fps 额外参数应改变缓存键');
  // 改变文件大小（同时改 mtime）
  fs.writeFileSync(src, Buffer.alloc(2048, 2));
  const bigger = t.cachePath(src, 'media-mp4-v2', '.mp4', 0);
  assert.notEqual(small, bigger, '大小变化应改变缓存键');
});

test('encodeMp4 在 ffmpeg 缺失时抛 FFMPEG_NOT_FOUND', async () => {
  const t = makeTranscoder();
  await assert.rejects(
    () => t.encodeMp4(path.join(os.tmpdir(), 'nope.webm'), path.join(os.tmpdir(), 'out.mp4'), 0),
    /FFMPEG_NOT_FOUND/
  );
});

test('compatibleMediaFile 对 .mp4 也会尝试转码（缺失 ffmpeg 时回退原路径）', async () => {
  const t = makeTranscoder();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wmtr-mp4-'));
  const src = path.join(tmp, 'clip.mp4');
  fs.writeFileSync(src, Buffer.alloc(2048, 3));
  const out = await t.compatibleMediaFile(src, 0);
  // 沙箱无 ffmpeg，encodeMp4 会失败并静默回退；此断言确保回退路径对 .mp4 也生效。
  assert.equal(out, src, '缺失 ffmpeg 时 .mp4 必须回退原始文件');
});

test('compatibleMediaFile .mp4 会调用 encodeMp4（模拟转码成功）', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wmtr-mp4-mock-'));
  const src = path.join(tmp, 'clip.mp4');
  fs.writeFileSync(src, Buffer.alloc(2048, 3));
  // 给 transcoder 一个非空 ffmpegPath，确保会进入 encodeMp4 分支（实际不会执行）。
  const t = makeTranscoder({ ffmpegPath: path.join(tmp, 'fake-ffmpeg.exe') });
  let called = false;
  t.encodeMp4 = async (inputPath, outputPath) => {
    called = true;
    assert.equal(inputPath, src);
    fs.writeFileSync(outputPath, Buffer.alloc(256, 6));
  };
  const out = await t.compatibleMediaFile(src, 0);
  assert.ok(called, '.mp4 必须进入 encodeMp4 转码分支');
  assert.notEqual(out, src, '转码成功应返回缓存路径而非原文件');
  assert.ok(out.endsWith('.mp4'));
});

test('compatibleMediaFile 非视频扩展名直接返回原路径', async () => {
  const t = makeTranscoder();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wmtr-img-'));
  const src = path.join(tmp, 'poster.jpg');
  fs.writeFileSync(src, Buffer.alloc(512, 4));
  const out = await t.compatibleMediaFile(src, 0);
  assert.equal(out, src);
});

test('compatibleMediaFile 在 ffmpeg 缺失时静默回退原路径（不抛错）', async () => {
  const t = makeTranscoder();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wmtr-webm-'));
  const src = path.join(tmp, 'clip.webm');
  fs.writeFileSync(src, Buffer.alloc(4096, 5));
  const out = await t.compatibleMediaFile(src, 0);
  assert.equal(out, src, '缺失 ffmpeg 必须回退原始文件，保证取流可用');
});

test('compatibleMediaFile 对不存在的文件安全返回原路径', async () => {
  const t = makeTranscoder();
  const out = await t.compatibleMediaFile(path.join(os.tmpdir(), 'does-not-exist.webm'), 0);
  assert.equal(out, path.join(os.tmpdir(), 'does-not-exist.webm'));
});
