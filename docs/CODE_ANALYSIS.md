# StellaFlix 代码分析报告

## 📁 项目结构总览

```
stellaflix/
├── app/                    # Next.js App Router 页面
│   ├── (auth)/            # 认证页面
│   ├── (main)/            # 主要页面
│   ├── admin/             # 管理后台（不需要）
│   └── api/               # API 路由
├── components/            # React 组件
└── lib/                   # 工具库
```

---

## 📋 文件分类与作用

### ✅ 核心功能（保留）

| 文件 | 作用 | 说明 |
|------|------|------|
| `app/(main)/page.tsx` | 首页 | 电影列表展示 |
| `app/(main)/movies/[id]/page.tsx` | 电影详情页 | 展示电影信息 |
| `app/(main)/movies/[id]/play/page.tsx` | 播放页面 | 视频播放 |
| `app/api/video/search/route.ts` | 视频搜索 API | CMS 源搜索 |
| `app/api/video/parse/route.ts` | 视频解析 API | 解析播放地址 |
| `lib/video-sources-list.ts` | 视频源列表 | 暴风/量子/非凡 |
| `lib/video-parsers/cms-parser.ts` | CMS 解析器 | 解析 CMS 视频源 |
| `lib/video-parsers/index.ts` | 视频源管理器 | 多源聚合 |
| `components/MovieCard.tsx` | 电影卡片 | 电影展示 |
| `components/SimpleVideoPlayer.tsx` | 视频播放器 | HLS 播放 |
| `components/Header.tsx` | 导航栏 | 页面导航 |
| `components/HomeSearchBar.tsx` | 搜索框 | 首页搜索 |

### 🗑️ 冗余代码（删除）

| 文件 | 作用 | 删除原因 |
|------|------|----------|
| `app/admin/*` | 管理后台 | 不需要 |
| `app/api/test-*` | 测试 API | 开发测试用 |
| `app/api/scraper/*` | 爬虫 API | TMDB 无法访问 |
| `lib/scraper/*` | 爬虫库 | TMDB 无法访问 |
| `lib/tmdb.ts` | TMDB API | 中国大陆无法访问 |
| `components/MovieSearch.tsx` | TMDB 搜索 | 无法访问 |
| `components/CmsSourceTest.tsx` | 测试组件 | 开发测试用 |

### ⚠️ 待优化代码

| 文件 | 问题 | 优化方案 |
|------|------|----------|
| `app/api/proxy/image/*` | 图片代理失败 | 简化处理 |
| `lib/video-sources/*` | 与 video-parsers 重复 | 合并 |
| `app/(main)/test-source/*` | 测试页面 | 删除 |

---

## 🎯 确定方案

### 核心架构
1. **CMS 视频源**：暴风影视、量子资源、非凡资源
2. **搜索功能**：通过 CMS API 搜索电影
3. **播放功能**：解析 m3u8 链接播放

### 删除列表
- 所有 admin 页面
- 所有 test API
- TMDB 相关代码
- 爬虫相关代码
- 重复的视频源解析代码

### 优化列表
- 简化 MovieCard（移除 TMDB 图片依赖）
- 优化首页（移除无法显示的封面）
- 清理不必要的依赖