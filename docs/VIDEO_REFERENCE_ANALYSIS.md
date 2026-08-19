# 影视模块参考项目深度分析与移植方案

> 制定日期：2026-07-31
> 配套文档：`docs/VIDEO_MODULE_PLAN.md`（执行计划）
> 分析对象：KVideo、Kazumi、MoonTV(Stardm0)、LunaTV(MoonTechLab)、hls.js
> 结论定位：本文决定「抄什么、从哪抄、能不能抄」，执行计划决定「什么时候抄」

---

## 零、最重要的三条结论

1. **授权协议是硬边界。** ~~四个影视项目里只有两个是 MIT，代码可直接复制；另外两个（GPL-3.0 / CC BY-NC-SA）只能借鉴设计思想，不能复制代码。~~
   **【2026-07-31 更正】本条原判断有误，见第 1.2 节。** 本项目自身是 **GPL-3.0**（`LICENSE` 为 GPLv3 全文，`README.md:132` 明示，且作为 `XxHuberrr/Mineradio` 的 Fork 属强制继承）。因此正确边界是：**MIT / Apache-2.0 / GPL-3.0 三类均可并入，唯 LunaTV 的 CC BY-NC-SA 仍禁用**。
2. **不需要写规则引擎就能跑通。** 三个项目（KVideo / MoonTV / LunaTV）走的都是「苹果 CMS V10 标准 JSON 接口」，不解析 HTML、不写选择器、不 eval。这条路径一天能跑通，是主路径。Kazumi 的规则引擎是**兜底路径**，等主路径稳定后再做。
3. **原计划的「在线源放最后」判断需要修正。** 原以为在线源最复杂，实测恰恰相反——CMS10 是标准协议，**比本地文件的元数据刮削还简单**。真正的复杂度在防盗链代理层，而这一层三种源形态都要用。

---

## 一、四个项目的定位与授权

| 项目 | 技术栈 | 播放内核 | Star | 授权 | 代码可复制 |
|---|---|---|---|---|---|
| **KVideo**<br>KuekHaoYang | Next.js 16 + React 19 + TS | hls.js 1.6 + `<video>` | 3.9k（fork 6.7k） | **MIT** | ✅ 可 |
| **Kazumi**<br>Predidit | Flutter / Dart | media_kit（libmpv） | 28.2k | **GPL-3.0** | ✅ 可（协议兼容）<br>但**无 JS 代码可搬** |
| **MoonTV**<br>Stardm0 | Next.js 14 + TS | ArtPlayer + hls.js | 909（fork 1.6k） | **MIT** | ✅ 可 |
| **LunaTV**<br>MoonTechLab | Next.js 14 + TS | ArtPlayer 5.2.5 + hls.js 1.6.10 | 9.2k | **CC BY-NC-SA**<br>（README 写 MIT，冲突） | ❌ 禁 |

### 1.1 血缘关系（已核实）

```
LibreTV（灵感来源）
   └─ senshinya/MoonTV  ← 原始项目，已被作者清空，仅留指路 README
        └─ MoonTechLab/LunaTV  ← 改名继任，同一作者，当前主线，v100.1.3
             └─ Stardm0/MoonTV  ← 从 LunaTV 2.0.1 断开血缘的独立复制仓库
```

**关键点**：Stardm0/MoonTV 保留了上游早期的 **MIT** 协议，而上游 LunaTV 后来改成了 CC BY-NC-SA。两者的**核心源适配代码几乎一致**。因此：

> **需要复制 CMS10 适配代码时，从 Stardm0/MoonTV（MIT）复制，不要从 LunaTV（CC BY-NC-SA）复制。** 这不是钻空子——Stardm0 分叉时上游确为 MIT，其分发合法。

KVideo（MIT）同样安全，且代码质量更高，优先从它复制。

### 1.2 本项目自身授权状态（2026-07-31 核实，修正 1.1 节之前的错误前提）

| 项目 | 值 | 依据 |
|---|---|---|
| 本项目授权 | **GPL-3.0** | `LICENSE` = GPLv3 完整正文；`README.md:132`「本项目采用 GPL-3.0 授权」；Copyright (C) 2026 XxHuberrr |
| 是否可选 | **否，强制继承** | 本仓库是 `XxHuberrr/Mineradio`（GPL-3.0）的 Fork，衍生作品必须同协议分发 |
| `package.json` | ⚠️ **缺 `license` 字段**，且 `"private": true` | 与 LICENSE / README 声明不一致，建议补 `"license": "GPL-3.0-or-later"` |

#### 由此得到的正确入站兼容矩阵

| 来源 | 授权 | 并入本项目 | 义务 |
|---|---|---|---|
| KVideo | MIT | ✅ | 保留版权声明，列入 `NOTICE.md`；成品整体仍按 GPL-3.0 分发 |
| Stardm0/MoonTV | MIT | ✅ | 同上 |
| hls.js | Apache-2.0 | ✅ 单向兼容 GPLv3 | 保留 `NOTICE`/声明；**注意 Apache-2.0 与 GPLv2 不兼容，与 v3 兼容** |
| **Kazumi** | **GPL-3.0** | **✅ 协议兼容** | 保留原版权与协议声明、标注修改及日期（GPLv3 §5a） |
| LunaTV | CC BY-NC-SA | ❌ **仍禁用** | NC（非商业）条款属非自由条款，与 GPL 不兼容；且 CC 系列本非软件协议 |

#### Kazumi 的三个实务限制（协议兼容 ≠ 可直接移植）

1. **无可搬运的代码实体。** Kazumi 是 Flutter / Dart，本项目是 Electron + 原生 JS。跨语言重写在著作权上仍构成演绎作品（须履行 GPL 义务），但**不产生任何工程上的省力效果**——本文第四、五章提取的仍然是「不受版权保护的架构与字段设计」，结论不变。
2. **美术与字体资产被明确排除在自由授权之外。** Kazumi README 声明：图标来自 Pixiv 作者 Yuquanaaa，「未经原作者明确授权, 任何人不得擅自使用、复制、修改或分发」；内嵌字体为小米 Mi Sans。**这两类资产禁止复制**，GPL 只覆盖代码。
3. **GPL-3.0-only / -or-later 变体未查证。** Kazumi README 仅写「GPL-3.0」，未展示 LICENSE 正文变体。实务上二者与本项目均可组合，仅影响组合体的最终表述，不构成阻塞。真要落地复制代码前建议实读其 `LICENSE` 首尾。

#### ⚠️ 一个既有的授权冲突（与影视模块无关，但更要紧）

`public/vendor/gsap.min.js` 头部声明：

```
GSAP 3.15.0 — @license Copyright 2026, GreenSock. All rights reserved.
Subject to the terms at https://gsap.com/standard-license.
```

**GreenSock Standard License 是专有协议（All rights reserved），并非 OSI 开源协议。** 将其随成品一起分发，与本项目 GPL-3.0 的「整体须按 GPL 授权」要求（GPLv3 §5）存在冲突风险。此问题**继承自上游、早于影视模块**，但既然已开始梳理授权边界，建议一并处理：

- 选项 A：改用 GPL 兼容的动画库（如 anime.js / MIT，或原生 Web Animations API）；
- 选项 B：向 GreenSock 申请 GPL 例外授权；
- 选项 C：评估是否可论证为「聚合」而非「组合作品」——**此路径论证较弱，不推荐**。

> 本节为工程视角的协议梳理，不构成法律意见。涉及正式分发前建议由具备资质的人员复核。

---

## 二、两条源架构路线（本次分析的核心发现）

### 2.1 路线 A：苹果 CMS V10 标准 API（主路径）

三个 Next.js 项目共用的方案。本质是：**中文影视采集站生态存在一个事实标准接口**，不需要爬 HTML。

**协议常量**（`src/lib/config.ts`）：

| 用途 | 路径 |
|---|---|
| 搜索 | `{api}?ac=videolist&wd={关键词}` |
| 分页搜索 | `{api}?ac=videolist&wd={关键词}&pg={页码}` |
| 详情 | `{api}?ac=videolist&ids={id}` |

**源配置结构**（LunaTV `ConfigFileStruct`）：

```json
{
  "cache_time": 7200,
  "api_site": {
    "dyttzy": {
      "api": "http://example.com/api.php/provide/vod",
      "name": "示例源",
      "detail": "http://example.com"
    }
  },
  "custom_category": [{ "name": "华语", "type": "movie", "query": "华语" }]
}
```

KVideo 的版本更完整，多了分流与优先级：

```ts
interface VideoSource {
  id: string; name: string; baseUrl: string;
  searchPath: string; detailPath: string;
  headers?: Record<string, string>;
  enabled?: boolean; priority?: number;
  group?: 'normal' | 'premium';
}
interface SourceSubscription {
  id: string; name: string; url: string;
  lastUpdated: number; autoRefresh: boolean;
}
```

**响应结构固定**：

```ts
ApiSearchResponse { code, page, pagecount, limit, total, list: VideoItem[] }
ApiDetailResponse { code, list: [{ vod_id, vod_name, vod_pic, vod_play_from, vod_play_url, ... }] }
```

**`vod_play_url` 的三级分隔解析（必须掌握的一个细节）**：

```
播放组之间  →  $$$
组内集之间  →  #
集内标题与链接  →  $

实例：
"第1集$http://a/1.m3u8#第2集$http://a/2.m3u8$$$第1集$http://b/1.m3u8"
      └────── 线路 1（2 集） ──────┘     └── 线路 2（1 集） ──┘
```

LunaTV 的处理策略：拆完后**只保留 `.m3u8` 结尾的链接**，取集数最多的那一组；若无 `vod_play_url`，回退用正则 `/(https?:\/\/[^"'\s]+?\.m3u8)/g` 从 `vod_content` 里扒。这个兜底值得照抄。

**聚合搜索的并发控制**（LunaTV，可直接移植到 `server.js`）：

- 全站并发 `map` + `Promise.allSettled`，单站失败返回 `[]` 不拖垮整体
- 单站总超时 20s（`Promise.race`），单页 fetch 8s（`AbortController`）
- 最大页数上限（默认 5）
- 内存缓存，对 403 写 `forbidden`、超时写 `timeout` **负缓存**
- **不做跨源去重**，同名结果按源并列展示，让用户自己选线路

**源健康检查**（LunaTV `/api/admin/source/validate`）：SSE 流式逐源上报
`{ type: 'source_result', source, status: 'valid' | 'no_results' | 'invalid' }`，10s 超时，前端实时染色。设计很干净，用 `res.write('data: ...\n\n')` 即可移植。

### 2.2 路线 B：声明式选择器规则引擎（兜底路径）

Kazumi 的方案，用于对付不提供 CMS 接口的站点。**核心价值不在代码，在这三个设计决策**：

**决策一：规则是纯数据，绝不可执行。** 规则文件只是一组选择器字符串，由宿主的原生解析器执行，没有 eval、没有沙箱、没有 JS。安全性由架构保证而非隔离手段保证。

```json
{
  "api": "6", "type": "anime", "name": "xfdm", "version": "2.1",
  "muliSources": true, "useWebview": true, "useNativePlayer": true,
  "userAgent": "", "referer": "",
  "baseURL": "https://example.com/",
  "searchURL": "https://example.com/search.html?wd=@keyword",
  "searchList": "//div[@class='search-list']",
  "searchName": "//div/div[2]/a/h3",
  "searchResult": "//div/div[2]/a",
  "chapterRoads": "//ul[@class='anthology-list-play']",
  "chapterResult": "//li/a"
}
```

**只有 5 个核心选择器**，`@keyword` 是唯一占位符。这种刻意的极简约束让规则编写门槛极低——这是它能积累起规则生态的根本原因。

**决策二：同一套抽象兼容两种源。** 新版扩展了 `searchMode` / `chapterMode` 双模式（`RuleMode.xpath` | `RuleMode.api`），XPath 模式爬 HTML，API 模式调 JSON。**这意味着路线 A 和路线 B 可以统一在一个接口下**——这正是我们 `SourceAdapter` 该有的样子。

**决策三：API Level 版本协商。** 规则市场 `index.json` 携带 `api` 字段，客户端比对 `requiresNewerClient = rule.api > client.apiLevel`，老客户端自动拒绝加载新规则并提示升级。避免了规则格式演进时的兼容性灾难。

```json
{ "name": "xfdm", "version": "2.1", "useNativePlayer": true,
  "antiCrawlerEnabled": true, "lastUpdate": 1780065540000 }
```

**决策四：真实播放地址靠嗅探，不靠解析。** 播放地址常藏在 iframe 里，Kazumi 用**无头 WebView 监听网络请求**捞 m3u8，而不是解析 HTML。

> **这一点在 Electron 里比 Flutter 好实现得多**：`new BrowserWindow({ show: false })` + `session.webRequest.onBeforeRequest` 过滤 `*.m3u8`，拿到地址立刻关窗。
> Kazumi 的释放技巧值得抄：不 dispose 控制器（重建代价高），而是导航到 `about:blank` 防内存泄漏。

---

## 三、防盗链与代理层（最高价值的可复制资产）

### 3.1 为什么必须有这一层

Chromium 的 **forbidden request header** 列表包含 `Referer`、`Origin`、`Cookie`、`Host`；`User-Agent` 虽已从规范移除但 Chromium 仍会静默丢弃。

> **结论：纯前端 `xhrSetup` 无法伪造 Referer / UA / Origin。** hls.js 默认 loader 用的是 XHR，连 `fetch()` 的 `referrer` 选项都用不上。防盗链源站只能靠服务端代理或主进程拦截。

### 3.2 两条路线对比

| 维度 | A：`webRequest.onBeforeSendHeaders` | B：本地 Node 代理转发 |
|---|---|---|
| 改造量 | 主进程 10 行 | 需写 m3u8 解析 + URL 重写 + 分片转发 |
| 性能 | 最优，分片直连 CDN | 每分片过一次 Node，多一次内存拷贝 |
| CORS | 仍受渲染进程约束，需同时改 `onHeadersReceived` | 天然同源，无 CORS |
| 精细控制 | 只能按 URL 通配匹配 | 每请求独立头策略、可缓存、可重试、可限速 |
| 302 / Cookie 链 | Chromium 自动跟随，难插手 | 完全可控 |
| 与本项目契合度 | 需在 main 维护规则表并与渲染进程同步 | **已有手写 `http.createServer`，加一条路由即可** |
| 风险 | 全局副作用，可能误伤应用自身请求 | 需正确处理相对/绝对 URL 重写 |

**决定：以 B 为主、A 为辅。** 主路径走 `server.js` 代理（与现有架构一致、可控、易调试）；对个别只需改 Referer 的简单源，用 A 快速兜底。

⚠️ **代理路由必须做 URL 白名单校验**，否则会变成开放代理（SSRF）。项目已有 `desktop/network-policy.js` 的 SSRF 防护，直接复用。

### 3.3 KVideo 的头部伪造实现（MIT，可直接复制到 server.js）

`lib/fetch-with-retry.ts` 的具体手法：

| 手段 | 做法 |
|---|---|
| UA 轮换 | 3 个 UA（Mac Chrome / iPhone Safari / Win Firefox）随机取 |
| **智能 Referer** | 默认 `${protocol}//${hostname}`，**指向视频站自己的域名**而非本站域名，降低可疑度；可用 `?referer=` 覆盖 |
| IP 伪造 | `X-Forwarded-For` + `Client-IP` 默认 `202.108.22.5`（北京 IP），可用 `?ip=` 覆盖 |
| 补齐指纹头 | `Origin`、`Sec-Fetch-Dest: empty`、`Sec-Fetch-Mode: cors`、`Sec-Fetch-Site: cross-site` |
| 重试 | 最多 5 次，指数退避 100/200/400/800/1600ms，30s `AbortController` 超时；**专门针对 503 重试**，403/404 直接透传交调用方判断 |
| 透传 | 仅转发 `cookie` 和 `range` 两个请求头（**range 保证进度条可拖动**） |

### 3.4 m3u8 递归重写（核心算法）

逐行扫描 m3u8，把所有 URL 改写为走本地代理：

| 行类型 | 处理 |
|---|---|
| `#EXT-X-KEY:...URI="..."` | URI 改写为 `/api/video/proxy?url=` |
| `#EXT-X-MAP:...URI="..."` | 同上 |
| `#EXT-X-MEDIA:...URI="..."` | 同上（多音轨） |
| `#EXT-X-STREAM-INF` 的下一行 | **递归**改写为 m3u8 代理（多码率子表） |
| 其他非注释行 | 视为分片，`new URL(line, base)` 转绝对后改写为代理 |
| 已含 `/api/video/proxy` 的行 | 跳过，防重复代理 |

两个易错点：
1. **baseUrl 必须用重定向后的 `response.url` 计算**，不能用原始请求 URL，否则相对路径全错（LunaTV 踩过这个坑）。
2. 密钥、分片、子播放列表**全部**要代理，否则 `<video>` 侧会出现部分请求绕过代理导致 403。

### 3.5 广告过滤：实测两家都很弱

LunaTV 的实现是自定义 `Hls.DefaultConfig.loader` 子类，拦截 `context.type === 'manifest' | 'level'`，在 `onSuccess` 里改写 `response.data`。核心函数：

```js
function filterAdsFromM3U8(c) {
  return c.split('\n').filter(l => !l.includes('#EXT-X-DISCONTINUITY')).join('\n');
}
```

**只删 `#EXT-X-DISCONTINUITY` 标记行，不删任何 ts 分片**，靠抹掉不连续标记让播放器"无缝"跳过插播段。README 自称"实验性"，实际效果有限。

> **改进方向（我们自研）**：按 `#EXTINF` 时长异常（广告分片时长通常与正片不同）+ 分片 URL 域名与主域名不一致，两个特征联合判定后**真正剔除分片**。这是我们可以做得比参考项目更好的一处。

---

## 四、数据模型：三家融合

### 4.1 Kazumi：线路 × 集数二维模型（最优抽象）

```dart
class Road { String name; List<String> data; List<String> identifier; }
// 一个 Road = 一条线路，data 是该线路所有集的 URL 数组，下标即集号
class Progress { int episode; int road; int _progressInMilli; int updatedAtMs; }
class History {
  Map<int, Progress> progresses;   // key = 集数
  int lastWatchEpisode; String adapterName; DateTime lastWatchTime;
  String entryKind;                // 'online' | 'offline'
  String get key => '${adapterName}${bangumiItem.id}::${entryKind}';
}
class CollectedBangumi { int type; }  // 1在看 2想看 3搁置 4看过 5抛弃
```

三个值得照搬的设计：
- **「线路 × 集数」二维**是影视站的通用抽象，与 CMS10 的 `$$$` 分组天然对应；
- **`key` 带 `::entryKind` 命名空间**，在线源与本地文件不冲突，且保留 `legacyKey` 做迁移；
- **`updatedAtMs`** 用于多端同步的 last-write-wins。

### 4.2 KVideo：跨源去重与无缝切源

```ts
VideoHistoryItem {
  showIdentifier: string;                     // 跨源去重键
  sourceMap?: Record<string, string|number>;  // 源名 -> 该源下的 videoId
  videoId, title, url, episodeIndex, source, timestamp,
  playbackPosition, duration, poster?, episodes: Episode[]
}
```

- **`showIdentifier`**：把同一部剧在不同源下的记录合并，避免历史列表里出现 5 条同名记录；
- **`sourceMap`**：缓存「同一部剧在各源的 id」，实现**播放中切换线路而不丢进度**。

这两个字段解决的是 Kazumi 模型没覆盖的问题，必须补进来。

### 4.3 LunaTV：跳过片头片尾

```ts
SkipConfig { enable: boolean; intro_time: number; outro_time: number }
// outro_time 为负数，表示距片尾的秒数
```

存储 key 设计为 `${source}+${id}`。进度保存**节流 5s** + `pause` / `visibilitychange` / `beforeunload` 三重兜底，恢复时在 `video:canplay` 事件里 seek。这套节流与兜底策略直接照抄。

### 4.4 我们的融合模型

```
VideoRecord {
  key: `${sourceId}:${showId}::${entryKind}`   // Kazumi 命名空间
  showIdentifier                                // KVideo 跨源去重
  sourceMap: { [sourceId]: showId }             // KVideo 无缝切源
  roads: [{ name, episodes: [{ title, url }] }] // Kazumi 线路×集数
  progresses: { [ep]: { road, ms, updatedAtMs } }
  skip: { enable, introSec, outroSec }          // LunaTV 跳过片头尾
  collectType: 1..5                             // Kazumi 收藏语义
}
```

存储沿用现有 localStorage，命名空间 `mineradio-video-*`，与音乐数据零交集（符合已定的隔离原则）。

---

## 五、hls.js 集成方案

### 5.1 版本与产物选型（已定）

- **版本：`1.6.16`**（当前 npm latest）。**没有 v2.x**——所谓 v1/v2 指的是 CMCD 协议版本，不是库大版本。`1.7.0` 仍在 rc，不用于生产。
- **授权：Apache-2.0**，可自由引入，保留声明即可。

`dist/` 产物体积：

| 文件 | 体积 | 说明 |
|---|---|---|
| `hls.js` | 1444.8 KB | UMD 完整未压缩 |
| **`hls.min.js`** | **530.3 KB** | **← 选它** |
| `hls.light.min.js` | 346.1 KB | 砍功能版 |
| `hls.mjs` | 1276.4 KB | ESM，需外挂 worker |
| `hls.worker.js` | 100.4 KB | 仅 ESM 需要 |

**light 版砍掉了**：多音轨（ALT-AUDIO）、**字幕**、EME/DRM、CMCD、Interstitials、I-frame trick-play、**MPEG-2 TS 中的 HEVC 与 AC-3**。

> 影视场景必须用完整版。国语/原声多音轨、内嵌字幕、TS 封装的 HEVC 都是刚需，省 184 KB 完全不值。

**关键结论：UMD 版不需要单独的 worker 文件。** `hls.min.js` 内部把 transmuxer worker 内联，运行时自建 Blob URL 启动。**单文件自洽，完美适配我们「无构建工具」的约束。**

唯一注意：Blob Worker 需 CSP 允许 `worker-src blob:`。若页面 CSP 严格且不放开 blob，则额外放 `hls.worker.js` 并配 `workerPath`。

**落地：只复制一个文件 → `public/vendor/hls.min.js`**（与现有 vendor 目录约定一致）。

### 5.2 最小集成骨架

```html
<video id="video" controls playsinline></video>
<script src="./vendor/hls.min.js"></script>
<script>
(function () {
  var video = document.getElementById('video');
  var src = 'http://127.0.0.1:' + PORT + '/api/video/proxy?url=' + encodeURIComponent(realUrl);
  var hls = null;

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 60,
      backBufferLength: 90
    });
    hls.on(Hls.Events.MEDIA_ATTACHED, function () { hls.loadSource(src); });
    hls.on(Hls.Events.MANIFEST_PARSED, function (evt, data) {
      console.log('清晰度档位:', data.levels.map(function (l) { return l.height + 'p'; }));
      video.play().catch(function (e) { console.warn('autoplay blocked', e); });
    });
    hls.on(Hls.Events.ERROR, onHlsError);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;   // Windows Electron 走不到这里，保留即可
  }
})();
</script>
```

### 5.3 桌面点播推荐配置

| 参数 | 默认 | 推荐 | 理由 |
|---|---|---|---|
| `maxBufferLength` | 30 s | **60** | 桌面带宽宽裕，减少卡顿 |
| `maxMaxBufferLength` | 600 s | 600 | 保持默认 |
| `backBufferLength` | `Infinity` | **90** | **默认 Infinity 播长片会吃满内存，务必改** |
| `enableWorker` | true | true | TS 解复用放 Worker，避免主线程掉帧 |
| `lowLatencyMode` | true | **false** | LL-HLS 只对直播有意义，点播开着反而卡 |
| `startLevel` | — | -1 | ABR 自动选首档 |
| `abrEwmaDefaultEstimate` | 500 kbps | **5 Mbps** | 避免起播先给最低码率 |
| `fragLoadingTimeOut` | 20000 | **改用 `fragLoadPolicy`** | 官方已标记 deprecated |
| `manifestLoadingMaxRetry` | 1 | **改用 `manifestLoadPolicy`** | 同上，建议重试 3~4 次 |

### 5.4 自定义 loader

| 配置 | 作用域 | 优先级 |
|---|---|---|
| `loader` | playlist + fragment | 最低 |
| `pLoader` | 仅 playlist（m3u8） | 覆盖 `loader` |
| `fLoader` | 仅 fragment（ts/m4s/key） | 覆盖 `loader` |

```js
class ProxyLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    const load = this.load.bind(this);
    this.load = function (context, cfg, callbacks) {
      context.url = PROXY_BASE + '?url=' + encodeURIComponent(context.url);
      if (context.type === 'manifest' || context.type === 'level') {
        const onSuccess = callbacks.onSuccess;
        callbacks.onSuccess = function (resp, stats, ctx, net) {
          resp.data = stripAds(rewriteM3U8(resp.data));
          onSuccess(resp, stats, ctx, net);
        };
      }
      load(context, cfg, callbacks);
    };
  }
}
```

自定义 loader 必须实现 `load(context, config, callbacks)` / `abort()` / `destroy()`。

### 5.5 错误恢复标准写法

```js
var lastRecover = 0;
function onHlsError(evt, data) {
  if (!data.fatal) return;                       // 非致命由 hls.js 自愈
  switch (data.type) {
    case Hls.ErrorTypes.NETWORK_ERROR:
      hls.startLoad(); break;
    case Hls.ErrorTypes.MEDIA_ERROR: {
      var now = Date.now();
      if (now - lastRecover > 5000) { lastRecover = now; hls.recoverMediaError(); }
      else { hls.destroy(); }                    // 5s 内二次失败即放弃
      break;
    }
    default: hls.destroy();                      // KEY_SYSTEM / MUX / OTHER
  }
}
```

`Hls.ErrorTypes` 全集：`NETWORK_ERROR`、`MEDIA_ERROR`、`KEY_SYSTEM_ERROR`、`MUX_ERROR`、`OTHER_ERROR`。
`recoverMediaError()` 仅应在 media element 处于 error 状态时调用。

---

## 六、编解码边界（Electron 42 = Chromium 148）

| 编解码 | 官方 Electron 42 Windows | 说明 |
|---|---|---|
| H.264 / AVC | ✅ | 内置 |
| AAC | ✅ | 内置 |
| **HEVC / H.265 硬解** | ✅ **已内置** | Electron ≥22 集成，依赖 GPU（D3D11VideoDecoder）。**不需要 `--enable-features` 开关**，那是 Electron 20/21 时代的做法 |
| HEVC 软解 | ❌ | 官方构建不含，无 GPU 支持的机器会失败 |
| AV1 | ✅ | 内置 dav1d 软解 |
| **AC-3 / E-AC-3** | ❌ **不支持** | Chromium 需 `enable_platform_ac3_eac3_audio=true` 构建标志，官方 Electron 未开启 |

> **修正原计划的一个判断**：原文档写「HEVC 需评估，可能要转封装」——实测 **HEVC 硬解已内置，不是问题**。
> **真正的坑是 AC-3 / E-AC-3 音轨**，影视片源极常见，会导致静音或 `MEDIA_ERR_DECODE`。
> **解法：不要重编 Electron 的 ffmpeg**（维护自定义构建成本极高），改在 `server.js` 侧做音轨转码兜底 `ffmpeg -c:v copy -c:a aac -b:a 192k`。

**启动时必做运行时探测**，不要靠猜：

```js
console.table({
  h264: MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"'),
  hevc: MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"'),
  av1:  MediaSource.isTypeSupported('video/mp4; codecs="av01.0.05M.08"'),
  aac:  MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"'),
  ac3:  MediaSource.isTypeSupported('audio/mp4; codecs="ac-3"'),
  eac3: MediaSource.isTypeSupported('audio/mp4; codecs="ec-3"')
});
```

---

## 七、播放器 UI 框架取舍

分层关系必须先讲清楚：

```
UI 层     ArtPlayer / video.js / Plyr    控制条、手势、设置面板、弹幕
传输层    hls.js                          m3u8 解析、分片下载、ABR、TS→fMP4 重封装
解码层    <video> + MSE + Chromium        真正的解码渲染
```

**三个 UI 框架都不解码 HLS，它们只是把 hls.js 挂到自己的 `<video>` 上。用不用它们，hls.js 都是必需的。**

| 方案 | 结论 |
|---|---|
| **裸 `<video>` + hls.js** | ✅ **采用**。只加 530 KB 一个文件，零 UI 冲突。项目已有成熟的玻璃拟态设计语言，影视控制条应当延续它 |
| ArtPlayer + hls.js | 单文件 UMD 无依赖，确实适配无构建工具场景，功能全。但会**接管整个播放器 DOM 与主题**，与自研 UI 打架 |
| video.js | ❌ 体积大、依赖多、自带 `videojs-http-streaming` 与 hls.js 职责重叠 |
| Plyr | ❌ 定制性弱，仍需自己接 hls.js |

**预留退路**：真正难自研的是「弹幕渲染」「进度条缩略图预览」「多字幕轨切换」三块。若后续确需且不想自己写，**单独引入 ArtPlayer 的对应插件**（可独立使用），而不是整体换播放器框架。

---

## 八、对原执行计划的修正

| 项 | 原判断 | 修正后 | 依据 |
|---|---|---|---|
| HEVC | 需评估，可能要转封装 | **硬解已内置，非问题** | Electron ≥22 集成 |
| 真正的编解码坑 | 未识别 | **AC-3 / E-AC-3 不支持**，服务端转 AAC 兜底 | Chromium 未开构建标志 |
| 阶段顺序 | 本地 → 插件源 → 在线源 | **在线 CMS10 源可提前**，它比本地元数据刮削更简单 | CMS10 是标准协议 |
| 代理层定位 | 归在阶段 2 | **提到阶段 1**，三种源形态共用 | 防盗链是共性需求 |
| 规则引擎 | 阶段 2 核心 | **降级为兜底**，主路径不需要 | 三个项目都走 CMS10 |
| hls.js 引入方式 | 未定 | `public/vendor/hls.min.js` 单文件，无需 worker 文件 | UMD 内联 Blob Worker |
| 防盗链方案 | 未定 | **server.js 代理为主，webRequest 为辅** | 与现有架构契合度 |

---

## 九、合规红线

1. **不预置任何源。** 四个参考项目全都是空壳，不内置源，全部由部署者/用户自行配置。LunaTV 甚至明确声明「本项目不在中国大陆地区提供服务」，并禁止在国内社交平台宣传。
2. **桌面应用的风险高于自托管。** 参考项目是「用户自己部署给自己用」，而我们分发的是**成品桌面软件**，会成为「提供聚合入口」的一方，法律定性不同。**必须默认不带任何 `api_site` 配置，全靠用户手动导入。**
3. **授权合规**（2026-07-31 修正，详见第 1.2 节）：
   - 本项目自身为 **GPL-3.0**（强制继承自上游 Fork），入站兼容范围比原判断宽；
   - 复制 KVideo（MIT）/ Stardm0-MoonTV（MIT）代码 → 保留版权声明，列入 `NOTICE.md`；
   - Kazumi（GPL-3.0）→ **协议兼容，允许并入**；但其为 Dart 代码，无工程移植价值，实际仍只取设计。**禁止复制其图标（Pixiv 作者 Yuquanaaa 保留全部权利）与 Mi Sans 字体**；
   - **不复制** LunaTV（CC BY-NC-SA）代码——NC 条款与 GPL 不兼容，此项不因本项目是 GPL 而解除；
   - hls.js（Apache-2.0）→ 单向兼容 GPLv3，在 `NOTICE.md` 中列明。
   - **GPLv3 自身义务**：分发 `Setup.exe` 时须同步提供对应版本的完整源码（GitHub Release 与源码 tag 对应即可满足）；修改他人 GPL 文件须标注修改内容与日期（§5a）。
   - **待处理**：`public/vendor/gsap.min.js` 为 GreenSock 专有协议，与 GPL-3.0 存在冲突风险（见 1.2 节末）。
4. **免责声明**：参考各项目写法，产品内注明「不存储任何视频资源，仅供个人学习使用」。

---

## 十、可复制资产清单（按性价比排序）

| 序 | 资产 | 来源 | 授权 | 价值 | 成本 |
|---|---|---|---|---|---|
| 1 | m3u8 递归重写代理 | KVideo `app/api/proxy` | MIT | ★★★★★ | 低 |
| 2 | 头部伪造 + 退避重试 | KVideo `fetch-with-retry.ts` | MIT | ★★★★★ | 低 |
| 3 | CMS10 协议常量与 `vod_play_url` 解析 | Stardm0/MoonTV `downstream.ts` | MIT | ★★★★★ | 低 |
| 4 | `showIdentifier` + `sourceMap` | KVideo `types.ts` | MIT | ★★★★★ | 极低 |
| 5 | 线路 × 集数模型 + `Progress` | Kazumi（Dart，取设计） | GPL-3.0 ✅兼容 | ★★★★★ | 极低 |
| 6 | hls.js 单文件引入 + 配置 | video-dev/hls.js | Apache-2.0 | ★★★★★ | 极低 |
| 7 | SSE 流式聚合搜索 | KVideo `/api/search-parallel` | MIT | ★★★★ | 中 |
| 8 | SSE 源健康检查 | LunaTV（仅设计） | CC | ★★★★ | 低 |
| 9 | SkipConfig + 进度节流三重兜底 | LunaTV（仅设计） | CC | ★★★★ | 低 |
| 10 | 无头窗嗅探播放地址 | Kazumi（Dart，取设计） | GPL-3.0 ✅兼容 | ★★★★ | 中 |
| 11 | 声明式规则 schema + API Level | Kazumi（Dart，取设计） | GPL-3.0 ✅兼容 | ★★★ | 高 |
| 12 | 图片/海报代理路由 | LunaTV `/api/image-proxy` | CC | ★★★ | 极低 |

**阶段 1 只需落地第 1~6 项**，即可跑通「在线源搜索 → 选线路 → 播放 → 记进度」的完整闭环。
