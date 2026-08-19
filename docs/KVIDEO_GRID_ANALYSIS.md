# KVideo 网格卡片系统 — 完整逆向分析

> 数据来源：https://kvideo.pages.dev/ + https://github.com/KuekHaoYang/KVideo
> 分析日期：2026-08-03
> 用途：Stellaflix「电影」「动漫」分页网格改造参考

---

## 一、技术栈总览

| 层面 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.1.7 |
| UI库 | React | 19.2.4 |
| 样式 | Tailwind CSS (utility-first) | v4 |
| 语言 | TypeScript | 5.x |
| 状态 | Zustand | 5.x |
| 图标 | Lucide React | 0.x |
| 设计语言 | **Liquid Glass**（液态玻璃） | 自研 |

**许可证：MIT**（可自由借鉴设计模式，但代码不能直接复制需重写）

---

## 二、栅格布局参数

### 2.1 首页 MovieGrid（`components/home/MovieGrid.tsx`）

```
grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5
gap-4 md:gap-6
```

| 断点 | 列数 | 间距 | 适用场景 |
|------|------|------|----------|
| < 640px | 2 列 | 16px (gap-4) | 手机竖屏 |
| ≥ 640px | 3 列 | 16px | 手机横屏/小平板 |
| ≥ 768px | 4 列 | 24px (md:gap-6) | 平板 |
| ≥ 1024px | 5 列 | 24px | 桌面（截图所见状态）|

### 2.2 搜索 VideoGrid（`components/search/VideoGrid.tsx`）

```
grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4
lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6
gap-3 md:gap-4 lg:gap-6 max-w-[1920px] mx-auto
```

| 断点 | 列数 | 间距 |
|------|------|------|
| < 640px | 2 | 12px |
| ≥ 640px | 3 | 12px |
| ≥ 768px | 4 | 16px |
| ≥ 1024px | 5 | 24px |
| ≥ 1280px | **6** | 24px |
| ≥ 1536px | **6** | 24px |

### 2.3 无限滚动策略

- **IntersectionObserver** 触发加载，rootMargin: 400px
- **每批 24 条**（visibleCount += 24）
- 预取触发器在更早位置（prefetchRef）
- 支持滚动位置记忆（sessionStorage + URL key）

---

## 三、MovieCard 卡片解剖

### 3.1 DOM 结构

```
<Link>  ← 外层包裹，hover: translateY(-2px)
  └─ <Card>  ← 玻璃容器（p-0 覆盖，无内边距）
       ├─ <div aspect-[2/3]>  ← 海报区域（2:3 竖版比例）
       │    ├─ <Image>  ← object-cover, hover:scale-105
       │    ├─ [评分徽章]  ← absolute top-2 right-2
       │    └─ [占位符]  ← 图片失败时降级显示
       └─ <div pt-3>  ← 标题区域
            └─ <h3>  ← text-sm, line-clamp-2, text-center
```

### 3.2 尺寸规格表

| 参数 | 值 | 说明 |
|------|-----|------|
| **宽高比** | `aspect-[2/3]` | 竖版海报比例（如 200×300px） |
| **圆角** | `var(--radius-2xl)` = `1.5rem` = **24px** | 统一圆角令牌 |
| **内边距** | `p-0` | MovieCard 覆盖 Card 默认 p-4 |
| **阴影(静止)** | `0 2px 8px var(--shadow-color)` | 极轻微浮起 |
| **阴影(Hover)** | `0 8px 24px var(--shadow-color)` | 明显浮起 + 扩散 |
| **Hover 位移** | `translateY(-2px)` | 上浮 2px |
| **Hover 时长** | `200ms ease-out` | 快速响应 |
| **图片缩放** | `group-hover:scale-105` | 300ms 缓动 |
| **Z-index** | 默认 1 → hover 时 100 | 防止遮挡相邻卡片 |
| **contentVisibility** | `auto` | 浏览器渲染优化 |
| **标题字号** | `text-sm` (14px) | font-semibold |
| **标题行数** | `line-clamp-2` | 最多 2 行截断 |
| **标题对齐** | `text-center` | 居中 |
| **标题颜色变化** | `group-hover:text-[var(--accent-color)]` | hover 变主题色 |

### 3.3 Card 基础组件（`ui/Card.tsx`）

```
背景:     bg-[var(--glass-bg)]        亮: rgba(255,255,255,0.95) / 暗: rgba(30,30,30,0.9)
边框:     border-[var(--glass-border)] 亮: rgba(0,0,0,0.05) / 暗: rgba(255,255,255,0.1)
圆角:     rounded-[var(--radius-2xl)]   24px
阴影:     shadow-[0_2px_8px_var(--shadow-color)]
          md:shadow-[var(--shadow-md)]  = 0 4px 6px
Hover:    translateY(-2px) + shadow[0_8px_24px]
注意:     blur 功能已全局禁用（CSS override），仅保留结构
```

---

## 四、评分徽章（Rating Badge）

仅首页 MovieCard 有，搜索 VideoCard 用源标签+分辨率徽章替代。

| 参数 | 值 |
|------|-----|
| 位置 | `absolute top-2 right-2`（右上角内边距 8px） |
| 背景 | `bg-black/80` → hover `bg-black/90` |
| 内边距 | `px-2.5 py-1.5`（水平10px，垂直6px） |
| 圆角 | `rounded-full`（9999px，完整胶囊形） |
| 内容 | ★ 图标(12px, yellow-400 fill) + 评分数字(xxs, white, bold) |
| Hover | `hover:scale-105` + shadow-md |
| 点击 | `stopPropagation` → 新窗口打开豆瓣详情页 |
| Z-index | z-20（高于海报图） |

---

## 五、分类切换胶囊（PopularFeatures）

### 5.1 视觉规格

```
外容器: w-80 (320px) · p-1 · rounded-full · backdrop-blur-2xl
背景:   bg-[var(--glass-bg)] · border glass-border · shadow-lg · ring-white/10
滑块:   absolute · w-[calc(50%-4px)] · bg-accent · rounded-full
        transition: transform 400ms cubic-bezier(.4,0,.2,1)
        shadow: [0_0_15px_rgba(0,122,255,0.4)]
按钮:   py-2.5 · text-sm · font-bold · 相对 z-10
选中:   text-white
未选中: text-secondary → hover:text-color
```

### 5.2 分类选项

当前实现只有两个：
- **电影** (`contentType='movie'`)
- **电视剧** (`contentType='tv'`)

> ⚠️ **没有独立的「动漫」tab**。动漫内容通过豆瓣 tag 筛选（如「动画」、「日本动画」等用户自定义标签）混在电影/电视剧流中展示。我们需要自行扩展第三个 tab。

### 5.3 Tag 筛选系统

- 用户可自定义标签（TagManager）
- 内置默认标签：热门、经典、科幻、爱情、动作、喜剧、动画等
- 支持「为你推荐」（个性化，需 2+ 观看历史）
- 标签支持拖拽排序、增删
- 高级标签跳转 `/premium`

---

## 六、CSS 设计令牌（Design Tokens）

### 6.1 亮色模式

```css
--bg-color:              #f2f4f7;         /* 页面背景 */
--text-color:            #1d1d1f;         /* 主文字 */
--text-color-secondary:  #6e6e73;         /* 次要文字 */
--accent-color:          #0056b3;         /* 强调蓝 */
--glass-bg:              rgba(255,255,255,0.95);  /* 玻璃背景 */
--glass-border:          rgba(0,0,0,0.05);        /* 玻璃边框 */
--shadow-color:          rgba(0,0,0,0.05);        /* 阴影色 */
--radius-2xl:            1.5rem;          /* 24px 大圆角 */
--radius-full:           9999px;          /* 胶囊圆角 */
--shadow-md:             0 4px 6px var(--shadow-color);
```

### 6.2 暗色模式

```css
--bg-color:              #121212;
--text-color:            #f5f5f7;
--text-color-secondary:  #8e8e93;
--accent-color:          #1A6DBF;
--glass-bg:              rgba(30,30,30,0.9);
--glass-border:          rgba(255,255,255,0.1);
--shadow-color:          rgba(0,0,0,0.3);
```

---

## 七、与 Stellaflix 的适配要点

### 7.1 可直接借鉴的设计模式

1. **2:3 海报比例** — 影视行业标准，适合我们的 TMDB 海报数据
2. **5列桌面网格** — 与我们现有布局宽度兼容
3. **Hover 微交互组合** — 上浮2px + 阴影扩散 + 图片微缩放（三层叠加效果丰富但不夸张）
4. **评分胶囊徽章** — 右上角半透明黑底 + 星标 + 数字，信息密度高且不遮挡海报
5. **无限滚动 + IntersectionObserver** — 比 pagination 更流畅
6. **Z-index hover 策略** — 解决卡片重叠时的层级问题

### 7.2 需要改造的差异点

| KVideo 原版 | Stellaflix 适配方案 |
|-------------|-------------------|
| Liquid Glass 白底玻璃风 | **暗金玻璃风**（保留 `--glass-*` 语义，映射到我们的黄金质感变量） |
| Tailwind CSS v4 utility | **原生 CSS**（我们的 video/ 模块不用 Tailwind） |
| Next.js Image + fill | **\<img\> 或 background-image**（Electron 环境） |
| 豆瓣数据源 | **TMDB API**（已有集成） |
| 2个分类tab（电影/电视） | **3个导航**（汇联/世界/首页/电影/动漫）— 已有 T96 导航 |
| Zustand 全局状态 | **SFV state.js**（已有双态管理） |
| 蓝色强调色 #0056b3 | **金色 #f5c542**（我们的 --fc-accent-rgb） |
| 圆角 24px (radius-2xl) | **保持或微调**（我们的玻璃风格偏锐利，可能用 12-16px） |
| 无动漫独立 tab | **新增「动漫」tab**（用户明确需求） |

### 7.3 关键文件映射

| KVideo 文件 | Stellaflix 对应 |
|------------|----------------|
| `home/MovieCard.tsx` | `public/video/` 下新建 browse-card 模块 |
| `home/MovieGrid.tsx` | `public/video/` 下新建 browse-grid 模块 |
| `home/PopularFeatures.tsx` | `public/video/online.js` 的 openBrowse() 扩展 |
| `ui/Card.tsx` | 复用现有 `.sfv-card` 或新建 |
| `app/styles/glass.css` | 映射到 `--glass-*` CSS 变量体系 |
| `hooks/usePopularMovies` | 对接 `public/video/tmdb.js` 的 enrichTmdb |

---

## 八、截图视觉实测参数

从用户提供截图（1920×1080 窗口）目测测量：

| 项目 | 实测值 |
|------|--------|
| 可见列数 | **5 列**（lg 断点） |
| 单卡宽度 | ~180-200px（含 gap） |
| 海报高度 | ~270-300px（2:3 比例） |
| 行间距 | ~20-24px |
| 卡片间距（横向） | ~16-20px |
| 评分徽章尺寸 | 约 50×22px |
| 标题区高度 | ~40px（pt-3 + 2行文字） |
| 可见行数 | 4 行（共 20 张卡片） |
| 页面左右边距 | ~32-40px（px-4 ~ px-8） |
| 整体背景 | 浅灰白 #f2f4f7 左右 |

---

*分析完成。下一步：基于此规格设计 Stellaflix 电影/动漫分页的 CSS + JS 实现方案。*
