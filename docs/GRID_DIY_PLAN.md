# 网格 DIY 功能实现计划

> 版本：v2.0 | 日期：2026-08-03 | 状态：需求复述完毕，待用户确认后生成代码

---

## ⚠️ v2.1 修订（2026-08-03 13:14 用户纠正 + 确认）

用户发出 0–8 号纠正并随后经 AskUserQuestion 确认，已推翻 v2.0 部分决策：

1. **列数策略反转**：原「固定列数 2–8、无响应式」作废 → 改为 **完全按 KVideo 断点自适应（2→6 列随屏宽）**。
   后果：移除「每行列数 / 卡片最小宽度」两个滑块，网格布局子 Tab 仅保留「卡片间距」滑块（原 6.1 表两行作废）。
2. **index.html 零改动（铁律）**：本轮曾误加 `<script src="video/grid-diy.js">`，已**回退**（脚本标签不复存在）。
   影视业务改动一律只在 `public/video/*`，不得写入 index.html。
3. **电影/动漫 分页改为「先占位、后改造」**：
   - 用户截图确认这两页网格「当前没有在渲染」（实际是 nav 直接 open() 进空搜索态）。
   - 本轮（q-2「仅做占位页」）已交付：online.js 新增 `renderPlaceholder()`，handleNavAction 的 movie/anime 改走 `open({mode:'placeholder'})`，player.css 新增 `.sfv-placeholder` + `.sfv-browse--placeholder`（隐藏自带搜索栏/操作按钮）。
   - 原有 renderCategory/renderGrid（心动/片单/收藏/历史）**不受影响**（#0「别的分页都不变」）。
4. **DIY 网格改造整体延后**至后续轮次（本轮回退，仅占位）：
   - lyrics tab 面板（18 色 / KVideo+Mineradio 外壳 / 卡片标题连线）暂不实现；
   - q-1「复用现有歌词控件驱动卡片标题字体/颜色」、q-3「18 色用歌词 tab 源码真实值」仍作为后续方案基础；
   - `public/video/grid-diy.js`、`player.css` 的 13 个 `--sfv-*` 变量、`online.js` 的 `applyGridDiyToBody()` **保留为休眠脚手架**（index.html 未加载 grid-diy.js，故运行时零生效），待后续轮次重新接线。

> 后续 DIY 轮次启动前，请先更新本计划第三~六节（列数改断点自适应、布局子 Tab 只剩间距滑块），
> 再进入 Craft 模式。本轮交付物仅占位页 + index.html 回退。

---

## 一、功能概述

在影视控制台的 **lyrics（歌词）内置 tab** 中新增「网格外观 DIY」折叠分区，允许用户在影视态实时调整浏览页（电影/动漫分页）的 **页面背景**、**卡片外壳风格**、**网格布局** 三大类参数。

### 核心原则（已确认）
- **默认值 = KVideo 参数**（开箱即获 KVideo 级视觉）
- **localStorage 持久化**（个人偏好，key: `stellaflix-grid-diy-prefs`）
- **作用域 = 卡片外壳区域**（含海报 24px 内边距边缘），不触动播放器主玻璃系统
- **实时预览**（参数变化立即反映到当前网格，无需刷新）
- **海报比例写死 2:3**（删除独立的[海报比例]子 Tab，不再提供切换）
- **页面背景 DIY 与 卡片外壳 DIY 完全独立**

---

## 二、挂载位置（共存，非替换）

```
fx-panel (控制台)
 └─ #fx-panel-tabs: [presets][appearance][lyrics][motion][advanced][片源]
 └─ #fx-panel
     └─ .fx-tab-page[data-fx-page="lyrics"]   ← 目标位置
         ├─ (原有歌词相关内容，影视态下保留，不隐藏)
         └─ [新增] .sfv-grid-diy               ← 追加折叠分区
              ├─ 折叠标题栏：「网格外观 DIY ▸」
              └─ 展开内容（三个子 Tab）
```

> 共存约束：原有歌词设置内容保持原样，DIY 面板作为同一页面内的**追加折叠分区**。
> DIY 面板始终存在于 lyrics tab 的 DOM 中；其参数仅在影视态的浏览网格上产生可见效果。

---

## 三、三个子 Tab 结构

```
┌──────────────────────────────────────────────┐
│ [ 页面背景 ] [ 卡片外壳 ] [ 网格布局 ]        │  ← 子 Tab 栏
└──────────────────────────────────────────────┘
```

- ❌ 已删除「海报比例」子 Tab → 海报比例锁死 `aspect-ratio: 2/3`（写死在 `--sfv-poster-ratio`）。

---

## 四、Tab 1 — 页面背景

### 4.1 默认值与 AUTO
- **默认值**：`#f2f4f7`（KVideo 浅灰白页面背景）
- **AUTO 按钮**：`prefers-color-scheme` 自动（明/暗）

### 4.2 18 个预制色块（来自歌词 tab 的 `lyricColorPresets`，index.html:22464，已核对源码）

> 说明：这 18 色即控制台歌词 tab 中已有的配色预设，用户确认「在歌词 tab 里面就有」，
> 故直接复用其真实 HEX 值（非截图近似）。排列沿用原数组顺序。

| # | 名称 | HEX | 色系 |
|---|------|-----|------|
| 1 | 雾蓝 | `#a9b8c8` | 冷灰蓝 |
| 2 | 银蓝 | `#9db8cf` | 冷蓝灰 |
| 3 | 冰川 | `#7ec8d8` | 浅青 |
| 4 | 青绿 | `#66d2b5` | 青绿 |
| 5 | 松针 | `#7fa894` | 灰绿 |
| 6 | 月白 | `#d7d2c4` | 暖米灰 |
| 7 | 岩金 | `#c3ae7c` | 暖金 |
| 8 | 琥珀 | `#d9a45f` | 暖橙 |
| 9 | 暮粉 | `#c78aa4` | 粉 |
| 10 | 玫红 | `#d76a8d` | 玫红 |
| 11 | 烟紫 | `#9b83d3` | 紫 |
| 12 | 电紫 | `#8d70ff` | 亮紫 |
| 13 | 靛蓝 | `#5e78d8` | 蓝 |
| 14 | 海蓝 | `#3c9fe0` | 蓝 |
| 15 | 霓青 | `#28c5c3` | 青 |
| 16 | 夜绿 | `#245c49` | 墨绿 |
| 17 | 酒红 | `#6d1f35` | 酒红 |
| 18 | 墨黑 | `#111318` | 暗黑 |

### 4.3 自定义 + 重置
- `<input type="color">` 自由选色 + 透明度滑块
- 「重置为 KVideo 默认」→ 恢复 `#f2f4f7`
- **独立性**：仅控制 `.sfv-browse-body` 的 `background-color`，与卡片外壳互不干扰

---

## 五、Tab 2 — 卡片外壳

### 5.1 一键主题切换（二选一预设）

| 选项 | 说明 | 视觉特征 |
|------|------|---------|
| **KVideo 玻璃** | 白底浅灰半透明 + 深色文字 + 大圆角 + 海报 24px 内边距 | 浅色液态玻璃 |
| **Mineradio 玻璃** | 复用现有 `--glass-*` + 青色强调 + 全出血海报 | 暗青玻璃（当前默认外观）|

> 一键切换 = 一次性写入下方全部变量为对应预设值；**之后仍暴露全部颜色参数供微调**。

### 5.2 全部可 DIY 参数（颜色 + 几何）

| 参数 | KVideo 预设值 | Mineradio 预设值 | 范围 | CSS 变量 |
|------|--------------|-----------------|------|----------|
| 容器背景 | `rgba(255,255,255,0.95)` | `rgba(255,255,255,0.04)` | 颜色+透明度 | `--sfv-card-bg` |
| 容器边框色 | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.09)` | 颜色+透明度 | `--sfv-card-border` |
| 容器圆角 | `24px` | `14px` | 0–32px | `--sfv-card-radius` |
| 阴影色 | `rgba(0,0,0,0.05)` | `rgba(0,0,0,0.30)` | 颜色+透明度 | `--sfv-card-shadow-color` |
| Hover 边框色 | `rgba(0,86,179,0.5)` | `rgba(0,245,212,0.5)` | 颜色+透明度 | `--sfv-card-hover-border` |
| **海报内边距** | `24px`（海报 24px 边缘） | `0px`（全出血） | 0–32px | `--sfv-card-padding` |
| 标题文字色 | `#1c1c22` | `rgba(255,255,255,0.92)` | 颜色 | `--sfv-card-title` |
| 副标题色 | `rgba(28,28,34,0.62)` | `rgba(255,255,255,0.5)` | 颜色 | `--sfv-card-sub` |

> 每个颜色参数 = `<input type="color">` + 透明度 `<input type="range">` 组合控件。
> 默认外壳主题 = **KVideo**（满足「默认 = KVideo 参数」）。

### 5.3 重置
「重置为 KVideo 默认」→ 一键恢复上表 KVideo 列全部值。

---

## 六、Tab 3 — 网格布局

### 6.1 参数（固定列数，无响应式断点）

| 参数 | 默认值 | 范围 | 步长 | CSS 映射 |
|------|--------|------|------|---------|
| 每行列数 | `5`（KVideo 首页等效：5 列 × 1920px） | 2–8 | 1 | `grid-template-columns: repeat(var(--sfv-cols), minmax(var(--sfv-min), 1fr))` |
| 卡片最小宽度 | `180px`（5 列 × 1920px 推算） | 120–280px | 10px | `minmax(var(--sfv-min), 1fr)` |
| 卡片间距 | `24px`（KVideo lg+ 等效） | 8–48px | 4px | `gap` |

> **固定列数语义**：用户选几列就是几列，不做视口断点自适应；
> 当 `列数 × 最小宽度 > 视口` 时网格横向溢出（可滚动），而非回流。
> 海报比例固定 2:3（见 `--sfv-poster-ratio`，不在此 Tab 调节）。

### 6.2 重置
「重置为 KVideo 默认」→ 列数=5、最小宽度=180px、间距=24px。

---

## 七、技术实现方案

### 7.1 新增文件 `public/video/grid-diy.js`（约 350 行）
1. 构建 DIY 面板 HTML 并注入 lyrics tab 页面（`.sfv-grid-diy` 折叠分区）
   - **注入时机**：`.fx-tab-page[data-fx-page="lyrics"]` 由 `organizeFxPanel()`（位于 `bindFxPanel()`，index.html:26563）动态创建。
     故 grid-diy.js 用 `requestAnimationFrame` 轮询定位该页面后再追加（带去重标志防重复注入），
     避免被重组逻辑误移动；index.html 零改动。
2. 三个子 Tab 切换逻辑
3. 颜色选择器 + 透明度滑块 + 数值滑块绑定
4. 参数变更 → 写入 `.sfv-browse-body` CSS 变量 → 网格实时重绘
5. localStorage 读写（`stellaflix-grid-diy-prefs`）
6. 重置按钮 + 一键主题切换（KVideo / Mineradio）
7. 启动时从 localStorage 恢复并应用

**localStorage 数据结构（v1）**：
```json
{
  "version": 1,
  "pageBg": { "color": "#f2f4f7", "mode": "default" },
  "shell": {
    "theme": "kvideo",
    "bg": "rgba(255,255,255,0.95)",
    "border": "rgba(0,0,0,0.06)",
    "radius": 24,
    "shadowColor": "rgba(0,0,0,0.05)",
    "hoverBorder": "rgba(0,86,179,0.5)",
    "padding": 24,
    "title": "#1c1c22",
    "sub": "rgba(28,28,34,0.62)"
  },
  "grid": { "columns": 5, "minWidth": 180, "gap": 24 }
}
```
> 海报比例不入库（写死 2:3）。

### 7.2 修改文件
**`public/video/player.css`**（新增约 80 行）：
```css
.sfv-browse-body {
  --sfv-page-bg: #f2f4f7;
  --sfv-card-bg: rgba(255,255,255,0.95);
  --sfv-card-border: rgba(0,0,0,0.06);
  --sfv-card-radius: 24px;
  --sfv-card-shadow-color: rgba(0,0,0,0.05);
  --sfv-card-hover-border: rgba(0,86,179,0.5);
  --sfv-card-padding: 24px;
  --sfv-card-title: #1c1c22;
  --sfv-card-sub: rgba(28,28,34,0.62);
  --sfv-cols: 5;
  --sfv-min: 180px;
  --sfv-gap: 24px;
  --sfv-poster-ratio: 2 / 3;   /* 写死 */
  background-color: var(--sfv-page-bg);
}
.sfv-grid { display:grid; grid-template-columns: repeat(var(--sfv-cols), minmax(var(--sfv-min),1fr)); gap: var(--sfv-gap); }
.sfv-card {
  background: var(--sfv-card-bg);
  border: 1px solid var(--sfv-card-border);
  border-radius: var(--sfv-card-radius);
  padding: var(--sfv-card-padding);
  box-shadow: 0 10px 30px var(--sfv-card-shadow-color);
}
.sfv-card:hover { border-color: var(--sfv-card-hover-border); }
.sfv-card-cover { aspect-ratio: var(--sfv-poster-ratio); }
.sfv-card-name { color: var(--sfv-card-title); }
.sfv-card-sub  { color: var(--sfv-card-sub); }
```

**`public/video/online.js`**（约 15 行）：
- `openBrowse()` 渲染前读取 localStorage，将 DIY 变量写入 `.sfv-browse-body`
- 确保影视态浏览容器挂载到带有上述变量的元素上

### 7.3 不修改
- ❌ `public/index.html`（影视业务零改动，仅挂载点/钩子）
- ❌ `desktop/`（无需主进程改动）

---

## 八、验收标准

1. **[P0]** lyrics tab 内正确渲染 DIY 折叠分区（三子 Tab + 全部控件），原有歌词内容共存不丢失
2. **[P0]** 一键「KVideo 玻璃 / Mineradio 玻璃」切换后卡片视觉立即切换，且仍可微调全部颜色
3. **[P0]** 调整列数/最小宽度/间距/圆角等参数后网格**实时响应**无需刷新
4. **[P0]** 关闭重开，参数保持（localStorage 生效）
5. **[P0]** 任一「重置」恢复对应 KVideo 默认值
6. **[P1]** 页面背景 18 色预制 + #f2f4f7 默认 + AUTO 均生效，且与卡片外壳独立
7. **[P1]** 海报固定 2:3，图片不失真
8. **[P1]** 音乐态下歌词 tab 原有功能不受影响
9. **[P2]** 颜色控件的 color input + 透明度滑块联动正常
10. **[P2]** 极端参数（列数 2/8、间距 8/48、圆角 0/32、最小宽度 120/280）不崩溃不异常溢出

---

## 九、待用户最终确认项

| # | 事项 | 当前方案 | 状态 |
|---|------|---------|------|
| 1 | 需求复述完整性 | 已覆盖：挂载(lyrics tab 共存)、三子 Tab、18 真实色、KVideo/Mineradio 一键+全暴露、固定列数、min 180、默认 2:3 | 待确认 |
| 2 | 导入/导出配置 | v1 暂不实现 | 待确认 |
| 3 | Mineradio 玻璃是否暴露全部颜色 | **是**（一键预设 + 仍可微调全部参数）— Request 8 已定 | 已定 |
| 4 | 网格列数响应式 | **固定列数，无断点自适应** — Request 8 已定 | 已定 |
| 5 | 「海报 24px 边缘」解释 | 实现为卡片**内部 padding**（`--sfv-card-padding`，KVideo=24px / Mineradio=0px） | 待确认 |
| 6 | 默认页面背景为浅白 #f2f4f7 | 即 KVideo 白底风格，影视态浏览页默认浅色（与音乐态暗色并存） | 待确认 |

*确认后进入 Craft 模式生成 `grid-diy.js` + `player.css` 改动 + `online.js` 改动。*
