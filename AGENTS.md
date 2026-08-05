# Mineradio Project Rules

## Project Identity

Mineradio 是 Windows Electron 桌面音乐播放器，核心体验包括搜索、播放、歌单、歌词、3D 歌单架、粒子视觉预设、DIY 视觉控制台和 GitHub 自动更新。

**当前正在进行影视模块改造**（双态同构：音乐空间 / 影视空间），详见 `docs/VIDEO_MODULE_PLAN.md`。

- **当前唯一开发主线**：`C:\Users\Administrator\Desktop\Mineradio-Extended-1.1.2-extended.1`
- 版本控制：`git`，分支 `main`，基线 tag **`v1.1.2-baseline`**（2026-07-31 建立）
- 当前源码版本：`v1.1.2`
- 授权：`GPL-3.0-or-later`（继承自上游，`package.json` / `LICENSE` / `README` 三处一致）
- 上游 GitHub 仓库（代码来源）：`https://github.com/XxHuberrr/Mineradio.git`
- 我们的 GitHub 仓库（发布 / 自动更新目标）：`https://github.com/gyr0008/stellaflix`（当前为空仓，待首次 push；`package.json` 的 `repository` / `build.publish` / `mineradio.update` 均已指向它）

> **路径变更说明（2026-07-31）**：本文档此前记载的 `E:\桌面\播放器软件\Stellaflix\...` 系列路径**已失效且不可访问**。当前主线为上方 Desktop 目录，来源是从 GitHub 下载的 v1.1.2 源码包，已用户确认为开发基石。旧的 E 盘运行版、备份区（`E:\桌面\播放器软件\工作区备份`）相关约定一并作废，如需恢复请先确认路径可达。

## Start Every New Thread Here

新对话开始处理 Mineradio 前，必须先确认当前目录是：

```powershell
C:\Users\Administrator\Desktop\Mineradio-Extended-1.1.2-extended.1
```

然后读这些文件：

- `AGENTS.md`
- `docs/PROJECT_MEMORY.md`
- 涉及影视模块时读取 `docs/VIDEO_MODULE_PLAN.md`、`docs/VIDEO_REFERENCE_ANALYSIS.md`
- 涉及玻璃 SVG 质感时读取 `docs/GLASS_SVG_TEXTURE.md`
- 涉及发布时读取 `CHANGELOG.md`、`RELEASE.md`、`package.json`

## Repository Layout

```text
Mineradio-Extended-1.1.2-extended.1/
├─ public/
│  ├─ index.html        # 主 UI、CSS、歌词、粒子、3D 歌单架、视觉控制台
│  └─ vendor/           # 本地 vendor 依赖
├─ desktop/             # Electron main/preload
├─ build/               # 打包资源和 installer 脚本
├─ docs/                # 项目记忆、设计偏好、长期约束
├─ server.js            # 本地 API、音乐源、更新检查、补丁应用
├─ dj-analyzer.js       # 节奏/音频分析
├─ package.json         # 版本号、构建命令、electron-builder 配置
└─ CHANGELOG.md         # 中文更新说明优先写在顶部
```

## Commands

```powershell
npm start
node --check server.js
npm run build:win:dir
npm run build:win
```

前端主逻辑在 `public/index.html`（31533 行单文件）。本目录是源码仓库，`npm start` 直接启动 Electron 验证效果。

注意：当前目录**不含 `node_modules`**。首次运行或打包前须先在本目录执行 `npm install`，再执行 `npm start` 或 `npm run build:win`。

改动后至少做：

```powershell
git diff --check
node --check server.js
npm run test:equalizer
npm run test:lyrics
npm run test:custom-source
```

**没有聚合的 `npm test`**，三组测试须分别执行。另注：`tests/`（复数）目录下的 `home-library-playlist.test.js` **未被任何 npm script 覆盖**，属孤儿测试，需要时用 `node --test tests/*.test.js` 手动执行。

并用实际 Electron 或浏览器检查关键交互。改动前建议确认 `git status` 干净，便于用 `git diff` 审查改动范围。

## Release Workflow

发布新版本时：

1. 更新 `package.json` 和 `package-lock.json` 版本号。
2. 更新 `CHANGELOG.md` 顶部中文说明。
3. 运行语法/空白检查。
4. 执行 `npm run build:win`。
5. **打源码 tag 并推送**（GPLv3 强制义务，见下）。
6. 上传 GitHub Release 资产：
   - `dist/Mineradio-x.y.z-Setup.exe`
   - `dist/Mineradio-x.y.z-Setup.exe.blockmap`
   - `dist/latest.yml`
   - 需要的 `Stellaflix-旧版本-x.y.z.json` 轻量补丁
7. 0.9 系列补丁跳过；1.0.x 系列可按需生成跨小版本补丁。

### GPLv3 分发义务（强制，不可省略）

本项目授权为 `GPL-3.0-or-later`。**对外分发二进制（Setup.exe）时，必须同步提供与该二进制完全对应的源码。**

- 每个 Release 必须有对应的源码 tag（如 `v1.1.3`），且 tag 内容 = 打包时的实际源码；
- Release 说明中给出源码链接；
- 若使用了第三方 GPL 代码，须在 `NOTICE.md` 中列明。

**发布前阻塞项：GSAP 授权冲突。** `public/vendor/gsap.min.js` 为 GreenSock 专有授权（非 OSI 开源，未授予 modify / sublicense，可单方撤销），与 GPLv3 第 7 条「不得对下游附加额外限制」冲突。自用无碍，**对外分发即刻成立**。当前使用面：80 处调用 / 6 个基础 API / 零插件，替换方案为 Web Animations API 垫片。详见 `NOTICE.md` 的 GSAP 授权说明与 `docs/VIDEO_MODULE_PLAN.md` 第〇章。

GitHub CLI / `gh auth` / Release 上传需要代理时，优先使用可用本机代理 `127.0.0.1:10808`；不要再走旧代理 `127.0.0.1:26001`，该端口会连接拒绝。临时命令可先清空 `HTTP_PROXY`/`HTTPS_PROXY`，再设为 `http://127.0.0.1:10808`。

## User Preferences

- 交流语言：中文。
- 用户偏好：少废话，直接做，修完验证，能发布就一起发布。
- UI 审美：精致、暗色、高级、流畅，拒绝廉价渐变、过度透明、错位、闪烁和卡顿。
- 视觉质量定义：质感、丝滑度、帧数稳定同时成立；性能优化不能牺牲既有质感。
- 玻璃质感：当前播放器 SVG 玻璃质感是黄金版本，详见 `docs/GLASS_SVG_TEXTURE.md`。
- 备份策略：不要删除旧资料。**原 E 盘备份区已不可访问**，现以 git 历史作为回退手段，重大改动前先提交或打 tag。
- 工作流：改动前 `git status` 确认干净；改完 `git diff` 自查；每完成一个可验证的单元就提交一次，便于精准回退。

## Memory Protocol

当用户说“保留”“这个做得很好”“我喜欢”“记住这个”“保存一下”“以后别忘了”或同类表达时：

1. 判断用户认可的是代码、视觉效果、交互流程、发布流程还是工作习惯。
2. 将结论追加到 `docs/PROJECT_MEMORY.md` 的对应区块。
3. 如果是玻璃 SVG、粒子预设、3D 歌单架等脆弱视觉实现，同时更新对应专项文档。
4. 记录日期、涉及文件、关键参数、不要再改坏的边界。
5. 如果本轮有代码提交，把记忆文档一起提交；如果只是记忆整理，单独提交也可以。

## Guardrails

- 不要随意重写 `public/index.html` 的大块视觉系统；先定位已有函数和状态。
- 不要动**电影级视觉预设**（音乐播放器内的 cinematic 视觉效果），除非用户明确点名。
  > 术语澄清：此处「电影视觉系统」指音乐播放器既有的一套视觉预设，**与新增的「影视模块 / 影视空间」（视频播放功能）无关**，两者不要混淆。
- 不要恢复旧的侧边栏闪烁、控制台播放暂停失效、3D 歌单架强制切回星河等问题。
- 不要把搜索结果、左侧歌单、3D 歌单架的性能优化做成一次性渲染全部内容。
- 不要把用户认可的玻璃质感改成普通毛玻璃或廉价透明面板。

### 影视模块专项守则（2026-07-31 新增）

- **`public/index.html` 只接受最小插入**：挂载点、CSS 钩子、桥接调用。**零业务逻辑**——所有影视业务代码放 `public/video/` 下的独立模块文件，单文件不超过 500 行。
- 影视态下**粒子系统保持运行**，仅在视频真正播放的那一刻让位；浏览海报墙、搜索、停留 home 时粒子照常。
- 删减一律用**隐藏 DOM**（如 EQ、镜头晃动），**禁止删除节点**，保证切回音乐态时完整无损。
- **默认配置中不得内置任何影视源站点**（`api_site` 留空），全部由用户手动导入。
- 新增 `body.video-space-active` 状态类时，须与现有 24 个 body 状态类逐一核对组合效果，重点防闪烁。
- **影视详情页（2026-08-05 落地）**：v2 暗色全屏详情页 `public/video/detail-v2.js` 已取代 Phase 1.5「即将上线」降级 toast；所有进详情路径经 `online.js renderDetail` 单一汇聚点转发 `SFV.detailV2.build`。`openDetail` 米白页保留用于搜索结果详情 + 跨源修复兜底。
