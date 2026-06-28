/**
 * 发光效果组件库
 *
 * 借鉴 react-bits 和 Mineradio 的悬停发光效果
 *
 * 效果类型：
 * 1. GlowCard - 卡片边框发光
 * 2. GlowButton - 按钮悬停发光
 * 3. FollowingGlow - 鼠标跟随发光
 * 4. PulseGlow - 脉冲发光
 * 5. NeonText - 霓虹文字效果
 *
 * 性能优化：
 * - 使用 useCallback 缓存事件处理函数
 * - 使用 useMemo 缓存计算结果
 * - 使用 CSS 变量减少重绘
 */

"use client";

import { useRef, useState, useCallback, useMemo, ReactNode, MouseEvent, CSSProperties } from "react";

// ==================== 类型定义 ====================

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  glowIntensity?: number;
  as?: "div" | "li" | "article";
  href?: string;
  onClick?: () => void;
}

interface GlowButtonProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  variant?: "default" | "red" | "blue" | "green" | "purple";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

interface FollowingGlowProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  glowSize?: number;
}

interface PulseGlowProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  speed?: "slow" | "normal" | "fast";
}

interface NeonTextProps {
  children: ReactNode;
  className?: string;
  color?: string;
  animation?: "none" | "flicker" | "pulse";
}

// ==================== 1. 发光卡片 ====================

/**
 * 发光卡片组件
 *
 * 功能：鼠标悬停时卡片边框发光
 * 原理：使用 CSS 渐变 + 鼠标位置计算发光方向
 * 性能优化：使用 useCallback 缓存事件处理函数
 *
 * @param glowColor - 发光颜色
 * @param glowIntensity - 发光强度 (0.3-1)
 */
export function GlowCard({
  children,
  className = "",
  glowColor = "#e50914",
  glowIntensity = 0.6,
  as: Component = "div",
  href,
  onClick,
}: GlowCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  /** 鼠标移动时更新发光位置 - 使用 useCallback 缓存 */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  /** 鼠标进入事件 - 使用 useCallback 缓存 */
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);

  /** 鼠标离开事件 - 使用 useCallback 缓存 */
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const style: CSSProperties = {
    "--glow-x": `${position.x}px`,
    "--glow-y": `${position.y}px`,
    "--glow-color": glowColor,
    "--glow-intensity": glowIntensity,
    "--glow-opacity": isHovered ? "1" : "0",
  } as CSSProperties;

  return (
    <div
      ref={divRef}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 发光层 */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none z-0"
        style={{
          background: `radial-gradient(
            300px circle at ${position.x}px ${position.y}px,
            ${glowColor}${Math.round(glowIntensity * 50).toString(16).padStart(2, "0")},
            transparent 70%
          )`,
          opacity: isHovered ? 1 : 0,
        }}
      />
      {/* 边框发光层 */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none z-0"
        style={{
          background: `radial-gradient(
            300px circle at ${position.x}px ${position.y}px,
            ${glowColor},
            transparent 70%
          )`,
          opacity: isHovered ? 0.4 : 0,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: "1px",
        }}
      />
      {/* 内容 */}
      <div className="relative z-10">
        {href ? (
          <a href={href} onClick={onClick} className="block h-full">
            {children}
          </a>
        ) : (
          <Component onClick={onClick} className="block h-full">
            {children}
        </Component>
      )}
      </div>
    </div>
  );
}

// ==================== 2. 发光按钮 ====================

/**
 * 发光按钮组件
 *
 * 功能：悬停时按钮发光，支持多种颜色变体
 * 性能优化：使用 useCallback 缓存事件处理函数
 *
 * @param variant - 颜色变体
 * @param size - 按钮大小
 */
export function GlowButton({
  children,
  className = "",
  glowColor,
  variant = "default",
  size = "md",
  onClick,
  href,
  disabled,
  type = "button",
}: GlowButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  // 颜色配置 - 使用 useMemo 缓存
  const colorMap = useMemo(() => ({
    default: { base: "bg-white/10", hover: "bg-white/20", glow: "#ffffff" },
    red: { base: "bg-red-600", hover: "bg-red-500", glow: "#e50914" },
    blue: { base: "bg-blue-600", hover: "bg-blue-500", glow: "#3b82f6" },
    green: { base: "bg-green-600", hover: "bg-green-500", glow: "#22c55e" },
    purple: { base: "bg-purple-600", hover: "bg-purple-500", glow: "#a855f7" },
  }), []);

  // 尺寸配置 - 使用 useMemo 缓存
  const sizeMap = useMemo(() => ({
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-base",
    lg: "px-7 py-3.5 text-lg",
  }), []);

  const colors = colorMap[variant];
  const glow = glowColor || colors.glow;

  /** 鼠标进入事件 - 使用 useCallback 缓存 */
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);

  /** 鼠标离开事件 - 使用 useCallback 缓存 */
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const style: CSSProperties = {
    "--btn-glow": glow,
    "--btn-glow-opacity": isHovered ? "1" : "0",
  } as CSSProperties;

  const content = (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-lg font-medium
        transition-all duration-300
        ${colors.base} hover:${colors.hover}
        ${sizeMap[size]}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 发光背景 */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at center, ${glow}, transparent 70%)`,
          opacity: isHovered ? 0.3 : 0,
        }}
      />
      {/* 内容 */}
      <span className="relative z-10">{children}</span>
    </button>
  );

  if (href) {
    return (
      <a href={href} className="inline-block">
        {content}
      </a>
    );
  }

  return content;
}

// ==================== 3. 鼠标跟随发光 ====================

/**
 * 鼠标跟随发光组件
 *
 * 功能：在子元素周围创建跟随鼠标的发光效果
 * 原理：监听鼠标移动，动态更新背景渐变位置
 * 性能优化：使用 useCallback 缓存事件处理函数，使用 useMemo 缓存样式
 *
 * @param glowColor - 发光颜色
 * @param glowSize - 发光半径 (px)
 */
export function FollowingGlow({
  children,
  className = "",
  glowColor = "#e50914",
  glowSize = 300,
}: FollowingGlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  /** 鼠标移动事件 - 使用 useCallback 缓存 */
  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  /** 鼠标进入事件 - 使用 useCallback 缓存 */
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);

  /** 鼠标离开事件 - 使用 useCallback 缓存 */
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  /** 跟随发光层样式 - 使用 useMemo 缓存 */
  const glowBackgroundStyle = useMemo(() => ({
    background: isHovered
      ? `radial-gradient(
          ${glowSize}px circle at ${mousePos.x}px ${mousePos.y}px,
          ${glowColor}30,
          transparent 60%
        )`
      : "none",
    opacity: isHovered ? 1 : 0,
  }), [isHovered, mousePos.x, mousePos.y, glowSize, glowColor]);

  /** 边框发光层样式 - 使用 useMemo 缓存 */
  const borderGlowStyle = useMemo(() => ({
    background: isHovered
      ? `radial-gradient(
          ${glowSize}px circle at ${mousePos.x}px ${mousePos.y}px,
          ${glowColor},
          transparent 60%
        )`
      : "none",
    opacity: isHovered ? 0.4 : 0,
    mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    maskComposite: "exclude",
    padding: "1px",
  }), [isHovered, mousePos.x, mousePos.y, glowSize, glowColor]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 跟随发光层 */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-300"
        style={glowBackgroundStyle}
      />
      {/* 边框发光 */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-300"
        style={borderGlowStyle}
      />
      {/* 内容 */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ==================== 4. 脉冲发光 ====================

/**
 * 脉冲发光组件
 *
 * 功能：持续脉冲式发光动画
 * 用途：强调重要元素，如新功能、通知
 *
 * @param speed - 动画速度
 */
export function PulseGlow({
  children,
  className = "",
  glowColor = "#e50914",
  speed = "normal",
}: PulseGlowProps) {
  const speedMap = {
    slow: "animate-pulse-slow",
    normal: "animate-pulse",
    fast: "animate-pulse-fast",
  };

  return (
    <div className={`relative ${className}`}>
      {/* 脉冲发光层 */}
      <div
        className={`absolute inset-0 rounded-xl ${speedMap[speed]}`}
        style={{
          background: `radial-gradient(circle at center, ${glowColor}40, transparent 70%)`,
          filter: "blur(8px)",
        }}
      />
      {/* 内容 */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ==================== 5. 霓虹文字 ====================

/**
 * 霓虹文字组件
 *
 * 功能：模拟霓虹灯效果的文字
 * 原理：多层 text-shadow 叠加
 *
 * @param animation - 动画类型
 */
export function NeonText({
  children,
  className = "",
  color = "#e50914",
  animation = "none",
}: NeonTextProps) {
  const animationClass =
    animation === "flicker"
      ? "animate-neon-flicker"
      : animation === "pulse"
        ? "animate-neon-pulse"
        : "";

  return (
    <span
      className={`inline-block ${animationClass} ${className}`}
      style={{
        color: color,
        textShadow: `
          0 0 7px ${color},
          0 0 10px ${color},
          0 0 21px ${color},
          0 0 42px ${color}80,
          0 0 82px ${color}40
        `,
      }}
    >
      {children}
    </span>
  );
}

// ==================== 6. 发光分隔线 ====================

/**
 * 发光分隔线组件
 *
 * 功能：带有发光效果的水平分隔线
 */
export function GlowDivider({
  className = "",
  color = "#e50914",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <div className={`relative h-px w-full ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />
      <div
        className="absolute inset-0 blur-sm"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}80, transparent)`,
        }}
      />
    </div>
  );
}
