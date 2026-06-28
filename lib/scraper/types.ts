/**
 * 刮削器类型定义
 *
 * 定义电影元数据、刮削器接口等核心类型
 */

// ============================================
// 电影元数据类型
// ============================================

/** 电影元数据 */
export interface MovieMetadata {
  // 基本信息
  title: string;                    // 标题
  original_title?: string;          // 原始标题
  tagline?: string;                 // 标语
  description?: string;             // 简介
  overview?: string;                // 详细描述

  // 时间信息
  year?: number;                    // 年份
  release_date?: string;            // 发布日期
  runtime?: number;                 // 时长（分钟）

  // 分类信息
  genres?: Genre[];                 // 类型列表
  keywords?: string[];              // 关键词

  // 评分信息
  rating?: number;                  // 评分（0-10）
  rating_count?: number;            // 评分人数
  popularity?: number;              // 热度

  // 人物信息
  director?: Person[];              // 导演
  cast?: CastMember[];              // 演员
  crew?: CrewMember[];              // 工作人员

  // 媒体信息
  poster_path?: string;             // 海报路径
  backdrop_path?: string;           // 背景图路径
  trailer_url?: string;             // 预告片链接

  // 其他信息
  original_language?: string;       // 原始语言
  spoken_languages?: Language[];    // 支持语言
  production_countries?: Country[]; // 制作国家
  production_companies?: Company[]; // 制作公司
  status?: string;                  // 状态（Released/Post Production等）
  budget?: number;                  // 预算
  revenue?: number;                 // 票房

  // 外部ID
  external_ids?: ExternalIds;       // 外部ID
}

/** 类型 */
export interface Genre {
  id: number;
  name: string;
}

/** 人物 */
export interface Person {
  id: number;
  name: string;
  profile_path?: string;
  character?: string;               // 角色名（演员）
  job?: string;                     // 职位（工作人员）
  order?: number;                   // 排序
}

/** 演员 */
export interface CastMember extends Person {
  character: string;
  order: number;
}

/** 工作人员 */
export interface CrewMember extends Person {
  job: string;
  department: string;
}

/** 语言 */
export interface Language {
  iso_639_1: string;
  name: string;
}

/** 国家 */
export interface Country {
  iso_3166_1: string;
  name: string;
}

/** 公司 */
export interface Company {
  id: number;
  name: string;
  logo_path?: string;
  origin_country?: string;
}

/** 外部ID */
export interface ExternalIds {
  imdb_id?: string;
  tmdb_id?: number;
  douban_id?: number;
  facebook_id?: string;
  instagram_id?: string;
  twitter_id?: string;
  wikidata_id?: string;
}

// ============================================
// 刮削器接口类型
// ============================================

/** 刮削结果 */
export interface ScrapeResult {
  success: boolean;
  data?: MovieMetadata;
  source: string;                   // 数据来源
  error?: string;
  cached?: boolean;                 // 是否来自缓存
}

/** 搜索结果（用于刮削匹配） */
export interface ScrapeSearchResult {
  id: number;
  title: string;
  original_title?: string;
  year?: number;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  popularity?: number;
}

/** 刮削器配置 */
export interface ScraperConfig {
  api_key?: string;
  language?: string;                // 语言（zh-CN, en-US等）
  region?: string;                  // 地区（CN, US等）
  include_adult?: boolean;          // 是否包含成人内容
  timeout?: number;                 // 超时时间（毫秒）
}

// ============================================
// TMDB 特定类型
// ============================================

/** TMDB 搜索响应 */
export interface TMDBSearchResponse {
  page: number;
  results: TMDBMovieResult[];
  total_pages: number;
  total_results: number;
}

/** TMDB 电影结果 */
export interface TMDBMovieResult {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  adult: boolean;
  original_language: string;
}

/** TMDB 电影详情 */
export interface TMDBMovieDetail extends TMDBMovieResult {
  tagline: string;
  runtime: number;
  budget: number;
  revenue: number;
  status: string;
  genres: Genre[];
  production_companies: Company[];
  production_countries: Country[];
  spoken_languages: Language[];
  external_ids?: ExternalIds;
  credits?: {
    cast: CastMember[];
    crew: CrewMember[];
  };
  videos?: {
    results: Array<{
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
    }>;
  };
}

/** TMDB 配置 */
export interface TMDBConfig {
  images: {
    base_url: string;
    secure_base_url: string;
    backdrop_sizes: string[];
    logo_sizes: string[];
    poster_sizes: string[];
    profile_sizes: string[];
    still_sizes: string[];
  };
}
