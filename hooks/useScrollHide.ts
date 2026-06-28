/**
 * useScrollHide Hook
 *
 * 用途: 统一管理导航栏和筛选栏的滚动隐藏/显示状态
 * 依赖: React hooks (useState, useEffect, useRef, useCallback)
 * 架构: 使用 requestAnimationFrame 优化滚动性能
 *
 * 功能:
 * - 向下滚动时隐藏导航元素
 * - 向上滚动时显示导航元素
 * - 在顶部时始终显示
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * 滚动隐藏 Hook
 *
 * 做什么: 根据滚动方向控制元素的显示/隐藏状态
 * 参数:
 *   - threshold: 隐藏阈值（默认100px），滚动超过此值才触发隐藏
 * 返回值:
 *   - boolean: 元素是否可见（true=显示，false=隐藏）
 */
export function useScrollHide(threshold = 100) {
  /** 元素是否可见 */
  const [filtersVisible, setFiltersVisible] = useState(true);

  /** 上一次滚动位置 */
  const lastScrollY = useRef(0);

  /** 是否正在等待动画帧 */
  const ticking = useRef(false);

  /**
   * 滚动事件处理函数
   * 使用 requestAnimationFrame 优化性能，避免频繁更新状态
   */
  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;

        // 向下滚动且超过阈值时隐藏
        if (currentScrollY > lastScrollY.current && currentScrollY > threshold) {
          setFiltersVisible(false);
        }
        // 向上滚动时显示
        else if (currentScrollY < lastScrollY.current) {
          setFiltersVisible(true);
        }

        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
      ticking.current = true;
    }
  }, [threshold]);

  /** 注册/注销滚动事件监听器 */
  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return filtersVisible;
}
