/**
 * BackToTop 组件
 * 返回顶部浮动按钮
 *
 * 功能：
 * - 右下角显示浮动按钮
 * - 滚动超过 300px 时显示
 * - 点击平滑滚动到顶部
 * - 现代科技感设计
 */

"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-8 right-8 z-50 w-12 h-12 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white shadow-lg hover:bg-white/20 hover:scale-110 transition-all duration-300 flex items-center justify-center group"
      aria-label="返回顶部"
    >
      <ArrowUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
    </button>
  );
}
