# 多源面板对齐 Kazumi — 验收清单与真机截图指南

**范围**：阶段0（数据模型根因 P1/P7）→ 阶段1（面板形态）→ 阶段2（流式搜索）→ 阶段3（播放器侧线路/选集切换）→ 阶段4（边界自测）。
**目标**：把 Stellaflix 影视模块「多源面板」对齐 Kazumi `SourceSheet` 的两屏模型——
面板只做「选源 → 选命中 → 跳视频页」；线路(Road)/选集(Episode) 切换下沉到播放器。
**日期**：2026-08-18

---

## 1. 自动化验收闸门（无需 GUI，先行）

运行 `node scripts/multisource_gate.cjs`，一次性收敛阶段0–4 的全部单测/集成测试，输出绿/红闸门。

| 闸门 | 范围 | 已验证基线 |
| --- | --- | --- |
| vm.Script 全解析 | `public/video` 全部脚本 | 0 失败 |
| detail-core 单测 | P1 源隔离 / P7 跨线路对齐 | 10/0 |
| source-picker 单测 | 面板形态 / 流式 / 边界 | 11/0 |
| player-road-episode 单测 | 线路 / 选集切换 | 4/0 |
| detail-source-stream 集成 | 流式健壮性 / 多线路不丢 | 3/0 |
| **合计** | — | **28 pass / 0 fail** |

> 闸门基线随阶段4 收口：阶段4 新增 3 项边界测试（大小写 id 不串台、captcha 蓝点、单源失败不阻断），集成新增多线路 `plays` 透传断言。

**判定标准**：闸门输出 `✅ 自动化闸门全绿` 即为通过；`❌` 则需先修复再进入真机截图。

---

## 2. 真机端到端截图验收（Electron 无头 + 真实 index.html）

为何需要它：vm 沙箱用 mock DOM，无法证明「真实渲染进程里面板/播放器 UI 真的长出节点、状态点 class 真的切换、截图长什么样」。真机验收用真实 Chromium 渲染进程跑真实 `index.html`。

### 2.1 运行方式

```bash
# 需用 electron 入口直接跑（本机 electron 已随 dependencies 安装）
npx electron scripts/multisource_e2e_electron.js
```

脚本行为：
1. 起 `server.js`（PORT=3999）静态托管真实页面；
2. 无头 Chromium 载入 `http://127.0.0.1:3999/index.html`，等 2.5s 启动逻辑；
3. 注入 `multisource_e2e_renderer.js` 探针，按阶段驱动 UI；
4. 主进程在窗口上 `capturePage()` 抓真实 DOM 截图到 `outputs/multisource-e2e/`；
5. 调 `assert()` 读真实 DOM 输出 pass/fail + 控制台报错。

### 2.2 探针阶段与截图

| 阶段 | 操作 | 截图 | 验证点 |
| --- | --- | --- | --- |
| 1 | 开面板（预建 2 源 groups，初始无候选） | `01-panel-empty.png` | 2 个源 Tab（灰等待点）、副标题「未找到播放源」基线 |
| 2 | 流式填充：A 源 appendSource 2 条 → 绿点；B 源 setStatus captcha → 蓝点 | `02-panel-filled.png` | A 源 2 条命中 + 绿点；B 源蓝点；副标题「2 个命中条目」 |
| 3 | 关面板，开播放器侧线路/选集 UI（多线路 fixture） | `03-player-road-episode.png` | 线路下拉 2 选项、选集网格 3 集、`is-current` 落在第2集 |

### 2.3 真机断言清单（`assert()` 输出）

模块挂载：
- M1 `SFV.sourcePicker` 已挂载
- M2 `SFV.playerRoadEpisode` 已挂载
- M3 `SFV.detailSource` 已挂载
- M4 `SFV.playOrchestrator` 已挂载

面板（阶段1/2 真实 DOM）：
- P1 面板渲染出 2 个源 Tab
- P2 源 Tab 条已渲染
- P3 A 源 appendSource 渲染 2 条候选
- P4 A 源状态点为绿（`--ok`）
- P5 B 源状态点为蓝（`--captcha` 验证）
- P6 副标题计数更新为「2 个命中条目」

播放器侧（阶段3 真实 DOM）：
- R1 线路下拉已渲染
- R2 线路下拉含 2 条线路
- R3 当前线路渲染 3 个选集
- R4 恰有 1 个 `is-current` 高亮
- R5 is-current 落在第2集（跨线路对齐基准集）

**判定标准**：真机输出 `✅ 真机端到端全部通过`（M*+P*+R* 全绿），且三张截图存在。

---

## 3. 人工 GUI 验收（真机点击，最终把关）

自动化/无头不能替代真人观感。以下用「真实片源或本地夹具」在 GUI 上走查：

1. **面板形态**：影视详情→播放，多源面板弹出；每源一个 Tab + 状态圆点；点击 Tab 切换源内条目；默认无预置源（合规红线）。
2. **流式等待**：开面板瞬间所有源为「搜索中…」灰点，搜索完成后对应源翻绿/蓝/红（失败源红点且不阻断其它源）。
3. **选源播放**：点击某源某命中「播放 ▸」→ 关闭面板、进入播放器全屏弹层。
4. **线路切换**：多线路影片在播放器侧出现线路下拉；切换线路时按当前集名跨线路对齐续播（集数不等/顺序不一致时提示不静默错集）。
5. **选集网格**：多集影片出现选集网格；当前集 `is-current` 高亮；点击跳集。
6. **边界**：单源单集影片不渲染线路/选集控件（不污染界面）；单源失败不阻断其它源；大小写不同的源 id 不串台（P1 回归）。

**判定标准**：上述 6 项在 GUI 上表现与 Kazumi `SourceSheet` 两屏模型一致、无闪烁/错位/卡顿，且无控制台报错。

---

## 4. 提交与交付物

- `scripts/multisource_gate.cjs` — 阶段0–4 自动化闸门一键运行。
- `scripts/multisource_e2e_electron.js` — 真机无头 Electron 主机（抓真实窗口截图）。
- `scripts/multisource_e2e_renderer.js` — 渲染进程分段探针（驱动 UI + 断言真实 DOM）。
- `docs/MULTISOURCE_ACCEPTANCE.md` — 本验收清单。
- 截图输出：`outputs/multisource-e2e/{01-panel-empty,02-panel-filled,03-player-road-episode}.png`。

> 注：生产代码（detail-core / source-picker / detail-source / player-road-episode / play-orchestrator）改动在阶段0–3 已提交；阶段4 仅新增回归测试（test/source-picker.test.js、test/detail-source-stream.test.js），本验收工具集为独立新增交付物。
