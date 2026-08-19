# NOTICE

Stellaflix 使用了以下第三方项目或服务。各项目版权归其原作者所有。

## Fork Notice

Stellaflix 是基于 `XxHuberrr/Mineradio` 的非官方二创 Fork。

原版 Mineradio 的作者、项目来源、界面视觉设计、名称与相关原创表达必须保留署名。本仓库新增的扩展能力、文档和后续二创改动由本仓库维护者继续记录和维护。

本仓库不是 Mineradio 官方版本，也不代表原作者发布。请优先参考原项目了解官方版本：

https://github.com/XxHuberrr/Mineradio

## License

Stellaflix 整体采用 **GPL-3.0-or-later** 授权，与上游 `XxHuberrr/Mineradio` 保持一致。完整条款见仓库根目录 `LICENSE`。

## Third-party Libraries

| 组件 | 授权 | 说明 |
| --- | --- | --- |
| Electron | MIT | 运行时框架（devDependency，随打包分发） |
| Three.js r128 | MIT | `public/vendor/three.r128.min.js` |
| ~~GSAP 3.15.0~~ → **自研 gsap-waapi-shim（MIT）** | GreenSock 专有许可已移除；垫片为项目自研 GPL-3.0 兼容微引擎 | 见下方「GSAP 授权说明」（gsap.min.js 不再分发） |
| music-tempo | MIT | `public/vendor/music-tempo.min.js`，许可证全文见同目录 `music-tempo.LICENCE` |
| NeteaseCloudMusicApi | MIT | 本地 API 兼容层 |
| mpg123-decoder | MIT（封装代码）／内嵌 mpg123 为 LGPL-2.1 | 两者均与 GPL-3.0 兼容 |
| sql.js | MIT（SQLite 本体为 Public Domain） | 本地数据解析 |
| Anime4K v4.0.1 GLSL（bloc97） | MIT | 影视「画质增强」实时超分滤镜链，`public/vendor/sr/glsl/Anime4K_*.glsl`（7 个文件，文件头保留原授权声明），上游 https://github.com/bloc97/Anime4K |
| Anime4K AutoDownscalePre x2/x4 | Unlicense（公共领域） | `public/vendor/sr/glsl/Anime4K_AutoDownscalePre_x2.glsl` / `_x4.glsl`，文件头保留原声明 |
| FSRCNNX x2 8-0-4-1（igv） | LGPL-3.0-or-later | 影视「画质增强」通用档亮度超分链，`public/vendor/sr/glsl/FSRCNNX_x2_8-0-4-1.glsl`，上游 https://github.com/igv/FSRCNN-TensorFlow 。以独立文件原样分发、未修改，与 GPL-3.0 兼容（LGPL-3.0 §4 组合作品方式） |

### GSAP 授权说明

`public/vendor/gsap.min.js` 采用 GreenSock Standard "No Charge" License，条款见 https://gsap.com/standard-license 。

该协议**不是 OSI 认定的开源协议**：它未授予修改权与再授权权，附带用途限制（禁止用于与 Webflow 可视化动画能力竞争的产品），且授权方可自行终止或变更条款。因此它与本项目 GPL-3.0 的「下游获得同等自由」要求存在冲突（GPL-3.0 §7 禁止附加额外限制）。

本仓库**已移除** GreenSock 的运行时依赖以解除 GPL-3.0 §7 冲突：
- `public/vendor/gsap.min.js` 已**从仓库物理删除**（不再被 `index.html` 加载，也不随分发打包）；
- 改用项目自研的 **`public/vendor/gsap-waapi-shim.js`**（MIT，GPL-3.0 兼容）作为 `window.gsap` 的兼容实现。该垫片是一个 **GSAP 风格的 rAF 补间微引擎**：对 DOM 元素逐帧写 inline style（与 GSAP CSSPlugin 行为一致），对普通 JS 对象（如 Three.js 的 `position` / `scale`、`group.userData`）补间数值属性，对 DOM 与对象统一处理；缓动用真实数学公式（power / expo / sine / back / elastic），高保真还原原动画手感；在无 `requestAnimationFrame` / `document` 的 node 环境中自动降级为直接套用终态，保证测试可断言、不崩。
- 业务代码（`public/assets/music.js` 构建自 `src/music/legacy-music.js`、`public/video/cover-flow.js`）的 `window.gsap.*` 调用点**一行未改**，仅替换底层引擎。覆盖的 API 仍为 6 个基础 API（`to` / `fromTo` / `set` / `killTweensOf` / `timeline` / `delayedCall`）、零插件。
- 已知边界：缓动为数学公式实现，`elastic.out` 等按 GSAP 语义保真还原；`back.out` 过冲、颜色 / 阴影插值均按 GSAP 语义实现。逐帧动画手感须在 Electron（Chromium）实跑比对，沙箱无 GUI 无法代为验证。

GreenSock 原授权说明（历史记录，仅作溯源）：`gsap.min.js` 曾采用 GreenSock Standard "No Charge" License，条款见 https://gsap.com/standard-license ，该协议**不是 OSI 认定的开源协议**。该依赖为上游遗留，现已移除。

以上为工程视角的授权梳理，不构成法律意见。

## Custom Source Compatibility References

- [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop)：落雪自定义音源 API 2.0.0 协议与公开运行方式参考。
- [Mineradio-LX](https://github.com/lidonghaofirst/Mineradio-LX)：Mineradio 与落雪自定义音源的模块化适配思路参考。

上述项目均采用 GPL-3.0 授权。

## Bundled Custom Sources（内置第三方音源）

自 2026-08 起，本仓库随应用附带少量第三方洛雪格式音源脚本（`desktop/custom-source/bundled/`），并在用户设备上提供"跟随上游仓库更新"能力（manifest 声明仓库坐标，多线路拉取 + 头部校验 + 名称一致性校验 + 原子落盘，详见 `desktop/custom-source/bundled-updater.js`）。内置脚本默认不启用，需用户在第三方音源面板手动导入并启用。

- [kejichangqing/QingMusic](https://github.com/kejichangqing/QingMusic)（Apache-2.0，`qing_haitang_resolve.js`，作者 kejichangqing）：基于 QingMusic 客户端后端适配，无上游自动更新（仓库不含可独立运行的洛雪格式脚本），由本项目手动维护内置副本并向用户默认提供。

## Third-party Services

Stellaflix 可能与网易云音乐、QQ 音乐等第三方音乐服务进行用户自有账号相关的本地客户端交互。

Stellaflix 不是任何音乐平台的官方客户端，也不隶属于网易云音乐、QQ 音乐或腾讯音乐娱乐集团。请用户自行遵守对应平台的服务协议、版权规则和会员权益规则。

## Original Design

Mineradio 名称、MR Logo、界面视觉设计、启动动画方向、粒子视觉体验和电影镜头系统的产品表达属于作者原创设计。

emily 作为 Mineradio 早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此致谢。

感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。
