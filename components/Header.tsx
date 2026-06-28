/**
 * Header 导航栏组件
 *
 * 用途: Netflix 风格的顶部导航栏
 * 依赖:
 *   - next/link: 路由链接
 *   - next/navigation: 路由状态
 *   - lucide-react: 图标组件
 *   - SearchModal: 搜索弹窗
 * 架构:
 *   - 支持内部滚动监听或外部控制可见状态
 *   - 响应式设计：桌面端显示完整导航，移动端显示汉堡菜单
 *   - 玻璃模糊效果：根据滚动状态切换背景样式
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Search, User, Menu, X, Heart, Clock } from "lucide-react";
import SearchModal from "./SearchModal";

// ============================================
// 常量配置
// ============================================

/**
 * 导航链接配置
 *
 * 做什么: 定义导航栏中的链接列表
 */
const NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/netflixgc", label: "Netflix" },
  { href: "/movies", label: "电影" },
  { href: "/documentaries", label: "纪录片" },
  { href: "/bilibili", label: "B站" },
  { href: "/favorites", label: "收藏", icon: Heart },
  { href: "/history", label: "历史", icon: Clock },
];

/** 滚动阈值：超过此值显示背景 */
const SCROLL_THRESHOLD = 50;

/** 隐藏阈值：超过此值时隐藏导航栏 */
const HIDE_THRESHOLD = 100;

// ============================================
// 类型定义
// ============================================

interface HeaderProps {
  /** 外部控制的可见状态，用于与筛选栏同步 */
  visible?: boolean;
}

// ============================================
// 组件实现
// ============================================

/**
 * Header 导航栏组件
 *
 * 做什么: 渲染顶部导航栏，支持滚动隐藏/显示
 * 参数:
 *   - visible: 可选，外部控制的可见状态
 * 返回值: JSX 元素
 */
export default function Header({ visible }: HeaderProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [internalHidden, setInternalHidden] = useState(false);
  const lastScrollY = useRef(0);

  // ============================================
  // 滚动监听
  // ============================================

  /**
   * 内部滚动监听
   * 仅在未提供外部 visible 时使用
   */
  useEffect(() => {
    // 如果提供了外部 visible，不使用内部滚动逻辑
    if (visible !== undefined) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // 向下滚动超过阈值时隐藏
      if (currentScrollY > lastScrollY.current && currentScrollY > HIDE_THRESHOLD) {
        setInternalHidden(true);
      }
      // 向上滚动时显示
      else if (currentScrollY < lastScrollY.current) {
        setInternalHidden(false);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [visible]);

  /**
   * 背景状态监听
   * 始终执行，用于切换背景样式
   */
  useEffect(() => {
    const handleScrollBg = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    };

    window.addEventListener("scroll", handleScrollBg, { passive: true });
    return () => window.removeEventListener("scroll", handleScrollBg);
  }, []);

  // ============================================
  // 计算属性
  // ============================================

  /** 最终的隐藏状态 */
  const isHidden = visible !== undefined ? !visible : internalHidden;

  /**
   * 判断链接是否激活
   * 做什么: 根据当前路径判断链接是否高亮
   */
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  /** 玻璃模糊样式 */
  const glassStyle = scrolled
    ? "bg-black/60 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20"
    : "bg-gradient-to-b from-black/70 via-black/40 to-transparent backdrop-blur-sm";

  // ============================================
  // 渲染
  // ============================================

  return (
    <>
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          isHidden ? "-translate-y-full" : "translate-y-0"
        } ${glassStyle}`}
      >
        <nav className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo - 最左侧 */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <span className="text-2xl font-bold text-red-600">N</span>
            <span className="text-xl font-bold text-white">StellaFlix</span>
          </Link>

          {/* 桌面端导航链接 - 中间，间距加大 */}
          <div className="hidden md:flex items-center gap-12">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition ${
                  isActive(link.href)
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* 右侧操作区 - 最右侧 */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* 搜索按钮 */}
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-gray-400 hover:text-white transition"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* 用户按钮 */}
            <Link
              href="/profile"
              className="p-2 bg-red-600 hover:bg-red-700 rounded-full text-white transition"
            >
              <User className="w-5 h-5" />
            </Link>

            {/* 移动端菜单按钮 */}
            <button
              className="md:hidden p-2 text-gray-400 hover:text-white transition"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </nav>

        {/* 移动端菜单 */}
        {menuOpen && (
          <div className="md:hidden bg-black/95 border-t border-gray-800">
            <div className="px-4 py-4 space-y-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block py-2 px-4 rounded-lg transition ${
                    isActive(link.href)
                      ? "bg-red-600 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* 搜索弹窗 */}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
