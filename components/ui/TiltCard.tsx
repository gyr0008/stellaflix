/**
 * TiltCard - 3D 倾斜发光卡片组件
 *
 * 借鉴 React Bits 的 ProfileCard 效果
 * 适配电影海报展示场景
 *
 * 核心效果：
 * - 3D 倾斜效果：鼠标悬停时卡片跟随鼠标倾斜
 * - 鼠标跟随发光：卡片背后有跟随鼠标的发光效果
 * - 光泽动画：卡片表面有流动的光泽效果
 *
 * 性能优化：
 * - 使用 React.memo 避免不必要的重渲染
 * - 使用 useCallback 缓存事件处理函数
 * - 使用 useMemo 缓存计算结果
 * - 使用 requestAnimationFrame 优化动画性能
 */

'use client';

import React, { useEffect, useRef, useCallback, useMemo, memo, useState } from 'react';
import './TiltCard.css';

// ==================== 类型定义 ====================

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  /** 是否启用 3D 倾斜效果 */
  enableTilt?: boolean;
  /** 是否启用背后的发光效果 */
  behindGlowEnabled?: boolean;
  /** 背后发光颜色 */
  behindGlowColor?: string;
  /** 背后发光大小 */
  behindGlowSize?: string;
  /** 内部渐变样式 */
  innerGradient?: string;
  /** 卡片最大宽度 */
  maxWidth?: string;
  /** 卡片宽高比 */
  aspectRatio?: string;
  /** 鼠标点击回调 */
  onClick?: () => void;
}

// ==================== 工具函数 ====================

/** 限制值在范围内 */
const clamp = (v: number, min = 0, max = 100) => Math.min(Math.max(v, min), max);

/** 四舍五入到指定精度 */
const round = (v: number, precision = 3) => parseFloat(v.toFixed(precision));

/** 线性映射值 */
const adjust = (v: number, fMin: number, fMax: number, tMin: number, tMax: number) =>
  round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin));

// ==================== 动画配置 ====================

const ANIMATION_CONFIG = {
  INITIAL_DURATION: 1200,
  INITIAL_X_OFFSET: 70,
  INITIAL_Y_OFFSET: 60,
  ENTER_TRANSITION_MS: 180,
};

// ==================== TiltCard 组件 ====================

const TiltCardComponent = ({
  children,
  className = '',
  enableTilt = true,
  behindGlowEnabled = true,
  behindGlowColor = 'rgba(229, 9, 20, 0.67)', // Netflix 红色
  behindGlowSize = '50%',
  innerGradient = 'linear-gradient(145deg, rgba(229, 9, 20, 0.15) 0%, rgba(0, 0, 0, 0.9) 100%)',
  maxWidth = '300px',
  aspectRatio = '0.667', // 2:3 电影海报比例
  onClick,
}: TiltCardProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveRafRef = useRef<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // ==================== Tilt 引擎 ====================

  const tiltEngine = useMemo(() => {
    if (!enableTilt) return null;

    let rafId: number | null = null;
    let running = false;
    let lastTs = 0;

    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const DEFAULT_TAU = 0.14;
    const INITIAL_TAU = 0.6;
    let initialUntil = 0;

    const setVarsFromXY = (x: number, y: number) => {
      const shell = shellRef.current;
      const wrap = wrapRef.current;
      if (!shell || !wrap) return;

      const width = shell.clientWidth || 1;
      const height = shell.clientHeight || 1;

      const percentX = clamp((100 / width) * x);
      const percentY = clamp((100 / height) * y);

      const centerX = percentX - 50;
      const centerY = percentY - 50;

      const properties: Record<string, string> = {
        '--tc-pointer-x': `${percentX}%`,
        '--tc-pointer-y': `${percentY}%`,
        '--tc-background-x': `${adjust(percentX, 0, 100, 35, 65)}%`,
        '--tc-background-y': `${adjust(percentY, 0, 100, 35, 65)}%`,
        '--tc-pointer-from-center': `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
        '--tc-pointer-from-top': `${percentY / 100}`,
        '--tc-pointer-from-left': `${percentX / 100}`,
        '--tc-rotate-x': `${round(-(centerX / 5))}deg`,
        '--tc-rotate-y': `${round(centerY / 4)}deg`,
      };

      for (const [k, v] of Object.entries(properties)) {
        wrap.style.setProperty(k, v);
      }
    };

    const step = (ts: number) => {
      if (!running) return;
      if (lastTs === 0) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
      const k = 1 - Math.exp(-dt / tau);

      currentX += (targetX - currentX) * k;
      currentY += (targetY - currentY) * k;

      setVarsFromXY(currentX, currentY);

      const stillFar = Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05;

      if (stillFar || document.hasFocus()) {
        rafId = requestAnimationFrame(step);
      } else {
        running = false;
        lastTs = 0;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTs = 0;
      rafId = requestAnimationFrame(step);
    };

    return {
      setImmediate(x: number, y: number) {
        currentX = x;
        currentY = y;
        setVarsFromXY(currentX, currentY);
      },
      setTarget(x: number, y: number) {
        targetX = x;
        targetY = y;
        start();
      },
      toCenter() {
        const shell = shellRef.current;
        if (!shell) return;
        this.setTarget(shell.clientWidth / 2, shell.clientHeight / 2);
      },
      beginInitial(durationMs: number) {
        initialUntil = performance.now() + durationMs;
        start();
      },
      getCurrent() {
        return { x: currentX, y: currentY, tx: targetX, ty: targetY };
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        running = false;
        lastTs = 0;
      },
    };
  }, [enableTilt]);

  // ==================== 事件处理 ====================

  /** 获取鼠标相对于元素的位置 */
  const getOffsets = useCallback((evt: React.PointerEvent | PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }, []);

  /** 鼠标移动事件 */
  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine, getOffsets]
  );

  /** 鼠标进入事件 */
  const handlePointerEnter = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;

      shell.classList.add('tc-active', 'tc-entering');
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      enterTimerRef.current = setTimeout(() => {
        shell.classList.remove('tc-entering');
      }, ANIMATION_CONFIG.ENTER_TRANSITION_MS);

      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine, getOffsets]
  );

  /** 鼠标离开事件 */
  const handlePointerLeave = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || !tiltEngine) return;

    tiltEngine.toCenter();

    const checkSettle = () => {
      const { x, y, tx, ty } = tiltEngine.getCurrent();
      const settled = Math.hypot(tx - x, ty - y) < 0.6;
      if (settled) {
        shell.classList.remove('tc-active');
        leaveRafRef.current = null;
      } else {
        leaveRafRef.current = requestAnimationFrame(checkSettle);
      }
    };
    if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
    leaveRafRef.current = requestAnimationFrame(checkSettle);
  }, [tiltEngine]);

  // ==================== 生命周期 ====================

  useEffect(() => {
    if (!enableTilt || !tiltEngine) return;

    const shell = shellRef.current;
    if (!shell) return;

    shell.addEventListener('pointerenter', handlePointerEnter as EventListener);
    shell.addEventListener('pointermove', handlePointerMove as EventListener);
    shell.addEventListener('pointerleave', handlePointerLeave as EventListener);

    // 初始动画
    const initialX = (shell.clientWidth || 0) - ANIMATION_CONFIG.INITIAL_X_OFFSET;
    const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;
    tiltEngine.setImmediate(initialX, initialY);
    tiltEngine.toCenter();
    tiltEngine.beginInitial(ANIMATION_CONFIG.INITIAL_DURATION);

    return () => {
      shell.removeEventListener('pointerenter', handlePointerEnter as EventListener);
      shell.removeEventListener('pointermove', handlePointerMove as EventListener);
      shell.removeEventListener('pointerleave', handlePointerLeave as EventListener);
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
      tiltEngine.cancel();
      shell.classList.remove('tc-entering');
    };
  }, [enableTilt, tiltEngine, handlePointerMove, handlePointerEnter, handlePointerLeave]);

  // ==================== 可见性检测 ====================

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    if (wrapRef.current) {
      observer.observe(wrapRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // ==================== 样式计算 ====================

  const cardStyle = useMemo(
    () => ({
      '--inner-gradient': innerGradient,
      '--behind-glow-color': behindGlowColor,
      '--behind-glow-size': behindGlowSize,
      maxWidth,
      aspectRatio,
    } as React.CSSProperties),
    [innerGradient, behindGlowColor, behindGlowSize, maxWidth, aspectRatio]
  );

  // ==================== 渲染 ====================

  return (
    <div
      ref={wrapRef}
      className={`tc-card-wrapper ${className}`.trim()}
      style={cardStyle}
      onClick={onClick}
    >
      {behindGlowEnabled && <div className="tc-behind" />}
      <div ref={shellRef} className="tc-card-shell">
        <div className="tc-card">
          <div className="tc-inside">
            <div className="tc-shine" />
            <div className="tc-glare" />
            <div className="tc-content">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** TiltCard 组件 - 使用 React.memo 优化 */
const TiltCard = memo(TiltCardComponent);
export default TiltCard;
