'use strict';

/**
 * Stellaflix 壁纸媒体兼容转码器。
 *
 * 移植自 Mineradio-LX-Music-1.5.7.1 的 `wallpaper-converter.js` 视频转码精华，
 * 但剔除与本应用无关的 RePKG 检视 / GIF 静态预览 / 录制转换，仅保留：
 *   - ffmpeg 可执行文件探测（resourcesPath / appDir / WinGet / PATH）
 *   - H.264 硬件/软件编码器自动优选（nvenc / qsv / amf → libx264）
 *   - `encodeMp4`：H.264 / yuv420p / `-map 0:v:0 -an`（剥离音轨，壁纸本静音）
 *   - `compatibleMediaFile`：扩展名非 .mp4 才转、sha1(路径+大小+mtime) 哈希缓存、
 *     失败静默回退原文件（保证 Electron 主路径零回归）
 *
 * 设计约束（接入 `wallpaper-engine-library.js` 的 `mediaResponse`）：
 *   - 转码输出落到 app 自有缓存目录（默认 os.tmpdir()/stellaflix-wallpaper-cache），
 *     绝不写入 wallpaper 项目目录，因此不经 `validatedRecordFile` 的 isInside 校验，
 *     无路径注入风险。
 *   - ffmpeg 缺失或转码失败时一律回退原始文件，不抛错、不影响取流。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');

// 需要兼容转码的视频输入扩展名（壁纸常见）。.mp4 已在 H.264/yuv420p 范围内，跳过。
const VIDEO_INPUT_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.m4v', '.gif', '.avi', '.wmv', '.mkv', '.flv', '.apng',
]);

function isFile(filePath) {
  try { return !!filePath && fs.statSync(filePath).isFile(); } catch (_error) { return false; }
}

function execFileAsync(executable, args, options) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

class WallpaperMediaTranscoder {
  constructor(options = {}) {
    this.appDir = path.resolve(options.appDir || __dirname);
    this.cacheDir = path.resolve(options.cacheDir || path.join(os.tmpdir(), 'stellaflix-wallpaper-cache'));
    this.resourcesPath = String(options.resourcesPath !== undefined ? options.resourcesPath : (process.resourcesPath || ''));
    this.execPath = String(options.execPath !== undefined ? options.execPath : (process.execPath || ''));
    // 允许测试注入空字符串以强制“ffmpeg 缺失”分支；不传则走真实探测。
    this.ffmpegPath = options.ffmpegPath !== undefined ? String(options.ffmpegPath) : this.findFfmpegExecutable();
    this.encoderCandidates = this.detectH264Encoders();
  }

  findFfmpegExecutable() {
    const candidates = [
      path.join(this.resourcesPath, 'ffmpeg.exe'),
      path.join(this.resourcesPath, 'bin', 'ffmpeg.exe'),
      path.join(path.dirname(this.execPath), 'ffmpeg.exe'),
      path.join(this.appDir, 'ffmpeg.exe'),
      path.join(this.appDir, 'bin', 'ffmpeg.exe'),
    ];
    const wingetRoot = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    if (wingetRoot && fs.existsSync(wingetRoot)) {
      try {
        for (const packageEntry of fs.readdirSync(wingetRoot, { withFileTypes: true })) {
          if (!packageEntry.isDirectory()) continue;
          const packageDir = path.join(wingetRoot, packageEntry.name);
          if (/^Gyan\.FFmpeg_/i.test(packageEntry.name)) {
            for (const versionEntry of fs.readdirSync(packageDir, { withFileTypes: true })) {
              if (versionEntry.isDirectory()) candidates.push(path.join(packageDir, versionEntry.name, 'bin', 'ffmpeg.exe'));
            }
          }
          if (/^ch\.LosslessCut_/i.test(packageEntry.name)) candidates.push(path.join(packageDir, 'resources', 'ffmpeg.exe'));
        }
      } catch (_error) {}
    }
    for (const candidate of candidates) if (isFile(candidate)) return candidate;
    try {
      return execFileSync('where.exe', ['ffmpeg.exe'], { encoding: 'utf8', windowsHide: true, timeout: 2500 })
        .split(/\r?\n/).map((value) => value.trim()).find(isFile) || '';
    } catch (_error) {
      return '';
    }
  }

  detectH264Encoders() {
    const out = ['libx264'];
    if (!this.ffmpegPath) return out;
    try {
      const listing = execFileSync(this.ffmpegPath, ['-hide_banner', '-encoders'], {
        encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 4 * 1024 * 1024,
      });
      if (/\bh264_nvenc\b/.test(listing)) out.unshift('h264_nvenc');
      if (/\bh264_qsv\b/.test(listing)) out.splice(Math.min(1, out.length), 0, 'h264_qsv');
      if (/\bh264_amf\b/.test(listing)) out.splice(Math.min(2, out.length), 0, 'h264_amf');
    } catch (_error) {}
    return [...new Set(out)];
  }

  capabilities() {
    return {
      ffmpeg: !!this.ffmpegPath,
      h264Encoders: this.encoderCandidates.slice(),
      outputFormat: 'MP4 / H.264 / yuv420p',
      inputFormats: [...VIDEO_INPUT_EXTENSIONS].map((value) => value.slice(1)),
    };
  }

  cachePath(sourcePath, label, extension, extra = '') {
    const stat = fs.statSync(sourcePath);
    const key = crypto.createHash('sha1')
      .update(label)
      .update(path.resolve(sourcePath))
      .update(String(stat.size))
      .update(String(stat.mtimeMs))
      .update(String(extra))
      .digest('hex');
    return path.join(this.cacheDir, key + extension);
  }

  async ensureCacheDir() {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
  }

  encoderArgs(encoder) {
    if (encoder === 'h264_nvenc') return ['-c:v', encoder, '-preset', 'p4', '-cq', '21', '-b:v', '0'];
    if (encoder === 'h264_qsv') return ['-c:v', encoder, '-preset', 'veryfast', '-global_quality', '21'];
    if (encoder === 'h264_amf') return ['-c:v', encoder, '-quality', 'speed', '-qp_i', '20', '-qp_p', '22'];
    return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19'];
  }

  async encodeMp4(inputPath, outputPath, fps) {
    if (!this.ffmpegPath) throw new Error('FFMPEG_NOT_FOUND');
    await this.ensureCacheDir();
    let lastError = null;
    for (const encoder of this.encoderCandidates) {
      try {
        try { await fs.promises.unlink(outputPath); } catch (_error) {}
        const filters = [];
        // fps>0 时钳制到 [1,120]；fps=0（壁纸默认）则保留源帧率，避免变速。
        if (Number(fps) > 0) filters.push('fps=' + Math.max(1, Math.min(120, Math.round(Number(fps)))));
        filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
        await execFileAsync(this.ffmpegPath, [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-i', inputPath,
          '-map', '0:v:0', '-an',
          '-vf', filters.join(','),
          ...this.encoderArgs(encoder),
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          outputPath,
        ], { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
        if (!isFile(outputPath) || fs.statSync(outputPath).size < 1024) throw new Error('EMPTY_MP4_OUTPUT');
        return { file: outputPath, encoder };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('MP4_ENCODE_FAILED');
  }

  /**
   * 返回对 wallpaper 引擎可直接解码的媒体文件路径。
   * - 非文件 / 非视频扩展名 → 直接返回原路径（无转码）。
   * - 所有视频文件（含 .mp4）都统一转码为 H.264/yuv420p MP4 并剥离音轨；
   *   很多 .mp4 容器仍封装 HEVC 视频或 AC-3/E-AC-3 音轨，Chromium 直解会失败。
   * - sha1 缓存命中则跳过重复转码。
   * - ffmpeg 缺失或转码失败 → 静默回退原路径（不会抛错，保证取流可用）。
   *
   * @param {string} filePath 已通过 SAFE_MIME 校验的原始媒体路径
   * @param {number} fps 目标帧率；0 表示保留源帧率（壁纸默认，避免循环变速）
   * @returns {Promise<string>}
   */
  async compatibleMediaFile(filePath, fps = 0) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    console.info('[WallpaperMediaTranscoder]', 'compatibleMediaFile', filePath, 'ext=' + ext, 'ffmpeg=' + (this.ffmpegPath || 'NOT_FOUND'));
    if (!isFile(filePath) || !VIDEO_INPUT_EXTENSIONS.has(ext)) {
      console.info('[WallpaperMediaTranscoder]', 'skip non-video or missing file', filePath);
      return filePath;
    }
    const output = this.cachePath(filePath, 'media-mp4-v2', '.mp4', fps);
    if (isFile(output)) {
      console.info('[WallpaperMediaTranscoder]', 'cache hit', output);
      return output;
    }
    if (!this.ffmpegPath) {
      console.warn('[WallpaperMediaTranscoder]', 'FFMPEG_NOT_FOUND, fallback to original', filePath);
      return filePath;
    }
    try {
      await this.encodeMp4(filePath, output, fps);
      console.info('[WallpaperMediaTranscoder]', 'transcoded', filePath, '->', output);
      return output;
    } catch (error) {
      console.warn('[WallpaperMediaTranscoder:media]', error && error.message ? error.message : error);
      return filePath;
    }
  }
}

module.exports = { WallpaperMediaTranscoder, VIDEO_INPUT_EXTENSIONS };
