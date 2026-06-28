/**
 * 滚动位置保持 Hook
 *
 * 功能：在页面导航时保持滚动位置
 * 使用：const { saveScrollPosition } = useScrollRestoration('unique-key');
 *
 * 原理：
 * 1. 组件挂载时立即恢复滚动位置
 * 2. 多个时机保存：滚动时、卸载前、路由变化前、定时器
 * 3. 支持内存和 sessionStorage 双重存储
 */

"use client";

import { useEffect, useRef, useCallback } from "react";

// 内存存储，比 sessionStorage 更快
const scrollPositions = new Map<string, number>();

interface UseScrollRestorationOptions {
  /** 恢复后是否清除保存的位置，默认 true */
  clearOnRestore?: boolean;
  /** 保存防抖时间（ms），默认 100 */
  saveDebounce?: number;
  /** 恢复延迟（ms），默认 0 */
  restoreDelay?: number;
}

export function useScrollRestoration(
  key: string,
  options: UseScrollRestorationOptions = {}
) {
  const { clearOnRestore = true, saveDebounce = 100, restoreDelay = 0 } = options;
  const hasRestored = useRef(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastScrollY = useRef(0);

  // 保存滚动位置 - 使用防抖避免频繁写入
  const saveScrollPosition = useCallback(() => {
    if (typeof window === "undefined") return;

    const scrollY = window.scrollY || window.pageYOffset || 0;

    // 只在位置变化时保存
    if (Math.abs(scrollY - lastScrollY.current) < 10) return;

    lastScrollY.current = scrollY;

    // 防抖保存
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      // 保存到内存（最快）
      scrollPositions.set(key, scrollY);

      // 保存到 sessionStorage（持久化）
      try {
        const saveData = {
          y: scrollY,
          t: Date.now(),
        };
        sessionStorage.setItem(
          `scroll_${key}`,
          JSON.stringify(saveData)
        );
      } catch (e) {
        // sessionStorage 满了就忽略
      }
    }, saveDebounce);
  }, [key, saveDebounce]);

  // 恢复滚动位置
  const restoreScrollPosition = useCallback(() => {
    if (typeof window === "undefined" || hasRestored.current) return;

    // 从内存读取（最快）
    let savedY = scrollPositions.get(key);

    // 内存没有则从 sessionStorage 读取
    if (savedY === undefined) {
      try {
        const saved = sessionStorage.getItem(`scroll_${key}`);
        if (saved) {
          const data = JSON.parse(saved);
          // 只接受 5 分钟内的位置
          if (Date.now() - data.t < 5 * 60 * 1000) {
            savedY = data.y;
          } else {
            sessionStorage.removeItem(`scroll_${key}`);
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    if (savedY !== undefined && savedY > 0) {
      // 立即恢复（不使用 requestAnimationFrame，更可靠）
      window.scrollTo(0, savedY);

      // 多次恢复确保生效（某些浏览器需要）
      setTimeout(() => window.scrollTo(0, savedY), 0);
      setTimeout(() => window.scrollTo(0, savedY), 50);
      setTimeout(() => window.scrollTo(0, savedY), 100);

      hasRestored.current = true;

      if (clearOnRestore) {
        scrollPositions.delete(key);
        try {
          sessionStorage.removeItem(`scroll_${key}`);
        } catch (e) {}
      }
    }
  }, [key, clearOnRestore]);

  // 组件挂载时恢复
  useEffect(() => {
    if (restoreDelay > 0) {
      const timer = setTimeout(restoreScrollPosition, restoreDelay);
      return () => clearTimeout(timer);
    } else {
      restoreScrollPosition();
    }
  }, [restoreScrollPosition, restoreDelay]);

  // 监听滚动事件保存位置
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 立即保存一次当前位罝
    saveScrollPosition();

    window.addEventListener("scroll", saveScrollPosition, { passive: true });
    return () => {
      window.removeEventListener("scroll", saveScrollPosition);
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [saveScrollPosition]);

  // 页面卸载前保存
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeUnload = () => {
      saveScrollPosition();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveScrollPosition]);

  // 浏览器前进/后退时保存
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      // 浏览器导航时立即保存当前位罝
      const scrollY = window.scrollY || 0;
      scrollPositions.set(key, scrollY);
      try {
        sessionStorage.setItem(
          `scroll_${key}`,
          JSON.stringify({ y: scrollY, t: Date.now() })
        );
      } catch (e) {}
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [key]);

  // 返回清理函数和手动保存函数
  return {
    saveScrollPosition,
    clearSavedPosition: () => {
      scrollPositions.delete(key);
      try {
        sessionStorage.removeItem(`scroll_${key}`);
      } catch (e) {}
    },
  };
}
