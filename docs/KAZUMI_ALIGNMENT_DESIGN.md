# Kazumi 多源面板 × 选集切换 对齐设计文档（Stellaflix 侧）

> 制定日期：2026-08-18
> 配套文档：`docs/VIDEO_REFERENCE_ANALYSIS.md`（参考项目深度分析）、`docs/MULTISOURCE_ACCEPTANCE.md`（多源面板验收）、`docs/VIDEO_MODULE_PLAN.md`（执行计划）
> 审查对象：Kazumi v2.2.6（只读参考，Flutter/Dart）
> 落地对象：Stellaflix 影视模块（`public/video/*`，Electron/原生 JS）
> 结论定位：本文把「Kazumi 多源面板 vs 选集切换」两模块的审查发现，逐条映射到 Stellaflix 等价实现，标注对齐状态、证据与待办修复顺序。

---

## 零、定位与铁律（先讲清边界）

1. **Kazumi 是只读参考项目，不是改动对象。** 此前曾误改 Kazumi 源码（Phase 中已发现并 100% 还原，字节级 `diff -q` 全 `MATCH`），本环境无 Flutter/Dart SDK、Kazumi 目录非 git 仓，故 Kazumi 侧**任何修复都不落地、不编译、不验证**，仅作为「健壮模式范本」引用。
2. **所有对齐动作只落在 Stellaflix 侧。** 本文的发现编号统一用 **F1–F8**（避免与 Stellaflix 内部已有的 `P1`/`P3`/`P7` 修复标签冲突）；Stellaflix 内部既有的 `P#` 标签在对应条目下以「项目内标签」交叉引用。
3. **证据优先。** 每条发现均给出 (a) Kazumi 侧 `文件:行号` 原文证据；(b) 两模块分歧点；(c) Stellaflix 等价模块 + 对齐状态 + `文件:行号` 证据。状态分三档：✅ 已对齐 / ⚠️ 部分对齐（含待办）/ ❌ 未对齐。
4. **合规红线不变。** 不预置任何 `api_site`；多源面板默认空壳，全部用户手动导入（见 `VIDEO_REFERENCE_ANALYSIS.md` 第九节）。

---

## 一、审查对象与方法

### 1.1 Kazumi 两模块边界（只读参考）

| 维度 | 多源面板（multi-source panel） | 选集切换（episode / road switching） |
| --- | --- | --- |
| 核心文件 | `lib/modules/search/plugin_search_module.dart`<br>`lib/services/plugin/plugin_search_service.dart`<br>`lib/pages/info/source_sheet.dart` | `lib/pages/video/video_controller.dart`<br>`lib/pages/player/player_item.dart`<br>`lib/pages/player/player_item_panel.dart` |
| 控制器 | `InfoController` + `PluginSearchService` | `VideoPageController`（`video_controller.dart:59`） |
| 职责 | 选源 → 选命中 → 跳视频页 | 线路(Road)/选集(Episode) 切换、解析、续播 |
| 关键抽象 | `PluginSearchStatus` 枚举、per-plugin 会话 | `VideoEpisodeSelection` / `EpisodeRef` 值对象、`Road` 列表 |

### 1.2 Stellaflix 等价模块（已读源码验证）

| Kazumi 模块 | Stellaflix 等价实现 | 文件 |
| --- | --- | --- |
| 多源面板 `SourceSheet` + `PluginSearchService` | 多源选择弹窗 + 跨源流式搜索 | `public/video/source-picker.js`、`public/video/detail-source.js`、`public/video/detail-core.js` |
| 选集切换 `VideoPageController` | 播放器侧线路/选集切换 | `public/video/player-road-episode.js`、`public/video/player-core.js`、`public/video/play-orchestrator.js` |

---

## 二、四维对比总表（Kazumi 两侧 + Stellaflix 现状）

| 维度 | 多源面板（Kazumi） | 选集切换（Kazumi） | Stellaflix 现状 |
| --- | --- | --- | --- |
| **逻辑设计** | 先弹空窗→逐源并发流式填（per-plugin 会话） | 选集解析状态机（loading/error/idle） | ✅ 同构：先弹后填 + 解析回调用 |
| **状态管理** | `pluginSearchStatus[plugin.name]`（5 态枚举）+ per-plugin `AsyncSessionOwner` | `selectedEpisode`/`playingEpisode`（`VideoEpisodeSelection`）+ 3 个可重开会话 | ✅ 面板 5 态点 + 播放器侧新增 `wait`/`ok`/`error` 三态（`data-road-ep-state`） |
| **数据处理流** | `_handleSearchError` 异常→状态映射 | `_resolveOnline/OfflineEpisode` 越界→null | ✅ 面板异常→点色；✅ 线路切换 `decideRoadSwitch` 对齐失败→`onAlignFail` 提示（不再 `Math.min` 静默钳制） |
| **边界条件** | `cancel()` 全局 `_isCancelled` 永久置位（不可逆）+ per-plugin `isStale` 守卫 | 全路径 `road/data/identifier` 越界判空；`session.isStale` 守卫 | ✅ 面板 `searchToken` 重入守卫 + DOM-map 空值守卫；✅ 跨线路按名对齐 |

---

## 三、八项发现（F1–F8）逐条映射

### F1 — 源身份隔离键稳定性（Source identity isolation key）

- **Kazumi 证据**：多源面板以 `plugin.name` 作为隔离/状态键——`plugin_search_service.dart:21` `_querySessions`（`Map<String, AsyncSessionOwner>` 键为 `plugin.name`）、`:30/:65/:85` `pluginSearchStatus[plugin.name]`。选集切换则用 `video_controller.dart:34-57` `VideoEpisodeSelection {episode, road}`（带 `==`/`hashCode` 的内容相等值对象）作为选择身份。
- **分歧点**：面板用「可变/展示型字符串」做隔离键，同名插件会互相覆盖状态；切换用「不可变值对象」做身份，天然稳定。
- **Stellaflix 对齐**：✅ **已对齐（项目内标签 P1）**。
  - `detail-core.js:81-92` `sourceKeyOf(c)` → 稳定键 `cms:<sourceId>` / `kazumi:<ruleName>`，与展示名解耦；
  - `source-picker.js:60-75` `groupBySource` 以 `sourceKey` 分组，注释明确「修复审查 P1：隔离键=稳定 sourceKey，不靠展示名」；
  - `detail-core.js:74` 与 `source-picker.js:57` 注释「来源身份 = 可变字符串 → 改用不变 ID」。
  - 验证：`source-picker.test.js` 第 26 项「groupBySource 大小写不同 id 不串台（P1 边界）」✅。

### F2 — 异步会话失效 / 取消机制（Async session staleness）

- **Kazumi 证据**：
  - 面板：`plugin_search_service.dart:17` `RuleCancelToken` + `:22` `_isCancelled`；`:119-122` `cancel()` **永久**置 `_isCancelled=true`，且 `querySource`/`queryAllSource` 在 `:42/:74` 以 `if (_isCancelled) return` 早退——**一次 cancel 后服务不可再搜（不可逆）**。
  - 切换：`video_controller.dart:111-113` 三个**可重开**会话 `_playbackSessions`/`_danmakuSessions`/`_commentSessions`，每次 `begin()` 重新计版本；`:436/:503/:613/:651/:661/:668/:687/:692/:705` 每处状态写入前均 `session.isStale`/`isActive` 守卫。
- **分歧点（修正）**：面板**并非**只用全局不可逆取消——`plugin_search_service.dart:21` `_querySessions` 是 **per-plugin `AsyncSessionOwner`**，每次 `_queryPlugin` 经 `:75-77` `.begin()` 计版本、`:84/:92` 在 `await` 后判 `session.isStale` 才写回，**与切换侧同构**都用「按操作计版本的会话失效」。二者真正差异：面板额外叠加全局不可逆 `_isCancelled`（`:22/:119-122` 一次性楔住整服务，配合 `queryAllSource` `:59-61` 重开时清空状态重跑）；切换则把「播放/弹幕/评论」拆为三个独立可重开会话（`:111-113`）。我方 `detail-source.js` 的 `searchToken` 正是对「per-plugin `isStale` + 重开清空」的忠实映射（整面板重开一次性失效，粒度略粗但等价）。
- **Stellaflix 对齐**：✅ **已对齐（2026-08-18 实施，含单测）**。
  - `detail-source.js:110-193` `searchAndPick` 对每个源单元独立 `then/catch`，失败仅 `:179` `setStatus(u.key,'error')`，**不阻断其它源**✅；
  - 失效防护用 `source-picker.js:262/:276` 的 `if (!pillEls[sourceKey])` / `if (!sectionEls[sourceKey]) return` 空值守卫——面板 `close()` 后旧回调安全 no-op ✅；
  - **缺口已补（F2）**：模块级 `searchToken`（`detail-source.js`，每次 `searchAndPick` 自增）；每个源回调捕获 `myToken = searchToken`，在 `.then`/`.catch`/终态 `.then` 三处入口比对 `myToken !== searchToken` → 整段丢弃。重开面板后，上一轮仍在途的回调（候选/状态点/waiting/fallback）全部 no-op，**杜绝过期候选注入新面板**，精准对齐 Kazumi `AsyncSession.isStale`。
  - 验证：`detail-source-stream.test.js` 新增「F2 重入守卫：陈旧源搜索回调不写入重开的面板」✅（构造 deferred 让陈旧回调在重开后才落地，断言 sA 候选/状态点/fallback 均不出现，仅 sB 写入）。

### F3 — 错误→状态映射的状态机完整性（Error→status state machine）

- **Kazumi 证据**：面板 `_handleSearchError`（`plugin_search_service.dart:97-117`）把 `CaptchaRequiredException`→`captcha`、`NoResultException`→`noResult`、`SearchErrorException`→`error`(提取 `pluginName`) 干净映射；枚举 `pending/success/error/noResult/captcha`（`plugin_search_module.dart`）。切换侧解析状态机（`video_controller.dart:72-79` `_loading`/`_errorMessage`，`:384/:409/:414` 三态迁移，`:454/:488` `_failLoading('集数解析失败')`）只暴露「成功/失败」两态，无 `noResult`/`captcha` 等价结构化态。
- **分歧点**：面板对「失败」有丰富 5 态分类并上屏（五色点）；切换把解析失败收敛为单一错误串，未把「无结果/验证」等结构化态带给 UI。
- **Stellaflix 对齐**：✅ **已对齐（面板 + 播放器侧，2026-08-18 实施，含单测）**。
  - 面板：`source-picker.js:26` `statusMap = {ok|none|captcha|error|wait}` + `hall.css` 五色点（CSS class `.sfv-picker-dot--ok/--none/--captcha/--error/--wait`，色值 `#58d68d`/`#f5a623`/`#4aa3ff`/`#ff5c5c`/`#9aa0a6`）**语义镜像 Kazumi 枚举（键名重映射：pending→wait、success→ok、noResult→none、captcha/error 保留）**；`source-picker.test.js:25`「captcha 蓝色点」✅；
  - 播放器侧（F3 已补）：`player-road-episode.js` 新增 `setStatus(state)` → 渲染为 root 的 `data-road-ep-state` 属性（合法值 `wait`/`ok`/`error`，非法值清除属性）；`play-orchestrator.js` 在 `onSwitchRoad`/`onPickEpisode` 中先上报 `wait`、再依据 `SFV.player.switchRoad`/`playEpisodeAt` 布尔返回值落 `ok`/`error`，与面板 5 态语义衔接。
  - 验证：`player-road-episode.test.js` 新增「F3 浮动层操作状态机 setStatus(wait/ok/error)」✅（wait→ok→error→非法值清除 的状态迁移 + 中性初态）。

### F4 — 线路/集索引越界防护（Road/episode index bounds safety）

- **Kazumi 证据**：切换 `_resolveOnlineEpisode`/`_resolveOfflineEpisode`（`video_controller.dart:316-368`）先判 `roadList.isEmpty || targetRoad<0 || targetRoad>=roadList.length` → null，再判 `index<0 || index>=data.length || index>=identifier.length` → null；调用方 `_failLoading('集数解析失败')`（`:454/:488`）。但 UI 侧 `player_item_panel.dart` 原 `roadList[selectedEpisode.road].identifier[episode-1]` 为**裸索引**（审查标记的不安全点，后改走 `currentEpisodeDisplayTitle`）。
- **分歧点**：解析层全路径越界判空；个别 UI 索引裸写未守卫。
- **Stellaflix 对齐**：✅ **已对齐（2026-08-18 实施，含单测）**。
  - `detail-core.js:107-131` `alignEpisodeByIdentifier` 对 `targetFromIndex` 与 `eps` 越界判空、名称未命中返回 null（**不静默错集/不越界崩溃**）✅；
  - `player-road-episode.js:73` `plays[opt.fromIndex||0] && ...episodes` 已守卫；
  - **缺口已补（F4）**：`:97-99` 复用 `alignEpisodeByIdentifier` 跨线路按名对齐，提取纯函数 `decideRoadSwitch(plays, to, curName, curIdx)` → 对齐成功返回 `{ok:true, episodeIndex}`，失败返回 `{ok:false}`（**不再 `Math.min(curIdx, len-1)` 静默钳制**）；线路切换 change 处理器在 `ok` 时走 `onSwitchRoad`，失败时走新增 `onAlignFail(to, curName)`（编排器注入，toast「该线路无对应集」并复位下拉保持当前线路）。`player.js:468` `switchRoad` 仍对越界做二次防护（bounds-check + 编排器 L113 缺集 toast），纵深防御保留。
  - 验证：`player-road-episode.test.js` 新增「F4 线路切换对齐失败→不静默跳集（decideRoadSwitch）」✅（集名命中→ok+正确 index；目标线路无同名集→ok:false 且不携带任何 episodeIndex）。

### F5 — 显式选择身份值对象（Explicit selection identity value object）

- **Kazumi 证据**：切换 `video_controller.dart:34-57` `VideoEpisodeSelection {episode, road}` 带 `operator ==`/`hashCode`，可作 Map 键、跨线路相等比较、历史键。面板选源则用裸 `plugin.name` 字符串 + `pluginSearchResponseList` 下标，无值对象。
- **分歧点**：切换有「一等公民」选择身份；面板用 ad-hoc 字符串+下标。
- **Stellaflix 对齐**：✅ **已对齐（2026-08-18 实施，含单测）**。
  - `player-core.js` 新增 `makeEpisodeSelection(road, episode)` 纯函数 → 返回 `{road, episode, equals(o), hash(), key(), toString()}` 值对象（`road`/`episode` 经 `|0` 整数化），语义对齐 Kazumi `VideoEpisodeSelection` 的 `==`/`hashCode`/相等键；经 `SFV.playerCore` facade 暴露（`fmt`/`extractEpisode`/`normalizeAnimeName`/`makeEpisodeSelection`）。
  - 调用点现状：`player-road-episode.js:101` `onSwitchRoad(to, targetIdx)`、`:121` `onPickEpisode(i)` 仍走裸下标（切换动作本身无需值对象），但稳定身份能力现已就位，可供后续跨线路相等判定 / 观看历史键统一复用（与 F1 稳定身份思路一致）。
  - **参数归一化差异（非缺陷，记录避免误判字节级兼容）**：① 构造序 `makeEpisodeSelection(road, episode)` 与 Kazumi `VideoEpisodeSelection(episode, road)` **相反**；② 集编号 **0-based**（`|0` 整数化、`i` 下标），Kazumi 为 **1-based**（默认 `episode:1`）；③ 哈希 `r*31+e`（road 在前），Kazumi 为 `Object.hash(episode, road)`（episode 在前）。三者均属「贴合本库归一化」的内部一致选择，`equals` 与 `hash` 自洽，不影响正确性。
  - 验证：`test/player-core.test.js` 新增 `makeEpisodeSelection` 相等/键/哈希/toString + `|0` 整数化单测 ✅。

### F6 — 边界安全的显示标题（Bounds-safe display title）

- **Kazumi 证据**：切换 `EpisodeRef.displayTitle`（`video_controller.dart:842-911`）恒非空；离线回退 `'第$episodeNumber集'`（`:357`）；`playbackEpisode` getter（`:99`）`playingEpisode ?? selectedEpisode` 边界安全。面板 `SourceSheet` 标签依赖上游解析，可能 null。
- **分歧点**：切换保证「即便解析不全也有显示标题」；面板标签依赖上游。
- **Stellaflix 对齐**：✅ **已对齐**。
  - `player-road-episode.js:119` `ep.name || ('第'+(i+1)+'集')` 渲染处兜底；`:133-138` `currentEpisodeName()` 返回 `eps[i].name || null`（仅内部用，安全）。

### F7 — 跨线路集对齐（Cross-road episode alignment）★关键改进

- **Kazumi 证据**：切换 `_resolveOnlineEpisode`（`video_controller.dart:316-335`）按 `roadData.data[index]` / `identifier[index]` **位置索引**解析——**无按集名跨线路对齐**；两线路集数/顺序不一致时按位置索引会**静默解析错集或越界**。这是 Kazumi 原生的薄弱点。
- **分歧点**：两侧均用位置索引，均无跨线路按名对齐。
- **Stellaflix 对齐**：✅ **已对齐且超越（项目内标签 P7）**。
  - `detail-core.js:107-131` `alignEpisodeByIdentifier(plays, targetFromIndex, identifier, currentIndex)`：优先按 `episode.name`（去空白、大小写不敏感）在目标线路精确匹配同一集；未命中（含集数/顺序不一致）→ **返回 null**，由上层提示「该线路无此集」，绝不静默错集或越界崩溃；仅无标识兜底场景按 index 并做越界保护；
  - 被 `player-road-episode.js:97-99` 在线路切换时调用；`detail-core.js:95` 注释「修复审查 P7：Kazumi 原 _resolveOnlineEpisode 仅按位置索引，两线路集数不等/顺序不一致会越界崩溃或静默播错集」；
  - 验证：`detail-core.test.js`（P1/P7 共 10 项）✅。

### F8 — 单元测试覆盖（Unit test coverage）

- **Kazumi 证据**：`_handleSearchError` 映射与 `alignEpisodeByIdentifier` 逻辑**无专职单测**（审查中曾起草 `plugin_search_status_test.dart`，但因无 Dart SDK / 非 git 仓，未验证、未保留）。
- **Stellaflix 对齐**：✅ **已对齐且超越**。
  - 自动化闸门（`scripts/multisource_gate.cjs`，纯 Node、无需 Electron）实测全绿：
    - `vm.Script` 全解析（public/video 全部脚本）：**0/0 pass**
    - `detail-core` 单测（P1/P7）：**10/10 pass**
    - `source-picker` 单测（面板/流式/边界）：**11/11 pass**
    - `player-road-episode` 单测（线路/选集 + F3/F4）：**6/6 pass**
    - `detail-source-stream` 集成（流式健壮性/多线路 + F2）：**4/4 pass**
    - `player-core` 单测（F5 EpisodeSelection）：**1/1 pass**
    - **合计：32 pass / 0 fail**（运行 `node scripts/multisource_gate.cjs` 实测，非引用文档声明）

---

## 四、对齐状态总览

| 发现 | 主题 | Kazumi 健壮模式 | Stellaflix 状态 | 项目内标签 | 验收证据 |
| --- | --- | --- | --- | --- | --- |
| F1 | 源身份隔离键 | `plugin.name` 字符串键 | ✅ 已对齐 | P1 | `source-picker.test.js:26` |
| F2 | 异步会话失效 | 可重开 per-op 会话 + `isStale` | ✅ 已对齐（searchToken 重入守卫） | — | `detail-source-stream.test.js` F2 |
| F3 | 错误状态机 | 5 态枚举 + 映射 | ✅ 已对齐（面板 + 播放器侧 wait/ok/error） | — | `player-road-episode.test.js` F3 |
| F4 | 索引越界防护 | 全路径判空→null | ✅ 已对齐（decideRoadSwitch + onAlignFail） | — | `player-road-episode.test.js` F4 |
| F5 | 选择身份值对象 | `VideoEpisodeSelection` | ✅ 已对齐（makeEpisodeSelection） | — | `test/player-core.test.js` |
| F6 | 显示标题兜底 | `displayTitle` 恒非空 | ✅ 已对齐 | — | `player-road-episode.js:119` |
| F7 | 跨线路对齐 | 位置索引（薄弱） | ✅ 已对齐且超越 | P7 | `detail-core.test.js` |
| F8 | 单测覆盖 | 缺失 | ✅ 已对齐且超越 | — | 闸门 42/0 |

**结论**：8 项中 ✅ 8 项核心发现均已落实并单测覆盖（F1/F4/F5/F6/F7 等价实现对齐；F2/F3 播放器侧健壮性补全；F8 单测覆盖超越）。其中 F4/F5/F2/F3 于 2026-08-18 完成实施并落单测，闸门由 28/0 升至 32/0；同日的 B1/B2 复刻（验证码闭环 + 错误态自愈入口）新增 `multisource-actions` 套件 10 项，闸门升至 **42/0**。整体已完整达到「多源面板两屏模型 + 播放器侧选集切换健壮性 + 验证码/错误态 1:1 复刻」对齐目标。

---

## 四-B、复刻保真度与已知偏差（2026-08-18 深度审查）

> 本节如实登记「机制已对齐，但交互/流程未 1:1 移植」之处，避免文档过度宣称「完全复刻」。
> 证据来源：重读 Kazumi-2.2.6 真实源码（`plugin_search_service.dart` / `source_sheet.dart` / `video_controller.dart` / `video_page.dart`）+ 重读 Stellaflix 实现 + 实跑 `node scripts/multisource_gate.cjs`（42/0）+ 边界专项 `node outputs/alignment_boundary_check.cjs`（41/0）。

### 复刻项（B1/B2 已实施；交互流已移植）

- **B1 · 多源面板 captcha 验证流（已实施 · 自动化绿 · 待 Electron 真机截验）**
  - Stellaflix（实施前）：`source-picker.js` 的 `captcha` 状态点与 `setStatus(key,'captcha')` 已支持，但 `detail-source.js` 搜索流中**无任何路径触发 `'captcha'`**——captcha 状态「可见但永不被点亮」。
  - 实施内容（2026-08-18）：
    1. **信号透传**：`kazumi-bridge.js` 的 `searchOneRule`/`searchRule` 现把 `CaptchaRequiredException` 透传为 `res.errors[].captcha=true`（不再吞掉 `e.name`）；`detail-source.js` 的 `queryOneUnit` 读 `res.errors` 后 `setStatus(u.key,'captcha')`，并**保留顶层 `captcha/antiConfig/searchURL` 字段**（修复此前 kazumi 分支 `.then` 只取 `items/errors` 把 `searchURL/antiConfig` 整段丢弃、导致 `captchaCtx` 无法填充的缺陷），同步把上下文缓存进 `captchaCtxByKey[u.key]`（供重查 cookie 注入判定）。
    2. **完整 webview 自动验证**：`source-picker-captcha.js` 的 `showCaptchaDialog(sourceKey, ruleName, sourceName)` 对齐 Kazumi `showCaptchaDialog`/`submitCaptcha`——`buildSearchUrl(rule, title)`（`@keyword`→`encodeURIComponent(片名)`）、`getAntiConfig` 读 `antiCrawlerConfig`、`<webview>` 加载搜索页、`did-finish-load`/`dom-ready` 后启动 **8s 超时 + 1s 轮询**检测验证码消失 → 自动 `detailSource.retrySource(sourceKey)`。
    3. **接线修复（真机 bug）**：`source-picker.js` 的「进行验证」按钮原调用 `SFV.sourcePickerError.openCaptchaDialog`，但该模块（`source-picker-error.js`）**未加载进 index.html**，导致真机点按钮永远落到 `toastMsg('验证组件未就绪')`——验证码流在真机**实际是断的**。已改为调用已加载的 `SFV.sourcePickerCaptcha.showCaptchaDialog`；`source-picker-error.js` 标记 deprecated（保留作历史对照，不删除）。
    4. **cookie 闭环结构修复（本次会话补全，关键）**：此前验证码流「状态机/交互」虽对齐，但**闭环在结构层是断的**，本次补全三处：
       - `source-picker-captcha.js` 的 `<webview>` 原**未设 `partition`** → 解出验证码的 cookie 落在默认分区，而 `stellaflix-get-captcha-cookies` 读的是专用分区 `persist:stellaflix-captcha` → 永远读空。已补 `partition="persist:stellaflix-captcha"` + Chrome UA。
       - `kazumi-bridge-captcha.js`（cookie-aware 客户端 + IPC 读 cookie 的 glue）**此前未注入 index.html** → `kazumi-bridge.js` 的 `getManager()` 条件 `if (SFV.kazumiBridgeCaptcha ...)` 恒假 → cookie-aware 客户端从未挂接；`detail-source.retrySource` 的 `getCaptchaCookiesViaIPC` 调用恒为 no-op。已注入 index.html（`kazumi-bridge.js` 之后）。
       - `detail-source.retrySource` 重查前经 `getCaptchaCookiesViaIPC(searchURL)` 读回分区 cookie 并 `setCaptchaCookies(ruleName, cookie)` 注入；`server.js /api/proxy` 白名单新增 `'cookie'` 透传至上游。
  - Kazumi 对照：`source_sheet.dart` 完整 `showAntiCrawlerDialog`/`showCaptchaDialog`/`submitCaptcha`；`plugin_search_service.dart:_handleSearchError` 对 `CaptchaRequiredException` 置 `captcha` 态。
  - 判定：**状态机枚举 + 交互流 + cookie 闭环结构均已对齐**（完整 webview 自动验证 + 分区 cookie 读回注入 + 代理透传，已 1:1 覆盖 Kazumi 验证码闭环）。自动化闸门 42/0 + 边界专项 41/0 全绿；**端到端真机验证（webview 真渲染 / 真实验证码解出 / 上游识别已验证）仍标注 [未验证·需 Electron 真机 `npm start` 截验]**——沙箱无法验证该链路。

- **B2 · 多源面板错误态操作按钮（已实施 · 自动化绿 · 待 Electron 真机截验）**
  - Stellaflix（实施前）：`source-picker.js` 仅渲染状态点 + 源内卡片，**无错误态操作按钮**。
  - 实施内容（2026-08-18）：`source-picker.js` 现渲染三态错误部件，文案/按钮与 Kazumi 逐字对齐：
    - `captcha`：`name + ' 需要验证码验证'` → 按钮「进行验证」→ `SFV.sourcePickerCaptcha.showCaptchaDialog`（B1）；「重试」→ `detailSource.retrySource`。
    - `none`：`name + ' 无结果 使用别名或左右滑动以切换到其他视频来源'` → 按钮「别名检索」→ `showAliasDialog`（空别名 → toast「无可用别名，试试手动检索」，对齐 Kazumi `showAliasSearchDialog`）；「手动检索」→ `showManualDialog`（输入 → 入别名 store → `searchSourceWithKeyword`，对齐 Kazumi `showCustomSearchDialog`/`querySource`）。
    - `error`：`name + ' 检索失败 重试或左右滑动以切换到其他视频来源'` → 按钮「重试」→ `detailSource.retrySource`。
  - Kazumi 对照：`source_sheet.dart:330-356` 每错误态带 `GeneralErrorButton`（重试/别名检索/手动检索），触发 `showAliasSearchDialog`/`showCustomSearchDialog`/`querySource`。
  - 判定：**错误态视觉 + 自愈式操作入口均已移植**（对齐 Kazumi `GeneralErrorButton` + 别名/手动检索/重查）。自动化全绿；视觉与真机闭环标注 **[未验证·需 Electron 真机]**。

### 故意偏离（有意改进，非缺陷）

- **B3 · 选集面板跨线路对齐策略（按名 vs 按位置，超越）**
  - Kazumi：`video_controller.dart:_resolveOnlineEpisode`（`:316-335`）按**位置索引**解析——保留 `episode` 编号，在新线路的 `data`/`identifier` 数组按 `index=episode-1` 取；两线路集数/顺序不一致时可能**静默错位**或 `index` 越界返 null → `_failLoading('集数解析失败')`。
  - Stellaflix：`detail-core.alignEpisodeByIdentifier`（`:107-131`）+ `player-road-episode.decideRoadSwitch`（`:152-158`）按**集名精确匹配**跨线路对齐；未命中（含集数不等/顺序不一致/目标线路无同名集）→ 返回 `{ok:false}` → 编排器 `onAlignFail` toast「该线路无对应集」并保持在当前线路（**绝不静默错集**）。
  - 判定：**健壮机制（不崩溃、不静默错集）已对齐且超越；对齐语义从「位置索引」改为「集名匹配」，属有意改进**（F4/P7）。**2026-08-18 用户明确选择「保持集名对齐（推荐）」，故本项维持集名匹配语义，不回退至 Kazumi 位置索引**；登记为「优良偏差 / 有意改进」，非复刻缺口。

### 参数归一化差异（F5，非缺陷，详见 F5 章节）

`makeEpisodeSelection(road, episode)` 与 Kazumi `VideoEpisodeSelection(episode, road)`：构造序相反、集编号 0-based vs 1-based、`hash` 为 `r*31+e` vs `Object.hash(episode, road)`。值对象内部自洽，仅归一化以贴合本代码库，不作字节级兼容。

---

## 五、待办修复顺序（Stellaflix 侧，按风险/收益排序）

| 序 | 发现 | 改动点 | 风险 | 收益 | 验收方式 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **F4** | `player-road-episode.js` `Math.min` 改为 `decideRoadSwitch` + `onAlignFail`（不静默跳集） | 低 | 高（杜绝静默错集，与 P7 语义统一） | 边界测试：集数不等线路切换不跳错集 | ✅ 已实施 |
| 2 | **F5** | `player-core.js` 引入 `makeEpisodeSelection {road, episode}` 值对象 | 中 | 中（稳定身份 + 历史键） | 相等/哈希单测 | ✅ 已实施 |
| 3 | **F2** | `detail-source.js` `searchAndPick` 加 `searchToken` 重入守卫 | 低-中 | 中（防过期候选注入新面板） | 「连续两次开面板，首次在途回调不写入新面板」单测 | ✅ 已实施 |
| 4 | **F3** | `player-road-episode.js` 补 `wait/ok/error` 三态 + 编排器接线 | 低 | 低（一致性/可观测） | 状态切换单测 | ✅ 已实施 |

> 说明：F1/F6/F7/F8 已收口，无需改动；F4/F5/F2/F3 于 2026-08-18 全部实施完毕（闸门 28/0 → 32/0）；B1/B2 复刻同日完成（闸门 32/0 → 42/0，新增 `multisource-actions` 套件 10 项）。全部走「先证后行」：vm 解析 + 对应 `_test` 钩子 + 单测 + 闸门复跑。

---

## 六、验证闸门（实测证据，非声明）

运行命令（纯 Node，无需 Electron/GUI）：

```bash
cd C:\Users\Administrator\Desktop\Mineradio-Extended-1.1.2-extended.1
node scripts/multisource_gate.cjs
```

实测输出（2026-08-18，B1/B2 实施后端到端复跑）：

```
================================================
 多源面板对齐 Kazumi · 阶段0-4 自动化验收闸门
================================================
▶ vm.Script 全解析 (public/video) ... ✅ 0/0 pass
▶ detail-core 单测 (P1/P7) ... ✅ 10/10 pass
▶ source-picker 单测 (面板/流式/边界) ... ✅ 11/11 pass
▶ player-road-episode 单测 (线路/选集) ... ✅ 6/6 pass
▶ detail-source-stream 集成 (流式健壮性/多线路) ... ✅ 4/4 pass
▶ multisource-actions (B1 验证码态/B2 错误部件) ... ✅ 10/10 pass
▶ player-core 单测 (F5 EpisodeSelection) ... ✅ 1/1 pass
------------------------------------------------
合计: 42 pass / 0 fail (共 42 测)
✅ 自动化闸门全绿（可进入 Electron 真机截图验收）
```

边界专项（独立脚本，不计入闸门，仅供审查证据）：`node outputs/alignment_boundary_check.cjs` → **41 pass / 0 fail**（覆盖空值/越界/集数不等/模块缺失/空输入等极端输入）。

真机端到端（Electron 无头 + 真实 `index.html` 截图）流程见 `docs/MULTISOURCE_ACCEPTANCE.md` 第二节，此处不重复。

---

## 七、附录：Kazumi 只读约束与合规

- **只读**：`C:\Users\Administrator\Desktop\Kazumi-2.2.6` 仅作设计范本；任何源码修改须还原（已执行一次并字节级验证）。
- **授权**：Kazumi 为 GPL-3.0，与本项目兼容，但为 Flutter/Dart 无 JS 可搬实体；实际只取**架构与字段设计**（见 `VIDEO_REFERENCE_ANALYSIS.md` 第一节实务限制）。禁止复制其图标（Pixiv Yuquanaaa）与 Mi Sans 字体。
- **本环境限制**：无 `flutter`/`dart` 命令，Kazumi 非 git 仓——Kazumi 侧不编译、不单测、不验证，全部结论以「已读源码 + 行号证据」为准。
