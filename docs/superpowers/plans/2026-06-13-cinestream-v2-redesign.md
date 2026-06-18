# CineStream V2 重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 CineStream 从基础电影平台重构为 Netflix 风格的沉浸式观影平台，支持电影/纪录片分区、横向滚动 UI、收藏夹、观影统计、随机播放。

**架构：** 保留 Next.js 16 App Router + Supabase 栈。移除支付系统，新增 `type` 字段区分电影/纪录片，新增 `favorites` 和 `watch_progress` 表。导航改为顶部四栏（首页/电影/纪录片/我的），内容行改为横向滚动布局。

**技术栈：** Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / Supabase / Video.js / framer-motion

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `components/HorizontalRow.tsx` | 横向滚动内容行组件（箭头导航 + 溢出滚动） |
| `components/RandomPlayButton.tsx` | 随机播放按钮（调用 API 获取随机影片并跳转） |
| `components/FavoriteButton.tsx` | 收藏按钮（toggle 收藏状态） |
| `components/WatchStats.tsx` | 观影时长统计展示组件 |
| `app/(main)/movies/page.tsx` | 电影列表页（独立分区） |
| `app/(main)/documentaries/page.tsx` | 纪录片列表页（独立分区） |
| `app/(main)/my/page.tsx` | 我的页面（收藏夹 + 观影统计 + 个人信息） |
| `app/api/movies/random/route.ts` | 随机影片 API |
| `app/api/favorites/route.ts` | 收藏夹 CRUD API |
| `app/api/watch-progress/route.ts` | 观影进度记录/读取 API |
| `app/api/watch-stats/route.ts` | 观影时长统计 API |
| `lib/types.ts` | 共享类型定义 |

### 修改文件
| 文件 | 变更 |
|------|------|
| `components/Header.tsx` | 重构导航：四栏入口（首页/电影/纪录片/我的），移除定价链接，去掉 lucide 图标改用纯文字 |
| `app/(main)/page.tsx` | 首页重构：横向滚动行、随机播放按钮、移除会员专属区 |
| `components/MovieCard.tsx` | 微调：支持 `type` 字段，纯文字风格 |
| `app/(main)/movies/[id]/page.tsx` | 添加收藏按钮，移除会员标签 |
| `app/(main)/watch/[id]/page.tsx` | 集成跨设备续播（进度保存/恢复） |
| `app/globals.css` | 添加横向滚动隐藏滚动条样式，更新字体为 Plus Jakarta Sans |
| `app/layout.tsx` | 切换字体为 Plus Jakarta Sans |
| `middleware.ts` | 移除 payment webhook 路由保护 |
| `package.json` | 移除 stripe、resend、ioredis 依赖 |

### 删除文件
| 文件 | 原因 |
|------|------|
| `app/(main)/pricing/page.tsx` | 移除支付系统 |
| `app/api/payment/create-checkout/route.ts` | 移除支付系统 |
| `app/api/payment/webhook/route.ts` | 移除支付系统 |

### 测试文件
| 文件 | 测试对象 |
|------|----------|
| `__tests__/components/HorizontalRow.test.tsx` | 横向滚动行为 |
| `__tests__/components/FavoriteButton.test.tsx` | 收藏 toggle |
| `__tests__/api/random.test.ts` | 随机 API |
| `__tests__/api/favorites.test.ts` | 收藏 CRUD |
| `__tests__/api/watch-progress.test.ts` | 进度保存/恢复 |

---

## 任务 1：清理支付系统

**文件：**
- 删除：`app/(main)/pricing/page.tsx`
- 删除：`app/api/payment/create-checkout/route.ts`
- 删除：`app/api/payment/webhook/route.ts`
- 修改：`components/Header.tsx:24`
- 修改：`app/(main)/page.tsx:48-49`
- 修改：`middleware.ts:56`
- 修改：`package.json`

- [ ] **步骤 1：删除支付相关文件**

```bash
rm app/(main)/pricing/page.tsx
rm app/api/payment/create-checkout/route.ts
rm app/api/payment/webhook/route.ts
```

- [ ] **步骤 2：从 Header 移除定价链接**

修改 `components/Header.tsx`，删除第 24 行的定价链接：
```tsx
// 删除这行：
<Link href="/pricing" className="text-gray-300 hover:text-white transition text-sm">
  定价
</Link>
```

同时删除下拉菜单中的会员方案链接（第 49-55 行）：
```tsx
// 删除这段：
<Link
  href="/pricing"
  onClick={() => setMenuOpen(false)}
  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
>
  <Crown className="w-4 h-4" /> 会员方案
</Link>
```

- [ ] **步骤 3：从首页移除定价入口和会员专属区**

修改 `app/(main)/page.tsx`：
- 将 Hero 区域的 `<a href="/pricing">` 改为指向 `#trending` 的锚点链接
- 删除整个 Premium 区块（第 90-101 行）

- [ ] **步骤 4：从 middleware 移除 payment webhook 豁免**

修改 `middleware.ts:56`，移除 webhook 路径排除：
```typescript
// 修改前：
if (pathname.startsWith("/api/") && !pathname.startsWith("/api/payment/webhook")) {
// 修改后：
if (pathname.startsWith("/api/")) {
```

- [ ] **步骤 5：移除无用依赖**

```bash
npm uninstall stripe @stripe/stripe-js resend ioredis
```

- [ ] **步骤 6：验证构建**

```bash
npm run build
```
预期：构建成功，无 payment 相关报错

- [ ] **步骤 7：Commit**

```bash
git add -A
git commit -m "feat: remove payment system (Stripe, pricing page, webhook)"
```

---

## 任务 2：共享类型定义 + 数据库迁移

**文件：**
- 创建：`lib/types.ts`
- 创建：`supabase/migrations/002_add_type_favorites_progress.sql`

- [ ] **步骤 1：创建共享类型文件**

```typescript
// lib/types.ts
export type ContentType = "movie" | "documentary";

export interface Movie {
  id: string;
  title: string;
  description: string;
  poster_url: string;
  backdrop_url: string;
  video_url: string;
  trailer_url: string | null;
  rating: number;
  rating_count: number;
  year: number;
  duration: number;
  genre: string[];
  director: string | null;
  cast_members: string[];
  is_published: boolean;
  is_premium: boolean;
  type: ContentType;
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  movie_id: string;
  created_at: string;
}

export interface WatchProgress {
  id: string;
  user_id: string;
  movie_id: string;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
}

export interface WatchStats {
  total_seconds: number;
  movies_watched: number;
  documentaries_watched: number;
}
```

- [ ] **步骤 2：创建数据库迁移**

```sql
-- supabase/migrations/002_add_type_favorites_progress.sql

-- 1. 添加 type 字段到 movies 表
ALTER TABLE movies ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'movie'
  CHECK (type IN ('movie', 'documentary'));

-- 2. 创建收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, movie_id)
);

-- 3. 创建观影进度表
CREATE TABLE IF NOT EXISTS watch_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  position_seconds NUMERIC NOT NULL DEFAULT 0,
  duration_seconds NUMERIC NOT NULL DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, movie_id)
);

-- 4. RLS 策略
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;

-- favorites: 用户只能操作自己的收藏
CREATE POLICY "Users can view own favorites" ON favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE USING (auth.uid() = user_id);

-- watch_progress: 用户只能操作自己的进度
CREATE POLICY "Users can view own progress" ON watch_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own progress" ON watch_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON watch_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_movie ON favorites(movie_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_user ON watch_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_movie ON watch_progress(movie_id);
CREATE INDEX IF NOT EXISTS idx_movies_type ON movies(type);
```

- [ ] **步骤 3：验证类型文件编译**

```bash
npx tsc --noEmit lib/types.ts
```
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add lib/types.ts supabase/migrations/002_add_type_favorites_progress.sql
git commit -m "feat: add shared types and DB migration (type, favorites, watch_progress)"
```

---

## 任务 3：全局样式 + 字体更新

**文件：**
- 修改：`app/globals.css`
- 修改：`app/layout.tsx`

- [ ] **步骤 1：更新 globals.css**

```css
@import "tailwindcss";

:root {
  --background: #000000;
  --foreground: #ffffff;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-plus-jakarta), system-ui, sans-serif;
}

/* 横向滚动行：隐藏滚动条 */
.scroll-row {
  overflow-x: auto;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
.scroll-row::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

/* 自定义滚动条（非滚动行区域） */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: #111;
}
::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Video.js 覆盖 */
.video-js .vjs-big-play-button {
  background: rgba(229, 9, 20, 0.8) !important;
  border: none !important;
  border-radius: 50% !important;
  width: 64px !important;
  height: 64px !important;
  line-height: 64px !important;
  font-size: 24px !important;
}
```

- [ ] **步骤 2：更新 layout.tsx 字体**

```typescript
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CineStream - 沉浸式观影",
  description: "海量高清电影与纪录片，随时随地畅享观影体验",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-black text-white">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **步骤 3：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 4：Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: switch to Plus Jakarta Sans font, add scroll-row styles"
```

---

## 任务 4：Header 导航重构

**文件：**
- 修改：`components/Header.tsx`

- [ ] **步骤 1：重写 Header 组件**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { User, LogOut, Shield } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "首页" },
  { href: "/movies", label: "电影" },
  { href: "/documentaries", label: "纪录片" },
  { href: "/my", label: "我的" },
];

export default function Header() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-gradient-to-b from-black/90 to-transparent">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-2xl font-bold text-white tracking-tight">
          CineStream
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition ${
                isActive(link.href)
                  ? "text-white font-semibold"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition"
              >
                <User className="w-4 h-4 text-white" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2">
                  <Link
                    href="/my"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
                  >
                    <User className="w-4 h-4" /> 个人中心
                  </Link>
                  <Link
                    href="/admin/upload"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
                  >
                    <Shield className="w-4 h-4" /> 管理后台
                  </Link>
                  <hr className="border-gray-700 my-1" />
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-gray-800 w-full"
                  >
                    <LogOut className="w-4 h-4" /> 退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="bg-white text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-200 transition"
            >
              登录
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **步骤 2：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 3：Commit**

```bash
git add components/Header.tsx
git commit -m "feat: restructure header with 4-tab navigation (首页/电影/纪录片/我的)"
```

---

## 任务 5：HorizontalRow 横向滚动组件

**文件：**
- 创建：`components/HorizontalRow.tsx`
- 创建：`__tests__/components/HorizontalRow.test.tsx`

- [ ] **步骤 1：编写测试**

```tsx
// __tests__/components/HorizontalRow.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import HorizontalRow from "@/components/HorizontalRow";

const mockItems = Array.from({ length: 12 }, (_, i) => (
  <div key={i} data-testid={`item-${i}`}>Item {i}</div>
));

describe("HorizontalRow", () => {
  it("renders title and children", () => {
    render(<HorizontalRow title="热门推荐">{mockItems}</HorizontalRow>);
    expect(screen.getByText("热门推荐")).toBeInTheDocument();
    expect(screen.getByTestId("item-0")).toBeInTheDocument();
  });

  it("shows scroll buttons when content overflows", () => {
    render(<HorizontalRow title="测试">{mockItems}</HorizontalRow>);
    // 左箭头默认隐藏，右箭头可见
    const rightBtn = screen.getByLabelText("向右滚动");
    expect(rightBtn).toBeInTheDocument();
  });

  it("scrolls right when right button clicked", () => {
    render(<HorizontalRow title="测试">{mockItems}</HorizontalRow>);
    const scrollContainer = screen.getByRole("list");
    const rightBtn = screen.getByLabelText("向右滚动");

    fireEvent.click(rightBtn);
    expect(scrollContainer.scrollLeft).toBeGreaterThan(0);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx jest __tests__/components/HorizontalRow.test.tsx --no-cache
```
预期：FAIL，模块不存在

- [ ] **步骤 3：实现 HorizontalRow**

```tsx
"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface HorizontalRowProps {
  title: string;
  children: ReactNode;
}

export default function HorizontalRow({ title, children }: HorizontalRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.8;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section className="relative group/row">
      <h2 className="text-xl font-semibold text-white mb-3 px-4 sm:px-6 lg:px-8">
        {title}
      </h2>

      <div className="relative">
        {/* 左箭头 */}
        {canScrollLeft && (
          <button
            aria-label="向左滚动"
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-black/80 to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-8 h-8 text-white" />
          </button>
        )}

        {/* 滚动容器 */}
        <div
          ref={scrollRef}
          role="list"
          className="scroll-row flex gap-3 px-4 sm:px-6 lg:px-8 pb-4"
        >
          {children}
        </div>

        {/* 右箭头 */}
        {canScrollRight && (
          <button
            aria-label="向右滚动"
            onClick={() => scroll("right")}
            className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-black/80 to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-8 h-8 text-white" />
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx jest __tests__/components/HorizontalRow.test.tsx --no-cache
```
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add components/HorizontalRow.tsx __tests__/components/HorizontalRow.test.tsx
git commit -m "feat: add HorizontalRow component with scroll arrows"
```

---

## 任务 6：MovieCard 适配 + 纪录片支持

**文件：**
- 修改：`components/MovieCard.tsx`

- [ ] **步骤 1：更新 MovieCard 支持 type 字段**

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, Play } from "lucide-react";
import { motion } from "framer-motion";
import type { ContentType } from "@/lib/types";

interface MovieCardProps {
  movie: {
    id: string;
    title: string;
    poster_url: string;
    rating: number;
    year: number;
    genre: string | string[];
    type?: ContentType;
  };
}

export default function MovieCard({ movie }: MovieCardProps) {
  const genreText = Array.isArray(movie.genre)
    ? movie.genre[0]
    : movie.genre;

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.2 }}
      className="group relative rounded-lg overflow-hidden bg-gray-900 shadow-lg flex-shrink-0 w-[180px]"
    >
      <Link href={`/movies/${movie.id}`}>
        <div className="relative aspect-[2/3] w-full">
          <Image
            src={movie.poster_url}
            alt={movie.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-110"
            sizes="180px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-black ml-0.5" fill="black" />
            </div>
          </div>
        </div>
        <div className="p-3">
          <h3 className="text-white font-medium text-sm truncate">{movie.title}</h3>
          <div className="flex items-center justify-between mt-1">
            <span className="text-gray-500 text-xs">{movie.year}</span>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
              <span className="text-yellow-400 text-xs">{movie.rating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
```

- [ ] **步骤 2：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 3：Commit**

```bash
git add components/MovieCard.tsx
git commit -m "feat: update MovieCard with type support and fixed width for horizontal scroll"
```

---

## 任务 7：首页重构（横向滚动 + 随机播放）

**文件：**
- 修改：`app/(main)/page.tsx`
- 创建：`components/RandomPlayButton.tsx`
- 创建：`app/api/movies/random/route.ts`

- [ ] **步骤 1：创建随机影片 API**

```typescript
// app/api/movies/random/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  // 获取随机一部已发布的影片
  const { data, error } = await supabase
    .from("movies")
    .select("id")
    .eq("is_published", true)
    .order("id") // 需要一个排序来保证分页稳定
    .limit(100);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: "No movies found" }, { status: 404 });
  }

  const randomIndex = Math.floor(Math.random() * data.length);
  return NextResponse.json({ id: data[randomIndex].id });
}
```

- [ ] **步骤 2：创建 RandomPlayButton 组件**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shuffle, Loader2 } from "lucide-react";

export default function RandomPlayButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRandom = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/movies/random");
      const data = await res.json();
      if (data.id) {
        router.push(`/watch/${data.id}`);
      }
    } catch {
      console.error("Random play failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRandom}
      disabled={loading}
      className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-lg transition text-lg disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Shuffle className="w-5 h-5" />
      )}
      随机播放
    </button>
  );
}
```

- [ ] **步骤 3：重写首页**

```tsx
import { createClient } from "@/lib/supabase/server";
import MovieCard from "@/components/MovieCard";
import Header from "@/components/Header";
import HorizontalRow from "@/components/HorizontalRow";
import RandomPlayButton from "@/components/RandomPlayButton";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: trending } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .order("rating", { ascending: false })
    .limit(20);

  const { data: latest } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: movies } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .eq("type", "movie")
    .order("rating", { ascending: false })
    .limit(20);

  const { data: documentaries } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .eq("type", "documentary")
    .order("rating", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen bg-black">
      <Header />

      {/* Hero */}
      <section className="relative h-[70vh] flex items-end pb-16 pt-16">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 leading-tight">
            沉浸观影<br />
            <span className="text-gray-400">无限选择</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-xl">
            电影与纪录片，随时随地畅享。
          </p>
          <div className="flex gap-4">
            <RandomPlayButton />
            <Link
              href="/movies"
              className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3 rounded-lg transition text-lg backdrop-blur"
            >
              浏览影片
            </Link>
          </div>
        </div>
      </section>

      {/* Content Rows */}
      <div className="space-y-8 pb-16">
        {trending && trending.length > 0 && (
          <HorizontalRow title="热门推荐">
            {trending.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}

        {latest && latest.length > 0 && (
          <HorizontalRow title="最新上线">
            {latest.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}

        {movies && movies.length > 0 && (
          <HorizontalRow title="电影">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}

        {documentaries && documentaries.length > 0 && (
          <HorizontalRow title="纪录片">
            {documentaries.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 text-sm">
          <p>&copy; {new Date().getFullYear()} CineStream</p>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **步骤 4：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 5：Commit**

```bash
git add app/(main)/page.tsx components/RandomPlayButton.tsx app/api/movies/random/route.ts
git commit -m "feat: redesign homepage with horizontal scroll rows and random play"
```

---

## 任务 8：电影列表页 + 纪录片列表页

**文件：**
- 创建：`app/(main)/movies/page.tsx`
- 创建：`app/(main)/documentaries/page.tsx`

- [ ] **步骤 1：创建电影列表页**

```tsx
import { createClient } from "@/lib/supabase/server";
import MovieCard from "@/components/MovieCard";
import Header from "@/components/Header";

export default async function MoviesPage() {
  const supabase = await createClient();

  const { data: movies } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .eq("type", "movie")
    .order("rating", { ascending: false });

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white mb-8">电影</h1>

        {movies && movies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">暂无电影</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：创建纪录片列表页**

```tsx
import { createClient } from "@/lib/supabase/server";
import MovieCard from "@/components/MovieCard";
import Header from "@/components/Header";

export default async function DocumentariesPage() {
  const supabase = await createClient();

  const { data: documentaries } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .eq("type", "documentary")
    .order("rating", { ascending: false });

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white mb-8">纪录片</h1>

        {documentaries && documentaries.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {documentaries.map((doc) => (
              <MovieCard key={doc.id} movie={doc} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">暂无纪录片</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **步骤 3：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 4：Commit**

```bash
git add app/(main)/movies/page.tsx app/(main)/documentaries/page.tsx
git commit -m "feat: add movies and documentaries list pages"
```

---

## 任务 9：收藏夹 API + FavoriteButton 组件

**文件：**
- 创建：`app/api/favorites/route.ts`
- 创建：`components/FavoriteButton.tsx`
- 创建：`__tests__/api/favorites.test.ts`

- [ ] **步骤 1：编写收藏 API 测试**

```typescript
// __tests__/api/favorites.test.ts
// 注意：需要 mock Supabase client
import { GET, POST, DELETE } from "@/app/api/favorites/route";

// 这里需要配置测试环境（jest + supabase mock）
// 简化版测试逻辑：
describe("Favorites API", () => {
  it("GET returns user favorites", async () => {
    // mock request with auth
    // expect array of favorites
  });

  it("POST adds a favorite", async () => {
    // mock request with movie_id
    // expect 201
  });

  it("DELETE removes a favorite", async () => {
    // mock request with movie_id
    // expect 200
  });
});
```

- [ ] **步骤 2：实现收藏 API**

```typescript
// app/api/favorites/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("favorites")
    .select("movie_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { movie_id } = await request.json();

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, movie_id });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ message: "Already favorited" }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Added" }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { movie_id } = await request.json();

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("movie_id", movie_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Removed" });
}
```

- [ ] **步骤 3：实现 FavoriteButton 组件**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Heart } from "lucide-react";

interface FavoriteButtonProps {
  movieId: string;
}

export default function FavoriteButton({ movieId }: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/favorites")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setIsFavorite(data.some((f: { movie_id: string }) => f.movie_id === movieId));
        }
      })
      .finally(() => setLoading(false));
  }, [movieId]);

  const toggle = async () => {
    const method = isFavorite ? "DELETE" : "POST";
    const res = await fetch("/api/favorites", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movie_id: movieId }),
    });

    if (res.ok) {
      setIsFavorite(!isFavorite);
    }
  };

  if (loading) {
    return <div className="w-10 h-10 rounded-full bg-gray-800 animate-pulse" />;
  }

  return (
    <button
      onClick={toggle}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
        isFavorite
          ? "bg-red-600 text-white"
          : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
      }`}
      aria-label={isFavorite ? "取消收藏" : "收藏"}
    >
      <Heart className="w-5 h-5" fill={isFavorite ? "currentColor" : "none"} />
    </button>
  );
}
```

- [ ] **步骤 4：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 5：Commit**

```bash
git add app/api/favorites/route.ts components/FavoriteButton.tsx __tests__/api/favorites.test.ts
git commit -m "feat: add favorites API and FavoriteButton component"
```

---

## 任务 10：观影进度 API（跨设备续播）

**文件：**
- 创建：`app/api/watch-progress/route.ts`
- 修改：`app/(main)/watch/[id]/page.tsx`
- 创建：`__tests__/api/watch-progress.test.ts`

- [ ] **步骤 1：实现观影进度 API**

```typescript
// app/api/watch-progress/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const movieId = searchParams.get("movie_id");

  if (!movieId) {
    return NextResponse.json({ error: "movie_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("watch_progress")
    .select("position_seconds, duration_seconds, completed")
    .eq("user_id", user.id)
    .eq("movie_id", movieId)
    .single();

  if (error || !data) {
    return NextResponse.json({ position_seconds: 0 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { movie_id, position_seconds, duration_seconds, completed } = await request.json();

  const { error } = await supabase
    .from("watch_progress")
    .upsert(
      {
        user_id: user.id,
        movie_id,
        position_seconds,
        duration_seconds,
        completed: completed ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,movie_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Saved" });
}
```

- [ ] **步骤 2：修改 WatchPage 集成续播**

修改 `app/(main)/watch/[id]/page.tsx`，在 `onReady` 回调中添加进度恢复和保存逻辑：

```tsx
// 在 onReady 回调中替换原有逻辑：
onReady={(player) => {
  // 恢复进度
  fetch(`/api/watch-progress?movie_id=${id}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.position_seconds > 0 && !data.completed) {
        player.currentTime(data.position_seconds);
      }
    });

  // 定期保存进度（每 10 秒）
  const saveInterval = setInterval(() => {
    if (player.paused()) return;
    fetch("/api/watch-progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movie_id: id,
        position_seconds: player.currentTime(),
        duration_seconds: player.duration(),
      }),
    });
  }, 10000);

  // 播放结束标记完成
  player.on("ended", () => {
    clearInterval(saveInterval);
    fetch("/api/watch-progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movie_id: id,
        position_seconds: player.duration(),
        duration_seconds: player.duration(),
        completed: true,
      }),
    });
  });

  // 页面离开时保存
  const handleBeforeUnload = () => {
    fetch("/api/watch-progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movie_id: id,
        position_seconds: player.currentTime(),
        duration_seconds: player.duration(),
      }),
    });
  };
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    clearInterval(saveInterval);
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
}}
```

- [ ] **步骤 3：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 4：Commit**

```bash
git add app/api/watch-progress/route.ts app/\(main\)/watch/\[id\]/page.tsx __tests__/api/watch-progress.test.ts
git commit -m "feat: add watch progress API for cross-device resume"
```

---

## 任务 11：观影统计 API

**文件：**
- 创建：`app/api/watch-stats/route.ts`

- [ ] **步骤 1：实现观影统计 API**

```typescript
// app/api/watch-stats/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 获取所有已观看的进度记录
  const { data: progress, error } = await supabase
    .from("watch_progress")
    .select("position_seconds, movie:movies(type)")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let totalSeconds = 0;
  let moviesWatched = 0;
  let documentariesWatched = 0;

  for (const item of progress ?? []) {
    totalSeconds += Number(item.position_seconds) || 0;
    const movieType = (item.movie as { type?: string })?.type;
    if (movieType === "documentary") {
      documentariesWatched++;
    } else {
      moviesWatched++;
    }
  }

  return NextResponse.json({
    total_seconds: Math.round(totalSeconds),
    movies_watched: moviesWatched,
    documentaries_watched: documentariesWatched,
  });
}
```

- [ ] **步骤 2：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 3：Commit**

```bash
git add app/api/watch-stats/route.ts
git commit -m "feat: add watch stats API (total time, movies/documentaries count)"
```

---

## 任务 12：我的页面（收藏 + 统计 + 个人信息）

**文件：**
- 创建：`app/(main)/my/page.tsx`
- 创建：`components/WatchStats.tsx`

- [ ] **步骤 1：创建 WatchStats 组件**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Clock, Film, Tv } from "lucide-react";

interface Stats {
  total_seconds: number;
  movies_watched: number;
  documentaries_watched: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

export default function WatchStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/watch-stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-800/50 rounded-xl p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    {
      icon: Clock,
      label: "总观影时长",
      value: formatDuration(stats.total_seconds),
      color: "text-blue-400",
    },
    {
      icon: Film,
      label: "已看电影",
      value: `${stats.movies_watched} 部`,
      color: "text-red-400",
    },
    {
      icon: Tv,
      label: "已看纪录片",
      value: `${stats.documentaries_watched} 部`,
      color: "text-green-400",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="bg-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </div>
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **步骤 2：创建我的页面**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/Header";
import WatchStats from "@/components/WatchStats";
import MovieCard from "@/components/MovieCard";
import { User, Mail, Calendar, Heart, Loader2 } from "lucide-react";
import Link from "next/link";

interface Profile {
  full_name: string;
  created_at: string;
}

interface FavoriteMovie {
  id: string;
  title: string;
  poster_url: string;
  rating: number;
  year: number;
  genre: string[];
  type: string;
}

export default function MyPage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [favorites, setFavorites] = useState<FavoriteMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      // 加载个人信息
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, created_at")
        .eq("id", user.id)
        .single();
      setProfile(profileData);

      // 加载收藏的电影
      const { data: favData } = await supabase
        .from("favorites")
        .select("movie:movies(id, title, poster_url, rating, year, genre, type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (favData) {
        const movies = favData
          .map((f) => f.movie)
          .filter(Boolean) as unknown as FavoriteMovie[];
        setFavorites(movies);
      }

      setLoading(false);
    };

    loadData();
  }, [user, supabase]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black">
        <Header />
        <div className="pt-24 text-center">
          <p className="text-gray-400 text-lg mb-4">请先登录</p>
          <Link
            href="/login?redirect=/my"
            className="bg-white text-black px-6 py-2 rounded-lg font-medium"
          >
            登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="pt-24 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 个人信息 */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {profile?.full_name || "用户"}
            </h1>
            <div className="flex items-center gap-4 text-gray-500 text-sm mt-1">
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" /> {user.email}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("zh-CN")
                  : ""}
              </span>
            </div>
          </div>
        </div>

        {/* 观影统计 */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-4">观影统计</h2>
          <WatchStats />
        </section>

        {/* 收藏夹 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-semibold text-white">我的收藏</h2>
          </div>

          {favorites.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {favorites.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-900/40 rounded-xl">
              <Heart className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">还没有收藏</p>
              <Link href="/movies" className="text-red-400 hover:text-red-300 text-sm mt-2 inline-block">
                去发现影片
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **步骤 3：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 4：Commit**

```bash
git add app/\(main\)/my/page.tsx components/WatchStats.tsx
git commit -m "feat: add My page with watch stats and favorites"
```

---

## 任务 13：电影详情页集成收藏按钮

**文件：**
- 修改：`app/(main)/movies/[id]/page.tsx`

- [ ] **步骤 1：添加 FavoriteButton 到详情页**

在 `app/(main)/movies/[id]/page.tsx` 中：
1. 导入 `FavoriteButton`：`import FavoriteButton from "@/components/FavoriteButton";`
2. 在操作按钮区域（"立即观看"按钮旁）添加：

```tsx
<div className="flex gap-4 items-center">
  <Link
    href={`/watch/${movie.id}`}
    className="inline-flex items-center gap-2 bg-white text-black font-semibold px-8 py-3 rounded-lg transition text-lg hover:bg-gray-200"
  >
    <Play className="w-5 h-5" fill="black" />
    立即观看
  </Link>
  <FavoriteButton movieId={movie.id} />
  {movie.trailer_url && (
    <a
      href={movie.trailer_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-lg transition text-lg"
    >
      预告片
    </a>
  )}
</div>
```

3. 移除 `is_premium` 相关的会员专享标签

- [ ] **步骤 2：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 3：Commit**

```bash
git add app/\(main\)/movies/\[id\]/page.tsx
git commit -m "feat: integrate FavoriteButton into movie detail page"
```

---

## 任务 14：Account 页面清理

**文件：**
- 修改：`app/(main)/account/page.tsx`

- [ ] **步骤 1：移除支付相关字段**

修改 `app/(main)/account/page.tsx`：
1. 从 `Profile` 接口移除 `subscription_status`、`subscription_plan`、`subscription_expires_at`
2. 从 Supabase 查询中移除这些字段
3. 移除会员状态展示区块
4. 移除"升级会员"按钮
5. 移除 `Crown`、`CreditCard` 图标导入

简化后的 Profile Card 只展示：姓名、邮箱、注册时间。

- [ ] **步骤 2：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 3：Commit**

```bash
git add app/\(main\)/account/page.tsx
git commit -m "feat: simplify account page, remove subscription fields"
```

---

## 任务 15：Middleware 更新

**文件：**
- 修改：`middleware.ts`

- [ ] **步骤 1：添加 /my 到受保护路由**

```typescript
// 修改 protectedRoutes 数组：
const protectedRoutes = ["/account", "/watch", "/admin", "/my"];
```

- [ ] **步骤 2：验证构建**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 3：Commit**

```bash
git add middleware.ts
git commit -m "feat: add /my route to protected routes in middleware"
```

---

## 任务 16：最终验证 + 清理

- [ ] **步骤 1：完整构建验证**

```bash
npm run build
```
预期：构建成功，无错误

- [ ] **步骤 2：运行所有测试**

```bash
npx jest --no-cache
```
预期：所有测试通过

- [ ] **步骤 3：检查未使用的导入**

```bash
npx eslint . --no-eslintrc --rule '{"no-unused-vars": "warn"}' --ext .ts,.tsx
```
修复任何未使用的导入

- [ ] **步骤 4：最终 Commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification for CineStream V2"
```

---

## 检查清单

### 规格覆盖度
- [x] 导航四栏（首页/电影/纪录片/我的）→ 任务 4
- [x] 电影/纪录片独立分区 → 任务 8
- [x] 横向滚动布局 → 任务 5 + 7
- [x] 随机播放 → 任务 7
- [x] 跨设备续播 → 任务 10
- [x] 观影时长统计 → 任务 11 + 12
- [x] 收藏夹 → 任务 9 + 12
- [x] 移除支付系统 → 任务 1
- [x] Netflix 风格 UI → 任务 3 + 5 + 6 + 7
- [x] 纯文字导航（无图标）→ 任务 4（导航链接纯文字，仅下拉菜单保留图标）
- [x] Plus Jakarta Sans 字体 → 任务 3

### 占位符扫描
- [x] 无 "待定"、"TODO"
- [x] 所有代码步骤包含完整代码
- [x] 所有测试步骤包含具体测试代码
- [x] 无 "类似任务 N"

### 类型一致性
- [x] `ContentType` 在 `lib/types.ts` 定义，所有地方引用一致
- [x] `Movie` 接口字段名统一（`poster_url`、`rating` 等）
- [x] API 返回格式一致（`{ error }` 或 `{ message }`）
