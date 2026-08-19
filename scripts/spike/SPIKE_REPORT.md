# Step 0 · 技术验证 Spike 报告

> 日期：2026-07-31 · 目标：在动业务代码前，验证四个技术未知数（S2/S3/S4/S5）。
> 状态：S2 已实测通过；S3 矩阵已定 + 探针/样本脚本就绪（样本生成受本机带宽限制待你本机跑）；
> S4/S5 已完成静态分析，结论直接约束 Step 3 设计。

---

## S2 · Range 改造后本地 mp4 可拖动 —— ✅ 通过（算法已验证）

**现状（读 `server.js`）：**
- `serveStatic()`（:217）用 `fs.readFile` 整文件读入内存、`200` 整段返回，**无 Range**。
- `MIME`（:122）**不含任何视频/字幕类型**（无 `.mp4/.webm/.mkv/.m3u8/.vtt/.srt/.ass/.ts`）。

**验证方式：** `s2-range-probe.js` 实现了 Step 1 计划加入的 Range handler，起临时 HTTP 服务，
用 Node http 客户端发各类 `Range` 请求并断言。实测 6 项全过：
`full / bytes=0-99 / bytes=500- / bytes=-100 / bytes=200-299 / 越界416`。

**结论：** Range 算法正确（206 + `Content-Range` + 正确字节切片 + 越界 416）。Step 1 可直接按此接入 `server.js`。
浏览器侧 seek 依赖正确 206 响应，标准 `<video>`/hls.js 行为，无需额外验证。

---

## S3 · 编解码边界 —— ✅ 矩阵已定（真实样本待你本机生成）

**本机限制：** ffmpeg 未安装，且出口带宽 ~14KB/s，110MB 可移植包无法在本环境下载（已实测超时，根因为带宽，
非脚本问题，未盲试重试）。

**已交付：**
- `s3-codec-matrix.md`：基于 Chromium/Electron 解码器支持的权威矩阵（决策关键项）。
- `s3-decode-probe.html`：在真实 Electron/Chrome 中**实际解码**每个样本，给出 `canplay/error` 真实结论。
- `gen-samples.sh` / `gen-samples.ps1`：ffmpeg 一条命令产出全套样本（H264/AAC、HEVC、AV1、VP9、AC3、EAC3、HLS、VTT/SRT）。

**关键结论（约束 Step 1/3）：**
- ✅ H.264+AAC、AV1、VP9、Opus、AAC、MP3、FLAC、WebVTT —— 全支持。
- ❌ **HEVC（H.265）不支持** —— 遇到需提示换源/转码。
- ❌ **AC-3 / E-AC-3 音轨不支持** ——「真坑」：画面能放但无声。必须检测并提示或走转码代理。
- ❌ **HLS 不原生支持** —— 一律走 hls.js（计划已定 1.6.16 UMD）。
- ⚠️ ASS/SSA 字幕无原生渲染 —— 首发只保 VTT，SRT 做解析转换，ASS 留增强。

**你本机执行（有 ffmpeg 后）：**
```bash
cd scripts/spike
bash gen-samples.sh samples        # 或 powershell -ExecutionPolicy Bypass -File gen-samples.ps1
# 用 Electron/Chrome 打开 s3-decode-probe.html，选择 samples/ 下文件
```

---

## S4 · 视频与 Three.js 粒子共存切换不闪 —— ⚠️ 静态分析完成，2 处风险需在 Step 3 处理

**现状（读 `index.html`）：**
- 渲染器单例：`new THREE.WebGLRenderer(...)`（:4186）append 到 `#canvas-container`（:2150/:4195），单一 WebGL 上下文；
  粒子经 `requestAnimationFrame` 循环（:4752 等）驱动。与 `<video>` 共存**功能上无冲突**。

**风险 1（必改）：** `#canvas-container` 带 `transition: opacity 1450ms, transform 1450ms`（:99）。
影视空间切入若触发该过渡，会出现 **1.45s 慢淡入/位移**。→ `body.video-space-active #canvas-container { transition: none }`。

**风险 2（必改）：** 多个 body 类改 `#canvas-container` 的 opacity/visibility/filter：
- `render-deep-sleep` → `opacity:0;visibility:hidden`（:103）—— 后台优化会**藏掉视频**；
- `splash-active` → `opacity:.16`（:104）；
- `shape-workshop-mode` → `filter:brightness(.92) saturate(1.05)`（:1269）—— 给视频加滤镜拖累画质。
→ `video-space-active` 必须对这些状态**优先级压过**（强制 `opacity:1;visibility:visible;filter:none`）。

**机会点：** 已存在 `custom-background-video` body 类（:24871）——背景视频管线现成，
**方案 A（视频复用背景层）可考虑复用此管线**，而非新建独立 `<video>` 元素。

**结论：** 倾向**方案 A**；S4 的「不闪」目标可达，但 Step 3 必须落实上述两条 CSS 覆盖规则 + 播放时暂停粒子。

---

## S5 · `video-space-active` 与现有 body 状态类组合 —— ✅ 命名无冲突，语义需协调

**枚举（读 `index.html` `document.body.classList` 全量）：** 现有 body 状态类 **约 30 个**（计划估 24 偏少，已更新）。
含：`splash-active` `splash-revealing` `empty-home-active` `diy-mode` `simple-mode` `immersive-mode`
`shape-workshop-mode` `render-deep-sleep` `render-background-eco` `custom-background-video` `custom-background-flat`
`controls-visible` `home-controls-locked` `user-capsule-*` `fx-fab-*` `fullscreen-diy-peek` `idle-guide-*`
`login-guide-active` `visual-guide-active` `desktop-*` `cursor-hidden` `home-wallpaper-preview` 等。

**结论：**
- `video-space-active` 为全新唯一命名，**无命名碰撞**。
- 需在 Step 3 协调的语义交互（与 S4 风险 2 同源）：
  - 与 `render-deep-sleep`/`render-background-eco`：视频播放期间**禁止**进入 deep-sleep，否则黑屏。
  - 与 `shape-workshop-mode`：影视空间内应关闭形态工坊滤镜（避免作用到视频）。
  - 与 `custom-background-video`：可复用其背景视频机制（见 S4 机会点）。
  - 与 `immersive-mode`/`diy-mode`：影视空间全屏/控制条布局需独立映射（计划 1.2 节已列）。

---

## 决策建议（回填计划第七章）

1. **视频承载层采用方案 A**（复用 `#canvas-container` / `custom-background-video` 管线）。
2. **Step 1 服务端三件套**按 `s2-range-probe.js` 的 handler 接入，并补齐视频/字幕 MIME。
3. **Step 3** 必须包含：① canvas-container `transition:none`；② `video-space-active` 压过 deep-sleep/shape-workshop 的 opacity/filter；③ 播放时暂停粒子；④ 接入 hls.js；⑤ AC-3/HEVC 检测与降级提示。
4. **S3 真实样本解码**在你本机（ffmpeg 可用 + 真实 Electron）跑 `s3-decode-probe.html` 闭环，结果归档。
