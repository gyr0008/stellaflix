/**
 * 核心类型定义
 *
 * 用途: 定义项目中使用的 TypeScript 类型
 * 依赖: 无
 * 架构: 统一的类型定义，供全项目复用
 */

// ============================================
// 内容类型
// ============================================

/**
 * 内容类型枚举
 *
 * 做什么: 定义支持的内容类型
 */
export type ContentType = "movie" | "documentary" | "anime" | "tv" | "variety" | "kids" | "other";

// ============================================
// 电影相关类型
// ============================================

/**
 * 电影数据结构
 *
 * 做什么: 定义电影/纪录片等视频内容的数据结构
 * 用于: 数据库存储、API 返回、组件渲染
 */
export interface Movie {
  /** 唯一标识 */
  id: string;
  /** 标题 */
  title: string;
  /** 描述/简介 */
  description: string;
  /** 海报图片 URL */
  poster_url: string;
  /** 背景图片 URL */
  backdrop_url: string;
  /** 视频播放地址 */
  video_url: string;
  /** 预告片地址（可选） */
  trailer_url: string | null;
  /** 评分（0-10） */
  rating: number;
  /** 评分人数 */
  rating_count: number;
  /** 发布年份 */
  year: number;
  /** 时长（分钟） */
  duration: number;
  /** 类型标签列表 */
  genre: string[];
  /** 导演（可选） */
  director: string | null;
  /** 演员列表 */
  cast_members: string[];
  /** 是否已发布 */
  is_published: boolean;
  /** 是否为付费内容 */
  is_premium: boolean;
  /** 内容类型 */
  type: ContentType;
  /** 创建时间 */
  created_at: string;
}

// ============================================
// 用户数据类型
// ============================================

/**
 * 收藏数据结构
 *
 * 做什么: 定义用户收藏记录的数据结构
 */
export interface Favorite {
  /** 记录 ID */
  id: string;
  /** 用户 ID */
  user_id: string;
  /** 电影 ID */
  movie_id: string;
  /** 收藏时间 */
  created_at: string;
}

/**
 * 观看进度数据结构
 *
 * 做什么: 定义用户观看进度的数据结构
 */
export interface WatchProgress {
  /** 记录 ID */
  id: string;
  /** 用户 ID */
  user_id: string;
  /** 电影 ID */
  movie_id: string;
  /** 当前播放位置（秒） */
  position_seconds: number;
  /** 视频总时长（秒） */
  duration_seconds: number;
  /** 是否看完 */
  completed: boolean;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 观看统计数据结构
 *
 * 做什么: 定义用户观看统计的数据结构
 */
export interface WatchStats {
  /** 总观看时长（秒） */
  total_seconds: number;
  /** 已看电影数量 */
  movies_watched: number;
  /** 已看纪录片数量 */
  documentaries_watched: number;
}
