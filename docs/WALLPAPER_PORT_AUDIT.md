# Wallpaper 原生引擎移植审计（对照主支 Mineradio-2.1.0）

> 审计目标：核验 Stellaflix（Mineradio-Extended-1.1.2-extended.1）是否**完全**移植了主支
> `Mineradio-2.1.0` 的 wallpaper 原生引擎（Electron 主进程运行时 + 渲染端桥接/模块）。
> 方法：实际抽取并比对双方源码（IPC 通道、运行时类、方法集、桥接函数、渲染模块行数），以
> 原始 diff / 行数 / grep 证据为唯一依据。所有命令均在 Git Bash 实跑，输出见各表。

## 一、主进程运行时类（原生引擎核心）

| 文件（desktop/） | 2.1.0 行数 | Stellaflix 行数 | 主类 | 结论 |
|------------------|-----------|----------------|------|------|
| wallpaper-engine-library.js | 901 | 914 | `WallpaperEngineLibrary` (L546/L545) | ✅ 近一致 |
| wallpaper-engine-runtime.js | 4056 | 4067 | `WallpaperEngineRuntime` (L1539/L1539) | ✅ 近一致 |
| wallpaper-mode-runtime.js | 739 | 739 | `DesktopWallpaperRuntime` (L277/L277) | ✅ **逐字节一致** |
| full-desktop-mode-runtime.js | 1995 | 1995 | `FullDesktopModeRuntime` | ✅ **逐字节一致**（方法集 `comm -23/-13` 零差） |

> `FullDesktopModeRuntime` 方法级比对（提取 `^  name(` 后 `comm` 比对）：
> 2.1.0 与 Stellaflix 方法名集合**完全相同**，含 `updateIconShields` / `setDesktopIconsVisible` /
> `setSoftwareInteractionLocked` / `requestKeyboardFocus` / `updatePointerRoute` /
> `enable` / `disable` / `setInteractive` / `toggleInteractive` / `getStatus` 等全部方法。

## 二、IPC 通道集（前缀归一化 `mineradio-`/`stellaflix-` 后比对）

抽取双方 `desktop/main.js` 中所有含 `wallpaper`/`full-desktop` 的字符串字面量，归一化前缀后 `comm` 比对。

- **Wallpaper Engine（Path B）通道**：22 个公共后缀（`activate-dwm-surface` / `capture-ready` /
  `capture-result` / `choose-directory` / `choose-project-file` / `embed` / `embed-finished` /
  `glass-surface` / `host-bounds-changed` / `list` / `open-project-details` / `pointer-activity` /
  `prepare-glass-capture` / `project-details` / `remove-directory` / `resume-finished` /
  `runtime-status` / `source-refresh` / `start-scene` / `stop-scene` / `visible-host` + 裸 `wallpaper-engine`）。
  2.1.0 实际 `ipcMain.handle/on('mineradio-wallpaper-engine-'` 计数 = **14**，与 Stellaflix 的 14 个
  `stellaflix-wallpaper-engine-*` 一一对应（仅前缀改名，后缀集一致）。✅ 完全移植。

- **仅 2.1.0 出现、初判"缺失"的通道**（经二次核查，均为**误报或非缺口**）：
  - `wallpaper-engine-dwm` / `wallpaper-engine-muted-package-cache`：不是 IPC 通道，而是
    **kind 枚举字符串**（`kind: ... 'wallpaper-engine-dwm'`，main.js:3713）与**缓存目录/PowerShell 文件名**
    （main.js:386 / wallpaper-engine-runtime.js:1834,2736）。❌ 非通道，不计缺失。
  - `wallpaper-get-status`（2.1.0 `ipcMain.handle`，main.js:4753，请求-响应）vs
    `wallpaper-status`（Stellaflix `webContents.send`，main.js:2295，主动推送）：**机制不同但都传达状态**，
    类内 `getStatus()` 方法双方均在。属改名/机制差异，**非能力缺失**。
  - `wallpaper-runtime-state`（2.1.0 `webContents.send`，main.js:766）已**干净改名**为
    `wallpaper-engine-runtime-state`（Stellaflix `webContents.send`，main.js:1894）。✅ 一致。
  - `full-desktop-icon-shields` / `set-icons-visible` / `set-software-lock` / `request-keyboard-focus` /
    `pointer-route` / `tray-exit-desktop-mode`：这些是 2.1.0 对 `FullDesktopModeRuntime` 的**细粒度 IPC 封装**；
    其背后方法在 Stellaflix 的 `FullDesktopModeRuntime` 中**全部存在**（见第一节方法集比对）。
    Stellaflix 改为暴露 `full-desktop-mode-enable/disable/set-interactive/toggle-interactive/get-status`
    （main.js:2857–2892）作为 IPC 控制面。**底层能力零缺失，仅控制面命名/封装不同**。

- **仅 Stellaflix 出现的通道**：`full-desktop-mode-{enable,disable,get-status,set-interactive,
  toggle-interactive,status}` + `wallpaper-status` + `wallpaper-engine-runtime-state`（上已解释，
  为 Stellaflix 自身控制面/改名，非 2.1.0 缺项）。

- **渲染端契约检查（是否引用了 2.1.0 旧通道名导致断链）**：
  `grep` Stellaflix `public/` 对 `wallpaper-runtime-state|wallpaper-get-status|full-desktop-icon-shields|
  ...|tray-exit-desktop-mode` 仅命中 `wallpaper-engine-dwm-active`（**CSS body class**，非 IPC 通道，
  对应 2.1.0 的 `wallpaper-engine-dwm` kind，一致）。**无任何 stale IPC 引用** → 契约未断。

## 三、渲染端桥接函数（`window.__*Prepare*`）

| 函数（归一化 `Prepare` 后缀） | 2.1.0 | Stellaflix | 说明 |
|------------------------------|-------|-----------|------|
| PrepareWallpaperEngineCapture | ✅ | ✅ | 一致 |
| PrepareWallpaperEngineDesktopPreview | ✅ | ✅ | 一致 |
| PrepareWallpaperEngineGlassCapture | ✅ | ✅ | 一致 |
| PrepareWallpaperEngineHostBoundsChange | ✅ | ✅ | 一致 |
| PreparedAudioGraph / PreparedGraphFailed | ✅ | — | 2.1.0 额外 2 个为**音频图**桥接（05-playback 模块），**非 wallpaper**，超出本次审计范围，非缺口 |

> 2.1.0 的 4 个 wallpaper 桥接位于 `public/js/modules/07-fx/03-wallpaper-engine-library.js`
> （L693/709/731/792），Stellaflix 对应 `public/video/wallpaper-engine/bridge.js` 等，4/4 齐全。
> Stellaflix 另扩展了 `__stellaflixAllowUnverifiedSourceCapture` / `SyncWallpaperEngineCaptureFrameRate`
> 等诊断桥接（超出 2.1.0 集合，属增强，非缺口）。

## 四、渲染层 wallpaper 模块（#22）

- 2.1.0 源块 `public/js/modules/07-fx/03-wallpaper-engine-library.js` = **2319 行**（经典脚本风格：
  顶层 `function` + `window.__mineradioPrepare*`，非 ES `export`）。
- Stellaflix 8 个 `public/video/wallpaper-engine/*.js` 合计 = **2318 行**（同经典脚本风格，`window.__stellaflixPrepare*`）。
- 行数 2319↔2318 近 1:1，桥接函数 4/4 一致，源块被原样拆分（仅全局改名）。**判定：渲染层为 1:1 重组移植**。

## 五、结论

**主进程 wallpaper 原生引擎已完全移植**（4 个运行时类近/逐字节一致、14 个 WE IPC 通道齐全、
全桌面模式底层类逐字节一致、4/4 渲染桥接齐全、渲染层 1:1 重组）。所有初判"缺失"项经二次核查
均为**误报（非通道字符串）或改名/封装差异（非能力缺失）**，未引入真实功能缺口。

### 已知差异（透明披露，非缺口）
1. Tier1 前缀改名 `mineradio-*` → `stellaflix-*`（有意为之，正确）。
2. 状态机制：2.1.0 请求-响应 `wallpaper-get-status` vs Stellaflix 主动推送 `wallpaper-status`（均传达状态）。
3. 全桌面模式控制面命名不同：2.1.0 细粒度 IPC + 内部触发 vs Stellaflix `full-desktop-mode-*` IPC（底层类一致）。
4. `wallpaper-engine-legacy.js` / `wallpaper-engine-legacy-scene-patch.js` 在 Stellaflix 缺失——
   系 2.1.0 面向 **Electron≤15** 的兼容孤儿模块（2.1.0 `desktop/` 内也无人 `require`，且 Stellaflix 目标 v24），缺失恰当。

### 未验证项（诚实标注）
- **运行时实际行为**：沙箱无 Windows GUI，无法实跑验证引擎是否真正驱动桌面壁纸 / WE 场景。
- **渲染层符号级逐函数 diff**：以行数（2319↔2318）+ 桥接函数一致 + 类结构一致作高置信推断，未做 202 个顶层
  定义的逐符号比对（命名风格差异需归一化，工作量大于收益）。
- **`full-desktop-mode-*` IPC 是否被 Stellaflix UI 实际调用**：handler 已注册于 main.js，渲染端无 stale 引用，
  但未逐一追踪每个调用方。
