/**
 * 视频工具函数
 *
 * 统一视频 URL 解析、画质识别、多源聚合等功能
 */

// ============================================
// 类型定义
// ============================================

/** 画质等级 */
export type Quality = '4K' | '1080P' | '720P' | '高清' | '标清' | '未知';

/** 画质分数（用于排序） */
const QUALITY_SCORES: Record<Quality, number> = {
  '4K': 100,
  '1080P': 80,
  '720P': 60,
  '高清': 50,
  '标清': 30,
  '未知': 0,
};

/** 解析后的视频源 */
export interface VideoSource {
  /** 线路名称（如"线路1"、"蓝光"） */
  name: string;
  /** 播放地址 */
  url: string;
  /** 画质等级 */
  quality: Quality;
  /** 画质分数 */
  qualityScore: number;
  /** 来源（CMS 源名称） */
  from: string;
}

/** 搜索结果（带多源） */
export interface AggregatedMovie {
  /** 电影标题 */
  title: string;
  /** 年份 */
  year: string;
  /** 海报 */
  poster: string;
  /** 类型 */
  type: string;
  /** 地区 */
  area: string;
  /** 备注/描述 */
  description: string;
  /** 所有可用的播放源 */
  sources: VideoSource[];
  /** 最佳播放源（画质最高的） */
  bestSource: VideoSource | null;
}

// ============================================
// 画质识别
// ============================================

/**
 * 从标题和 URL 中提取画质信息
 *
 * @param title 视频标题
 * @param url 播放地址
 * @returns 画质等级
 */
export function extractQuality(title: string, url: string): Quality {
  const text = `${title} ${url}`.toLowerCase();

  // 4K 检测
  if (text.includes('4k') || text.includes('2160p') || text.includes('uhd')) {
    return '4K';
  }

  // 1080P 检测
  if (text.includes('1080p') || text.includes('1080')) {
    return '1080P';
  }

  // 720P 检测
  if (text.includes('720p') || text.includes('720')) {
    return '720P';
  }

  // 高清检测
  if (text.includes('高清') || text.includes('hd') || text.includes('bluray') || text.includes('蓝光')) {
    return '高清';
  }

  // 标清检测
  if (text.includes('标清') || text.includes('sd')) {
    return '标清';
  }

  return '未知';
}

/**
 * 获取画质分数（用于排序）
 *
 * @param quality 画质等级
 * @returns 分数
 */
export function getQualityScore(quality: Quality): number {
  return QUALITY_SCORES[quality] || 0;
}

// ============================================
// URL 解析
// ============================================

/**
 * 解析播放 URL 字符串
 *
 * 支持格式：
 * - 直接 URL：http://xxx/video.m3u8
 * - 多集格式：第1集$url1#第2集$url2
 * - 多线路格式：线路名$url1$$$线路名$url2
 *
 * @param rawUrl 原始 URL 字符串
 * @param from 来源名称（CMS 源名称）
 * @returns 解析后的视频源列表（每个线路/集数一个）
 */
export function parseVideoUrls(rawUrl: string, from: string = ''): VideoSource[] {
  if (!rawUrl) return [];

  const sources: VideoSource[] = [];

  // 多线路格式：$$$ 分隔
  if (rawUrl.includes('$$$')) {
    const lines = rawUrl.split('$$$');
    lines.forEach((line, index) => {
      // 解析每条线路
      const parsed = parseSingleLine(line, from);
      if (parsed) {
        sources.push({
          name: parsed.name || `线路${index + 1}`,
          url: parsed.url,
          quality: parsed.quality,
          qualityScore: parsed.qualityScore,
          from,
        });
      }
    });
    return sources;
  }

  // 单线路格式：# 分隔（多集）
  if (rawUrl.includes('#')) {
    const episodes = rawUrl.split('#');
    episodes.forEach((ep, index) => {
      const parsed = parseSingleLine(ep, from);
      if (parsed) {
        sources.push({
          name: parsed.name || `第${index + 1}集`,
          url: parsed.url,
          quality: parsed.quality,
          qualityScore: parsed.qualityScore,
          from,
        });
      }
    });
    return sources;
  }

  // 单集格式：$ 分隔
  if (rawUrl.includes('$')) {
    const parsed = parseSingleLine(rawUrl, from);
    if (parsed) {
      sources.push({
        name: parsed.name || '播放',
        url: parsed.url,
        quality: parsed.quality,
        qualityScore: parsed.qualityScore,
        from,
      });
    }
    return sources;
  }

  // 直接 URL
  if (rawUrl.startsWith('http')) {
    const quality = extractQuality('', rawUrl);
    sources.push({
      name: '播放',
      url: rawUrl,
      quality,
      qualityScore: getQualityScore(quality),
      from,
    });
  }

  return sources;
}

/**
 * 解析单行播放地址
 *
 * 格式：名称$url 或 纯URL
 *
 * @param line 单行字符串
 * @param from 来源名称
 * @returns 解析结果
 */
function parseSingleLine(line: string, from: string = ''): VideoSource | null {
  if (!line) return null;

  // 格式：名称$url
  if (line.includes('$')) {
    const parts = line.split('$');
    const name = parts[0]?.trim() || '';
    const url = parts[parts.length - 1]?.trim() || '';

    if (url.startsWith('http')) {
      const quality = extractQuality(name, url);
      return {
        name,
        url,
        quality,
        qualityScore: getQualityScore(quality),
        from,
      };
    }
  }

  // 直接 URL
  if (line.startsWith('http')) {
    const quality = extractQuality('', line);
    return {
      name: '',
      url: line,
      quality,
      qualityScore: getQualityScore(quality),
      from,
    };
  }

  return null;
}

/**
 * 解析多集播放 URL
 *
 * @param rawUrl 原始 URL 字符串
 * @returns 每集的 URL 列表
 */
export function parseEpisodeUrls(rawUrl: string): { name: string; url: string }[] {
  if (!rawUrl) return [];

  // 多线路格式：取第一条线路
  if (rawUrl.includes('$$$')) {
    const firstLine = rawUrl.split('$$$')[0];
    return parseEpisodeUrls(firstLine);
  }

  // 多集格式：# 分隔
  if (rawUrl.includes('#')) {
    return rawUrl.split('#').map((ep, index) => {
      const parts = ep.split('$');
      if (parts.length >= 2) {
        return { name: parts[0], url: parts[1] };
      }
      return { name: `第${index + 1}集`, url: ep };
    });
  }

  // 单集格式：$ 分隔
  if (rawUrl.includes('$')) {
    const parts = rawUrl.split('$');
    if (parts.length >= 2) {
      return [{ name: parts[0], url: parts[1] }];
    }
  }

  // 直接 URL
  return [{ name: '播放', url: rawUrl }];
}

// ============================================
// 多源聚合
// ============================================

/**
 * 合并多个搜索结果（按标题分组）
 *
 * @param results 来自不同源的搜索结果
 * @returns 合并后的电影列表
 */
export function mergeSearchResults(results: any[]): AggregatedMovie[] {
  const movieMap = new Map<string, AggregatedMovie>();

  for (const item of results) {
    const title = item.vod_name || item.title || '';
    const normalizedTitle = title.toLowerCase().trim();

    if (!normalizedTitle) continue;

    // 尝试找到已存在的电影
    let movie = movieMap.get(normalizedTitle);

    if (!movie) {
      // 创建新电影
      movie = {
        title,
        year: item.vod_year || item.year || '',
        poster: item.vod_pic || item.poster || '',
        type: item.type_name || item.type || '',
        area: item.vod_area || item.area || '',
        description: item.vod_remarks || item.description || '',
        sources: [],
        bestSource: null,
      };
      movieMap.set(normalizedTitle, movie);
    }

    // 添加播放源
    const playUrl = item.vod_play_url || item.playUrl || '';
    const sourceName = item.sourceName || item.from || '';

    if (playUrl) {
      const newSources = parseVideoUrls(playUrl, sourceName);
      movie.sources.push(...newSources);
    }
  }

  // 为每部电影找到最佳源
  const movies = Array.from(movieMap.values());
  for (const movie of movies) {
    // 按画质分数排序
    movie.sources.sort((a, b) => b.qualityScore - a.qualityScore);
    // 取最佳源
    movie.bestSource = movie.sources[0] || null;
  }

  return movies;
}

/**
 * 对搜索结果进行排序
 *
 * 排序规则：
 * 1. 画质优先（4K > 1080P > 720P）
 * 2. 源数量优先（多源更好）
 * 3. 年份优先（新片优先）
 *
 * @param movies 电影列表
 * @returns 排序后的列表
 */
export function sortMoviesByQuality(movies: AggregatedMovie[]): AggregatedMovie[] {
  return [...movies].sort((a, b) => {
    // 1. 最佳画质优先
    const aScore = a.bestSource?.qualityScore || 0;
    const bScore = b.bestSource?.qualityScore || 0;
    if (aScore !== bScore) return bScore - aScore;

    // 2. 源数量优先
    if (a.sources.length !== b.sources.length) {
      return b.sources.length - a.sources.length;
    }

    // 3. 年份优先（新片优先）
    const aYear = parseInt(a.year) || 0;
    const bYear = parseInt(b.year) || 0;
    return bYear - aYear;
  });
}
