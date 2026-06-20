/**
 * 多源视频系统类型定义
 *
 * 定义视频源配置、解析器接口、搜索结果等核心类型
 */

// ============================================
// 视频源配置类型
// ============================================

/** 视频源类型 */
export type VideoSourceType = 'cms' | 'api' | 'scrape' | 'direct';

/** 视频源状态 */
export type VideoSourceStatus = 'active' | 'inactive' | 'error';

/** 视频源配置 */
export interface VideoSourceConfig {
  id: string;
  name: string;                    // 视频源名称
  code: string;                    // 唯一标识
  type: VideoSourceType;           // 类型
  base_url: string;                // API基础地址
  api_format?: 'json' | 'xml';    // 返回格式
  parser_config?: Record<string, any>; // 解析器配置
  search_path?: string;            // 搜索路径模板
  detail_path?: string;            // 详情路径模板
  categories?: string[];           // 支持的分类
  priority: number;                // 优先级
  enabled: boolean;                // 是否启用
  status: VideoSourceStatus;       // 状态
  last_sync_at?: string;           // 上次同步时间
  error_message?: string;          // 错误信息
  created_at: string;
  updated_at: string;
}

// ============================================
// 视频数据类型
// ============================================

/** 视频类型 */
export type VideoType = 'movie' | 'tv' | 'anime' | 'documentary';

/** 视频详情 */
export interface VideoDetail {
  id: string;                      // 原始ID
  title: string;                   // 标题
  description?: string;            // 简介
  cover?: string;                  // 封面图
  poster?: string;                 // 海报图
  year?: number;                   // 年份
  genre?: string[];                // 类型
  director?: string[];             // 导演
  actors?: string[];               // 演员
  rating?: number;                 // 评分
  area?: string;                   // 地区
  language?: string;               // 语言
  episodes?: Episode[];            // 剧集列表
  source_url?: string;             // 原始链接
  extra_data?: Record<string, any>; // 额外数据
}

/** 剧集信息 */
export interface Episode {
  id: string;                      // 剧集ID
  title: string;                   // 标题
  url: string;                     // 播放链接
  episode_number?: number;         // 集数
  season_number?: number;          // 季数
  duration?: number;               // 时长（秒）
  description?: string;            // 简介
}

/** 播放地址 */
export interface PlayUrl {
  url: string;                     // 播放链接
  type: 'mp4' | 'm3u8' | 'flv' | 'mpd'; // 格式
  quality?: string;                // 清晰度
  name?: string;                   // 线路名称
  headers?: Record<string, string>; // 请求头
}

// ============================================
// 搜索相关类型
// ============================================

/** 搜索结果 */
export interface SearchResult {
  id: string;                      // 视频ID
  title: string;                   // 标题
  cover?: string;                  // 封面图
  year?: number;                   // 年份
  type?: VideoType;                // 类型
  source: string;                  // 来源（视频源code）
  source_name: string;             // 来源名称
  url?: string;                    // 详情链接
  extra_data?: Record<string, any>;
}

/** 搜索参数 */
export interface SearchParams {
  query: string;                   // 搜索关键词
  sources?: string[];              // 指定视频源（可选）
  categories?: string[];           // 分类过滤
  page?: number;                   // 页码
  limit?: number;                  // 每页数量
}

/** 搜索响应 */
export interface SearchResponse {
  success: boolean;
  data: SearchResult[];
  total: number;
  page: number;
  limit: number;
  sources_used: string[];          // 使用的视频源
  errors?: SourceError[];          // 错误信息
}

/** 视频源错误 */
export interface SourceError {
  source: string;                  // 视频源code
  source_name: string;             // 视频源名称
  error: string;                   // 错误信息
}

// ============================================
// 解析器接口
// ============================================

/** 视频源解析器接口 */
export interface VideoSourceParser {
  /** 获取视频源配置 */
  getConfig(): VideoSourceConfig;

  /** 搜索视频 */
  search(params: SearchParams): Promise<SearchResult[]>;

  /** 获取视频详情 */
  getDetail(url: string): Promise<VideoDetail>;

  /** 获取播放地址 */
  getPlayUrl(url: string): Promise<PlayUrl[]>;

  /** 测试连接 */
  testConnection(): Promise<boolean>;
}

// ============================================
// 日志相关类型
// ============================================

/** 日志操作类型 */
export type LogAction = 'search' | 'detail' | 'play' | 'test' | 'error';

/** 日志记录 */
export interface SourceLog {
  id: string;
  source_id: string;
  action: LogAction;
  request_url?: string;
  response_code?: number;
  response_time_ms?: number;
  error_message?: string;
  created_at: string;
}
