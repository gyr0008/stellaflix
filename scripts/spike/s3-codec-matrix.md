# S3 · 编解码支持矩阵（Electron 42 / Chromium ~14x）

> 来源：Chromium 解码器支持事实（Chrome/Electron 内置 ffmpeg，含专有解码器）。
> 本项目 Electron `^42.4.1`，对应 Chromium 大版本约 14x，下列结论对该区间稳定成立。
> 真实解码以 `s3-decode-probe.html` 在目标运行环境实测为准（样本见 `gen-samples`）。

## 视频编码

| 编码 | 容器 | 浏览器/Electron 支持 | 结论 |
|---|---|---|---|
| H.264 / AVC | mp4 / mkv / ts | ✅ 支持（Electron 内置专有解码） | **主力**，最大兼容 |
| H.265 / HEVC | mp4 / mkv | ❌ 不支持（Electron 打包的 Chromium 无 HEVC 解码器） | **真坑 1**：遇到即需提示「当前播放器无法解码 HEVC，换源或转码」 |
| AV1 | mkv / mp4 | ✅ 支持（软/硬解） | 可用，优先于 HEVC |
| VP9 | webm / mkv | ✅ 支持 | 可用 |
| VP8 | webm | ✅ 支持 | 可用（老） |
| AV1 / H.264 的 Anamorphic / 10bit | — | ⚠️ 视硬件 | 不在首发范围 |

## 音频编码

| 编码 | 容器 | 支持 | 结论 |
|---|---|---|---|
| AAC-LC | mp4 / mka | ✅ | **主力音轨** |
| MP3 | mp3 / mp4 | ✅ | 可用 |
| Opus | webm / mkv / ogg | ✅ | 可用 |
| FLAC | mka / mp4 | ✅ | 可用 |
| **AC-3 (Dolby Digital)** | mp4 / mka | ❌ `<video>`/`<audio>` 网页播放不支持 | **真坑 2（最坑）**：大量影视资源音轨是 AC-3，画面能放但无声 |
| **E-AC-3 (DD+)** | mp4 / mka | ❌ 不支持 | 同上 |
| TrueHD / DTS | mka | ❌ 不支持 | 不在范围 |

## 流格式 / 字幕

| 项目 | 支持 | 结论 |
|---|---|---|
| HLS (.m3u8 + .ts) | ❌ Chromium 不原生支持（仅 Safari） | **必须引入 hls.js**（计划已定 1.6.16 UMD） |
| MPEG-DASH (.mpd) | ✅ 原生 | 可选 |
| 渐进式 MP4 | ✅ | 本地文件主力 |
| WebVTT (.vtt) | ✅ 原生 `<track>` | **首选字幕格式** |
| SRT (.srt) | ⚠️ 需自行解析 | 解析为 cue 后注入，或转 VTT |
| ASS / SSA (.ass) | ❌ 无原生渲染 | 需 libass-wasm / jassub 等 JS 渲染器（后续增强，非首发） |

## 对影视模块设计的约束（写入 Step 1 / Step 3）

1. **源选择优先级**：H.264+AAC > AV1+AAC/Opus > HEVC（直接提示不支持）。
2. **AC-3 / E-AC-3 音轨**：检测 mime/编码后，若无兼容音轨，必须向用户给出明确提示，
   或走服务端转码代理把 AC-3 重封装/转 AAC（Step 1 proxy 预留此能力，但首发可仅提示）。
3. **HLS 一律走 hls.js**；渐进式 MP4 走原生 `<video>` + Range（见 S2）。
4. **字幕首发只保证 VTT**；SRT 做解析转换；ASS 留待增强。
5. 以上边界必须在「源健康检查 / 播放错误降级」中体现（发布级验收 0.2 节要求）。
