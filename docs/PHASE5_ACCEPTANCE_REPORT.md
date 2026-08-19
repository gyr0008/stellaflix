# Phase 5 验收报告 · 剩余任务收尾（2026-08-15）

> 范围：本对话页面剩余任务 `#4` / `#5` 与决策项 B2（GSAP 处置）的收尾与验收。
> 影视态底部控制器 bug 经用户确认**不在本对话范围**。
> `#21` / `#29-#22-8` / `#3`（真机 GUI 验证）受沙箱无 GUI 限制，**仅产出验证清单，实跑留待真机**。

## 一、`#4` Phase 4 共存编排与权限/图标分层 —— 结论：已实质完成，标记 closed

经读 `desktop/main.js` 核对，Phase 4 三项内容已在 Phase 3 与 `#23`（无托盘决策）中落地：

| 内容 | 证据（main.js） | 状态 |
|------|----------------|------|
| 共存编排（三 runtime 接线） | 第 1018 行 14 个 `stellaflix-wallpaper-engine-*` handler | ✅ |
| 权限 grant（fail-closed） | 第 1170–1332 行 capture grant / 信任链 | ✅ |
| 图标分层（桌面图标重排） | 第 1041 行 `wallpaperEngineDesktopIconLayeringQueue` | ✅ |
| Tier1 改名 | 第 1023 行 `mineradio-wallpaper-engine-* -> stellaflix-wallpaper-engine-*` | ✅ |
| 系统托盘 | `#23` 决策「保持无托盘」已 completed | ✅ |

**结论**：Phase 4 无真实剩余范围，任务关闭。

## 二、`#5` Phase 5 全量自测与验收闸 —— 结果：全绿，零产品回归

| 闸门 | 命令 / 范围 | 结果 |
|------|------------|------|
| `vm.Script` 全解析 `public/video/*` | `scripts/_verify_video_parse.js` | **69 / 0** |
| 8 组 `*-core.test.js` | `node --test "test/*-core.test.js"` | **68 / 0** |
| `test:equalizer` | `npm run test:equalizer` | **39 / 0** |
| `test:lyrics` | `npm run test:lyrics` | **12 / 0** |
| `test:custom-source` | `npm run test:custom-source` | **49 / 0** |
| 隔离后回归 `online_phase2` | `scripts/online_phase2_test.js` | **12 / 0** |
| 隔离后回归 `spacechange` | `scripts/spacechange_shelf_test.js` | **5 / 0** |
| `kazumi_phase1` | `scripts/kazumi_phase1_test.js` | **88 / 0** |
| `sprint_a` | `scripts/sprint_a_test.js` | **61 / 0** |
| `kazumi_phase2_bridge` | `scripts/kazumi_phase2_bridge_test.js` | **24 / 0** |

**合计**：全部 0 失败。确认壁纸引擎移植 + `#6` 抽纯层重构 + 隔离迁移**未引入任何产品回归**。

> 附注：`kazumi_phase2_bridge` 此前因 `#6-序2` 抽取导致 vm 装载序缺 `kazami-bridge-core.js` / `sources-core.js` 而崩溃，属测试 harness 的 blast-radius，非产品缺陷；已补装载序并验证 24/0（提交 `73a1453`，现为本环境 HEAD 祖先）。

## 三、B2 GSAP 授权处置（用户决策：替换垫片并删除）—— 结论：GreenSock 依赖已彻底移除

- **运行时事实**：`index.html:37` 仅加载 `public/vendor/gsap-waapi-shim.js`（MIT，自研 rAF 补间微引擎），**从未加载 `gsap.min.js`**；全仓无任何 `<script src>` / `require()` 引用 `gsap.min.js`。
- **文件现状**：`public/vendor/gsap.min.js` **既不在 HEAD 跟踪、也不在磁盘**（物理文件已从仓库删除）；`vendor/` 目录现有 `flv.min.js / gsap-waapi-shim.js / hls.min.js / music-tempo.* / three.r128.min.js`。
- **垫片覆盖**：`to` / `fromTo` / `set` / `killTweensOf` / `timeline` / `delayedCall`（6 基础 API / 零插件），业务 `window.gsap.*` 调用点零改动。
- **文档一致性修正**（提交 `1fb1416`）：
  - `AGENTS.md`：「发布前阻塞项」→ **已解决**；
  - `docs/P8_ACCEPTANCE_REPORT.md`：「保留并如实声明」→ **已移除**；
  - `NOTICE.md`：补充「已从仓库物理删除」。

**结论**：GPLv3 §7 冲突已消除，对外分发无法律阻塞。

## 四、仍待真机实跑（C 组，沙箱无法代劳）

| 任务 | 验证目标 | 阻塞原因 |
|------|---------|----------|
| `#21` | full-desktop 模式下壁纸正常渲染 | 需 Windows + Electron v24 图形栈 |
| `#29-#22-8` | WE 场景显示（R1–R4 清单） | 同上 |
| `#3` | 影视模块端到端 Electron 实跑 | 同上 |

**真机验证清单（R1–R4）建议步骤**：
1. `npm install` → `npm start` 启动 Electron（切勿 `git stash`/`rm`）。
2. **R1 壁纸独立窗口**：触发壁纸模式，确认独立窗口渲染、Esc 退出正常。
3. **R2 全桌面模式（Path A′）**：启用 FullDesktopModeRuntime，确认桌面图标分层、Explorer 重启无撕裂。
4. **R3 Steam Wallpaper Engine（Path B）**：导入 WE 场景，确认捕获/玻璃表面/视差指针中继、权限 grant 弹窗 fail-closed。
5. **R4 影视态端到端**：搜索 → 进入影视态 → 播放（直链/HLS 与 Kazumi 嵌入态）→ 控制器形态 → 切回音乐态，确认双态硬隔离、粒子照常、无闪烁。

### 4.1 一键 smoke 脚本（已交付，诚实分层）

> 交付物：`scripts/wallpaper_video_smoke_electron.js`（harness）+ `scripts/wallpaper_video_smoke_renderer.js`（渲染端断言）。
> 运行：`npx electron scripts/wallpaper_video_smoke_electron.js`（需先 `npm install`；切勿 `git stash`/`rm`）。
> 范式同源 `scripts/kazumi_e2e_electron.js`：强制软件渲染 + 真实 server.js 子进程 + 真实产品页注入断言。

**自动化覆盖（A+B 组，计入 exitCode）：**
- **A 组（静态契约，无需 GUI）**：读 `desktop/main.js` 文本断言 14 个 `stellaflix-wallpaper-engine-*` IPC 通道注册齐全 + R2 图标分层队列 `wallpaperEngineDesktopIconLayeringQueue` + R3 权限 grant fail-closed 链（`getWallpaperEngineCaptureGrant` / `clearWallpaperEngineCaptureGrant` / `WALLPAPER_CAPTURE_GRANT_MISSING`）。
- **B 组（无头 Electron 可跑）**：真实产品页验证 `SFV.state`/`SFV.player`/`SFV.source`/R3 渲染端桥接 `__stellaflixPrepareWallpaperEngineDesktopPreview` 存在；`setSpace('video')` 翻转 `body`+`html` 的 `video-space-active`；音乐态 `#search-area` 在影视态 `display:none`（双态硬隔离）；播放态 `video-player-active` 触发 `#bottom-bar` 可见（离线则优雅跳过，不假绿）；切回音乐态后 `video-space-active` 移除、`#search-area` 恢复、粒子 `#canvas-container <canvas>` 仍可见非零尺寸。

**人工 GUI 清单（C 组，仅打印，不计入 exitCode）：** R1 壁纸独立窗口渲染、R2 Explorer 重启无撕裂、R3 桌面合成级捕获/玻璃表面/视差指针、R4 真实影视源端到端播放——这些依赖真实 Windows 桌面 + GPU，无头沙箱无法验证，必须由人在真机执行（脚本已打印明确步骤）。

## 五、提交记录（本会话）

- `1fb1416` docs: 同步 GSAP 已移除状态，修正 AGENTS/P8/NOTICE 三处不一致
- `73a1453` test(kazumi_phase2_bridge): 补核心层装载序（#6-序2 blast-radius 修复）
- 更早：`d1db29b`（隔离 6 脚本到 legacy）、`b2cf3fa` / `4b7cde2`（online_phase2 / spacechange 加载序对齐）

> 环境提醒：远程同步层仍不稳定，`git push` 须在稳定环境执行；上述提交目前仅本地。
