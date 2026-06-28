/**
 * B站工具函数
 *
 * 用途：提供 localStorage 操作、数据格式化等通用功能
 * 依赖：无
 * 架构：纯函数，无状态，可跨组件复用
 */

// ============================================
// 类型定义
// ============================================

/** B站视频类型 */
export interface BilibiliVideo {
  bvid: string;
  title: string;
  description: string;
  duration: string;
  pic: string;
  author: string;
  play: number;
  danmaku: number;
  pubdate: number;
}

// ============================================
// 常量配置
// ============================================

/** 搜索历史 localStorage key */
const SEARCH_HISTORY_KEY = 'bilibili_search_history';

/** 已看视频 localStorage key */
const VIEWED_VIDEOS_KEY = 'bilibili_viewed_videos';

/** 搜索历史最大保存数量 */
const MAX_SEARCH_HISTORY = 20;

/** 已看视频最大保存数量 */
const MAX_VIEWED_VIDEOS = 100;

// ============================================
// 搜索历史管理
// ============================================

/**
 * 获取搜索历史
 *
 * 做什么: 从 localStorage 读取搜索历史列表
 * 参数: 无
 * 返回值: string[] - 搜索关键词数组，按时间倒序排列
 */
export function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * 保存搜索关键词到历史
 *
 * 做什么: 将搜索关键词添加到历史记录开头（去重）
 * 参数:
 *   - keyword: 要保存的搜索关键词
 * 返回值: 无
 */
export function saveSearchHistory(keyword: string): void {
  const history = getSearchHistory().filter(h => h !== keyword);
  history.unshift(keyword);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_SEARCH_HISTORY)));
}

/**
 * 清空搜索历史
 *
 * 做什么: 删除 localStorage 中的搜索历史
 * 参数: 无
 * 返回值: 无
 */
export function clearSearchHistory(): void {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}

// ============================================
// 已看视频管理
// ============================================

/**
 * 获取已看视频列表
 *
 * 做什么: 从 localStorage 读取已播放视频的 bvid 列表
 * 参数: 无
 * 返回值: string[] - 已播放视频的 bvid 数组
 */
export function getViewedVideos(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const viewed = JSON.parse(localStorage.getItem(VIEWED_VIDEOS_KEY) || '[]');
    // 限制最大数量，避免排除太多视频
    if (viewed.length > MAX_VIEWED_VIDEOS) {
      const trimmed = viewed.slice(0, MAX_VIEWED_VIDEOS);
      localStorage.setItem(VIEWED_VIDEOS_KEY, JSON.stringify(trimmed));
      return trimmed;
    }
    return viewed;
  } catch {
    return [];
  }
}

/**
 * 记录已播放视频
 *
 * 做什么: 将视频 bvid 添加到已看列表（去重）
 * 参数:
 *   - bvid: 视频的唯一标识
 * 返回值: 无
 */
export function saveViewedVideo(bvid: string): void {
  const viewed = getViewedVideos();
  if (!viewed.includes(bvid)) {
    viewed.unshift(bvid);
    localStorage.setItem(VIEWED_VIDEOS_KEY, JSON.stringify(viewed.slice(0, MAX_VIEWED_VIDEOS)));
  }
}

/**
 * 清空已看视频历史
 *
 * 做什么: 删除 localStorage 中的已看视频记录
 * 参数: 无
 * 返回值: 无
 */
export function clearViewedVideos(): void {
  localStorage.removeItem(VIEWED_VIDEOS_KEY);
}

// ============================================
// 数据格式化
// ============================================

/**
 * 格式化播放量
 *
 * 做什么: 将数字格式化为易读的播放量显示
 * 参数:
 *   - count: 原始播放量数字
 * 返回值: string - 格式化后的字符串，如 "1.5万"
 *
 * 示例:
 *   - formatPlayCount(15000) => "1.5万"
 *   - formatPlayCount(500) => "500"
 */
export function formatPlayCount(count: number): string {
  if (count >= 10000) return (count / 10000).toFixed(1) + '万';
  return count.toString();
}
