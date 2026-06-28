/**
 * 主题常量 - StellaFlix Mobile
 * 统一的颜色、字体、间距配置
 */

// 品牌色（Netflix 风格）
export const COLORS = {
  primary: '#e50914',      // 主色（红）
  secondary: '#221f1f',    // 次要色（深灰）
  background: '#141414',   // 背景色
  surface: '#1f1f1f',      // 卡片背景
  surfaceLight: '#2a2a2a', // 浅色卡片

  // 文字
  text: '#ffffff',          // 主文字
  textSecondary: '#999999',// 次要文字
  textMuted: '#666666',    // 淡化文字

  // 功能色
  accent: '#e50914',       // 强调色
  success: '#46d369',      // 成功/高分
  warning: '#f5c518',      // 警告/评分

  // 透明
  overlay: 'rgba(0,0,0,0.6)',
  glass: 'rgba(20,20,20,0.8)',
};

// 间距
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// 圆角
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

// 字体大小
export const FONT_SIZE = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  title: 28,
  hero: 36,
};

// API 配置 - 你的电脑 IP 地址
export const API_BASE_URL = 'http://192.168.1.11:3000';

export default COLORS;
