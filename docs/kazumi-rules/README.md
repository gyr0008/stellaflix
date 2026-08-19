# Stellaflix · Kazumi 规则（导入专用，非内置）

> ⚠️ **合规红线（最高优先级）**：本目录下的规则 JSON **仅供用户在产品内手动导入**，
> **绝不**写进产品默认配置、不预置任何站点。出厂 `api_site` 与 Kazumi 规则列表必须为
> 空，全部由用户自行导入——这是 GPL 分发义务 + 内容合规双约束下的唯一正确解法。
> 把规则写进默认配置会破坏合规，也违背上游 Kazumi「规则由用户贡献」的社区模式。

---

## 1. 这些规则从哪来

规则字段格式**严格对齐**上游 [Predidit/Kazumi](https://github.com/Predidit/Kazumi)（GPL-3.0），
数据模型来自其社区规则仓库 [Predidit/KazumiRules](https://github.com/Predidit/KazumiRules)。

完整规则仓库目前收录 **18 条**公开规则（7sefun / AGE / giriGiriLove / aafun / dalvdm / sorani / TvTFun …）。
**获取完整清单：** 打开 https://github.com/Predidit/KazumiRules ，点开任意 `*.json` ，
用「Raw」按钮复制全文，或在本地 `git clone` 后批量取用。

本目录已内置 3 条已校验的真实规则样例（均来自 KazumiRules，未做任何改写）：

| 文件 | 名称 | api | 来源校验 | 备注 |
|------|------|-----|----------|------|
| `7sefun.json` | 7sefun | 4 | ✅ schema 合法 | 最经典样例，结构稳定 |
| `AGE.json` | AGE | 1 | ✅ schema 合法 | |
| `giriGiriLove.json` | giriGiriLove | 6 | ✅ schema 合法 | 含 antiCrawlerConfig（验证码） |

---

## 2. 如何在 Stellaflix 内导入

1. 进入影视态（首页「心动 / 片单 / 收藏 / 历史」任一卡 → 浏览层）。
2. 顶部工具栏点 **「规则」** → 弹出「规则管理 · Kazumi」面板。
3. 粘贴单条规则 JSON 全文，点「导入」；或点「从文件导入」选本目录的 `*.json`。
4. 导入后在列表里确认规则已启用（默认启用），即可在搜索框用该规则搜片。

> 导入能力由 `public/video/kazumi/index.js` 的 `importRules` 提供，
> `public/video/kazumi-bridge.js` 的 `SFV.kazumi.importRule` 暴露给 UI。
> 规则存于 `localStorage["kazumi-rules"]`，启用态存于独立 key
> `stellaflix-video-kazumi-enabled`（不污染 Kazumi 序列化结构）。

---

## 3. 已验证事项（可验证证据）

| 验证项 | 结果 | 方式 |
|--------|------|------|
| 3 条规则 `schema` 合法（必填 XPath 字段齐全） | ✅ | `rule-schema.js` 离线校验 |
| 单条规则 JSON 可正确导入并启用 | ✅ | 修复 `importRules` 后实测 `已导入规则: 7sefun` |
| 网络可达性（本沙箱探测） | 7sefun.top 被拦截；agedm.io / girigirilove.com 返回 200 | `curl` 实测 |
| **AGE 规则真实站点解析（Electron 真机）** | ✅ | `scripts/kazumi_age_live_e2e.js`：原生 Chromium + 真实 `/api/proxy→agedm.io` |
| └ 搜索「进击的巨人」 | 12 条真实结果 | 每条带真实详情页链接 `agedm.io/detail/...` |
| └ 搜索「鬼灭之刃」 | 12 条真实结果 | 同上 |
| └ 首条详情章节解析 | 1 条播放线路「播放路线1」含 3 集 | 全集/备用/备用2 |
| └ 页面控制台报错 | 仅 3 条（THREE.WebGL 无头 GPU + Electron 内部） | **无一条来自 video/*.js / kazumi/*.js** |
| **解析器 iframe 嵌入检测（端到端）** | ✅ | `scripts/kazumi_embed_test.js` 4/0：agedm 解析器 iframe→`{embed:true}`、YouTube 普通 iframe→`false`、直链→`false`、纯文本→`null` |
| **全量回归** | ✅ 47/0 | 播放页策略 9 + Bridge 24 + online 接线 10 + 嵌入检测 4 |

---

## 5.1 播放页解析器与「第三方解析器 iframe」嵌入（关键架构事实）

**问题**：用户导入 AGE 规则 → 搜索 → 选集播放时，播放器黑屏 / `media error`。
根因经实测锁定：

- AGE 规则的 `chapterResult` 提取的是剧集入口页 `https://www.agedm.io/play/{id}/{line}/{ep}`
  的 URL。该页**静态 HTML 内**含一个 `<iframe id="iframeForVideo"
  src="https://jx.wuzhoupai.com:8443/vip/?url=age_<密文>">`——即视频经**第三方解析器**托管。
- 直接 fetch `jx.wuzhoupai.com:8443/vip/?url=age_...` 得到的是「云播放器」页：用
  `play.min.js` + **wasm** 模块在**客户端**把加密的 `var Vurl="9BFDAA21…"` 解密成真实流地址并自渲染播放器。
  **HTML 内没有任何裸 m3u8/mp4**——因此「提取直链」从根本上不可行（解密逻辑在 wasm 里）。
- X-Frame-Options 实测：
  - `agedm.io` → `SAMEORIGIN`（**不可**被我们直接 iframe）；
  - `jx.wuzhoupai.com` → **无**（本就是被 agedm.io 嵌入的，可安全嵌入）。

**解法**：放弃「提取直链」，改为**把解析器页面整页嵌入播放器 iframe**，由它自己的播放器完成解密与播放。
- `public/video/kazumi-bridge.js`：`resolvePlayUrl` 新增解析器 URL 识别（`PARSER_URL_PATTERNS`
  + `isParserUrl`），命中 iframe 时返回 `{ url, method:'iframe-src', embed:true }`；并加兜底「扫描所有 iframe」。
- `public/video/online.js`：`playEpisode` 对 `resolved.embed` 改走新 `openEmbed()`（而非 `SFV.source.open` 直链）。
- `public/video/player.js`：新增 `openEmbed(url,opts)`——在 `#sfv-overlay` 内创建 `iframe.sfv-embed`
  （隐藏原生 video/控制条，附独立关闭钮），暴露 `SFV.player.openEmbed`；`close()` 清理 iframe。
- `public/video/player.css`：`.sfv-embed` / `.sfv-embed-close` 样式。

> ⚠️ **运行构建需重建**：解析/嵌入代码日志前缀为 `[KazumiBridge]`。若控制台仍显示
> `[ExternalBridge] resolvePlayUrl()`，说明跑的是**旧构建**（本仓库源码已无 `ExternalBridge`），
> 必须 `npm start` 重启 Electron 让新代码生效，否则嵌入能力不会启用。

> 💡 **自动播放提示**：Electron 主窗口默认 `autoplayPolicy` 为 `document-user-activation-required`，
> 嵌入的解析器页若自动播放被拦截，页面内通常有播放钮，用户点一下即可。若要「零点击自动播放」，
> 可在 `desktop/main.js` 主窗口 `webPreferences` 加 `autoplayPolicy: 'no-user-gesture-required'`
> （该改动影响全局媒体自动播放策略，是否启用请按需决定）。

### 🐞 已修复的真实缺陷：`importRules` 丢弃单条规则
- **症状**：粘贴/从文件导入**单条**规则 JSON 时，解析结果为对象（无 `.length`），
  `for` 循环因 `i < undefined` 不执行，规则被**静默丢弃**，面板里看不到任何规则。
  （数组形式的多规则导入不受影响，故此前 E2E 未暴露。）
- **影响**：用户最常见的「粘贴一条规则」流程直接失效——正是「在哪里导入规则」这个诉求的核心路径。
- **修复**：`public/video/kazumi/index.js` `importRules` 在解析后统一 `if (!Array.isArray(arr)) arr=[arr];`，
  单条对象/字符串/数组/多规则数组全部正确入列。
- **回归**：`scripts/kazumi_phase2_bridge_test.js` 24/0 仍通过。

---

## 4. 真实站点解析验证（重要边界）

`scripts/kazumi_live_rule_test.js` 可在 Node 下直连真实站点跑 `search + getChapters`，
但**原生依赖浏览器 `DOMParser` / `document.evaluate`**。Node 侧用 `@xmldom/xmldom` + `xpath`
补这两个 API（装在受管 node 工作区，运行前设 `NODE_PATH`，见脚本头部注释）。

⚠️ **已知局限**：`@xmldom/xmldom` 的 HTML 解析对**前端 JS 渲染的 SPA 站点**力有不逮
（实测 AGE 页面 293 个节点全在 `<head>`，`<body>` 为空——结果由 JS 注入，静态解析拿不到）。
因此：

- 对**服务端渲染、静态 HTML 含结果**的站点，Node CLI 可验证 XPath 是否匹配；
- 对 **SPA / JS 渲染**站点，最终验证请在**产品内 Electron 运行时**完成
  （Chromium 原生 DOMParser + 真实渲染，是最忠实环境）。

**最稳妥的验证路径（推荐）**：导入规则 → 产品内搜索一个真实关键词 → 看是否返回结果、
点开是否有播放线路与剧集。这条路径走的是真实 Electron + 原生 XPath，结果即最终结论。

**真机自动验收脚本**（`scripts/kazumi_age_live_e2e.js`，已对 AGE 跑通）：
```
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe scripts/kazumi_age_live_e2e.js
```
真实 Chromium 加载 product index.html → 导入 `docs/kazumi-rules/AGE.json` → 对真实 agedm.io
（经 server.js `/api/proxy` 转发，绕开 CORS）搜索多个关键词 → 解析首条详情章节，全程原生
DOMParser + document.evaluate，是「规则 XPath 是否真匹配该站当前页面」的权威证据。

---

## 5. 字段速查（XPath 模式必填）

```
api, type, name, version, baseURL,
searchURL, searchList, searchName, searchResult,   // 搜索四件套
chapterRoads, chapterResult                          // 选集两套
```
`@keyword` 占位符在 `searchURL` 中会被替换为编码后的搜索词。
`searchMode`/`chapterMode` 非 `api` 一律回落 `xpath`。
