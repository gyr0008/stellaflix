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
| **GSAP 3.15.0** | **GreenSock Standard "No Charge" License（专有，非开源）** | ⚠️ 见下方「GSAP 授权说明」 |
| music-tempo | MIT | `public/vendor/music-tempo.min.js`，许可证全文见同目录 `music-tempo.LICENCE` |
| NeteaseCloudMusicApi | MIT | 本地 API 兼容层 |
| mpg123-decoder | MIT（封装代码）／内嵌 mpg123 为 LGPL-2.1 | 两者均与 GPL-3.0 兼容 |
| sql.js | MIT（SQLite 本体为 Public Domain） | 本地数据解析 |

### GSAP 授权说明

`public/vendor/gsap.min.js` 采用 GreenSock Standard "No Charge" License，条款见 https://gsap.com/standard-license 。

该协议**不是 OSI 认定的开源协议**：它未授予修改权与再授权权，附带用途限制（禁止用于与 Webflow 可视化动画能力竞争的产品），且授权方可自行终止或变更条款。因此它与本项目 GPL-3.0 的「下游获得同等自由」要求存在冲突（GPL-3.0 §7 禁止附加额外限制）。

此依赖继承自上游仓库，现状如实记录于此。已列入待办：评估以 GPL 兼容方案（Web Animations API 兼容层或 MIT 授权动画库）替换。当前使用面为 `public/index.html` 中 80 处调用、6 个基础 API（`to` / `fromTo` / `set` / `killTweensOf` / `timeline` / `delayedCall`）、零插件。

以上为工程视角的授权梳理，不构成法律意见。

## Custom Source Compatibility References

- [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop)：落雪自定义音源 API 2.0.0 协议与公开运行方式参考。
- [Mineradio-LX](https://github.com/lidonghaofirst/Mineradio-LX)：Mineradio 与落雪自定义音源的模块化适配思路参考。

上述项目均采用 GPL-3.0 授权。本仓库只实现兼容层，不附带、不推荐，也不自动下载任何真实第三方音源脚本。

## Third-party Services

Stellaflix 可能与网易云音乐、QQ 音乐等第三方音乐服务进行用户自有账号相关的本地客户端交互。

Stellaflix 不是任何音乐平台的官方客户端，也不隶属于网易云音乐、QQ 音乐或腾讯音乐娱乐集团。请用户自行遵守对应平台的服务协议、版权规则和会员权益规则。

## Original Design

Mineradio 名称、MR Logo、界面视觉设计、启动动画方向、粒子视觉体验和电影镜头系统的产品表达属于作者原创设计。

emily 作为 Mineradio 早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此致谢。

感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。
