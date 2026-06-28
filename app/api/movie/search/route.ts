/**
 * 混合搜索API
 * 合并 CMS视频源 + 豆瓣信息 + NetflixGC
 *
 * 流程：
 * 1. 从CMS获取视频源（用于播放）
 * 2. 从猫眼/豆瓣获取电影信息（海报、评分、简介）
 * 3. 从NetflixGC获取高质量视频源
 * 4. 智能匹配合并数据
 */

import { NextRequest, NextResponse } from "next/server";

// 导入统一的 CMS 源配置
import { getEnabledSources, getSearchUrl, type CmsSource } from '@/lib/cms-sources';
// 导入 NetflixGC 索引搜索
import { searchIndex as searchNetflixGCIndex } from '@/lib/scrapers/netflixgc-index';
// 导入新的豆瓣/猫眼爬取模块
import { cache, CacheKeys } from '@/lib/cache';
import { getHotMovies } from '@/lib/maoyan';

// ==================== 缓存工具 ====================

/**
 * 搜索结果类型
 */
interface MovieResult {
  // 基础信息
  id: string;
  title: string;
  year: string;
  type: string;

  // 豆瓣信息（优先使用）
  poster: string;        // 海报
  rating: number;        // 评分
  description: string;   // 简介
  actors: string[];      // 演员
  directors: string[];   // 导演
  doubanId?: string;     // 豆瓣ID

  // CMS播放信息
  playUrl: string;       // 播放地址
  playFrom: string;      // 来源
  sourceName: string;    // 数据源名称

  // 元数据
  fromDouban: boolean;   // 信息是否来自豆瓣
  fromCms: boolean;      // 视频源是否来自CMS
  fromNetflixGC: boolean; // 视频源是否来自NetflixGC
}

/**
 * 清理HTML标签
 */
function cleanHtml(text: string): string {
  return (text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ==================== CMS 搜索 ====================

/**
 * 搜索CMS视频源
 */
async function searchCms(keyword: string, source: CmsSource): Promise<any[]> {
  try {
    const url = getSearchUrl(source, keyword);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (data.code !== 1 || !data.list) throw new Error('No results');

    return data.list.map((item: any) => ({
      id: item.vod_id,
      title: item.vod_name,
      year: item.vod_year,
      type: item.type_name,
      poster: item.vod_pic,
      description: item.vod_remarks || '',
      playUrl: item.vod_play_url,
      playFrom: item.vod_play_from,
      sourceName: source.name,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * 从所有CMS源搜索（带去重）
 */
async function searchAllCms(keyword: string): Promise<any[]> {
  const allResults: any[] = [];
  const sources = getEnabledSources().slice(0, 3); // 只用前3个优先级最高的源
  const seenTitles = new Set<string>(); // 用于去重

  // 并行搜索
  const promises = sources.map(source => searchCms(keyword, source));
  const results = await Promise.all(promises);

  for (const result of results) {
    for (const item of result) {
      // 去重：标题相似的只保留第一个
      const normalizedTitle = item.title.replace(/\s+/g, '').toLowerCase();
      const isDuplicate = Array.from(seenTitles).some(
        seen => seen.includes(normalizedTitle) || normalizedTitle.includes(seen)
      );

      if (!isDuplicate) {
        seenTitles.add(normalizedTitle);
        allResults.push(item);
      }
    }
  }

  return allResults;
}

/**
 * 搜索所有源（CMS + NetflixGC）
 */
async function searchAllSources(keyword: string): Promise<{ cmsResults: any[], netflixgcResults: any[] }> {
  // 并行搜索 CMS 和 NetflixGC
  const [cmsResults, netflixgcResults] = await Promise.all([
    searchAllCms(keyword),
    searchNetflixGC(keyword),
  ]);

  return { cmsResults, netflixgcResults };
}

// ==================== NetflixGC 搜索 ====================

/**
 * 搜索 NetflixGC 视频源
 *
 * 使用本地索引进行快速搜索
 */
async function searchNetflixGC(keyword: string): Promise<any[]> {
  try {
    // 使用索引搜索
    const results = await searchNetflixGCIndex(keyword);

    // 转换为统一格式
    return results.map(item => ({
      id: item.id,
      title: item.title,
      year: '',
      type: '',
      poster: item.poster,
      description: item.description,
      playUrl: `/netflixgc/play?id=${item.id}&title=${encodeURIComponent(item.title)}`,
      playFrom: 'netflixgc',
      sourceName: 'NetflixGC',
      doubanScore: item.doubanScore,
    }));
  } catch (error) {
    console.error('NetflixGC 搜索失败:', error);
    return [];
  }
}

// ==================== 猫眼/豆瓣 电影信息 ====================

/**
 * 从猫眼/豆瓣获取电影信息
 *
 * 流程：
 * 1. 先检查猫眼热映列表（快速匹配）
 * 2. 如果匹配到，使用猫眼数据
 * 3. 如果未匹配，调用豆瓣API获取详情
 */
async function fetchMovieInfo(keyword: string): Promise<any[]> {
  const results: any[] = [];

  // 1. 先尝试猫眼热映列表
  try {
    const hotMovies = await getHotMovies();

    // 精确匹配
    let matched = hotMovies.find(
      (m) => m.title === keyword || m.originalTitle === keyword
    );

    // 模糊匹配
    if (!matched) {
      matched = hotMovies.find(
        (m) => m.title.includes(keyword) || keyword.includes(m.title)
      );
    }

    if (matched) {
      results.push({
        id: `maoyan_${matched.id}`,
        title: matched.title,
        year: matched.year,
        cover: matched.posterUrl,
        rating: matched.rating,
        genres: matched.genres,
        description: '',
        actors: matched.actors,
        directors: matched.directors,
        source: 'maoyan',
      });
      return results;
    }
  } catch (error) {
    console.error('[猫眼] 获取失败:', error);
  }

  // 2. 猫眼未匹配，尝试豆瓣
  try {
    const DOUBAN_APIS = [
      `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`,
    ];

    for (const searchUrl of DOUBAN_APIS) {
      try {
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://movie.douban.com/',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) continue;

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) continue;

        // 获取前3个电影的详情
        const movieIds = data
          .filter((item: any) => item.type === 'movie')
          .slice(0, 3)
          .map((item: any) => item.id);

        for (const id of movieIds) {
          const detail = await fetchDoubanDetail(id);
          if (detail) results.push(detail);
        }

        if (results.length > 0) break;
      } catch (e) {
        continue;
      }
    }
  } catch (error) {
    console.error('[豆瓣] 搜索失败:', error);
  }

  return results;
}

/**
 * 获取豆瓣电影详情
 */
async function fetchDoubanDetail(id: string): Promise<any | null> {
  // 检查缓存
  const cacheKey = CacheKeys.doubanMovie(id);
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://m.douban.com/rexxar/api/v2/movie/${id}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'application/json',
        'Referer': 'https://m.douban.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json();

    const result = {
      id: `douban_${id}`,
      title: data.title || '',
      year: data.year || '',
      cover: data.cover?.url || '',
      rating: data.rating?.value || 0,
      genres: data.genres || [],
      description: data.intro || '',
      actors: data.actors?.map((a: any) => a.name) || [],
      directors: data.directors?.map((d: any) => d.name) || [],
      source: 'douban',
    };

    // 缓存10分钟
    cache.set(cacheKey, result, 10 * 60 * 1000);

    return result;
  } catch (error) {
    console.error('[豆瓣] 详情获取失败:', error);
    return null;
  }
}

// ==================== 数据合并 ====================

/**
 * 智能匹配 CMS、NetflixGC 和豆瓣数据
 */
function mergeData(
  cmsResults: any[],
  netflixgcResults: any[],
  doubanResults: any[]
): MovieResult[] {
  const merged: MovieResult[] = [];
  const usedDouban = new Set<string>();

  // 合并 CMS 结果
  for (const cms of cmsResults) {
    // 尝试匹配豆瓣数据
    let matchedDouban = null;

    for (const douban of doubanResults) {
      if (usedDouban.has(douban.id)) continue;

      // 匹配规则：标题相似 + 年份相同
      const titleMatch = cms.title.includes(douban.title) || douban.title.includes(cms.title);
      const yearMatch = !cms.year || !douban.year || cms.year === douban.year;

      if (titleMatch && yearMatch) {
        matchedDouban = douban;
        usedDouban.add(douban.id);
        break;
      }
    }

    // 合并数据（豆瓣优先）
    merged.push({
      id: `cms_${cms.id}`,
      title: cms.title,
      year: cms.year || matchedDouban?.year || '',
      type: cms.type || matchedDouban?.genres?.[0] || '',

      // 海报：豆瓣优先
      poster: matchedDouban?.cover || cms.poster || '',

      // 评分：豆瓣优先
      rating: matchedDouban?.rating || 0,

      // 简介：豆瓣优先
      description: matchedDouban?.description || cms.description || '',

      // 演员/导演：豆瓣优先
      actors: matchedDouban?.actors || [],
      directors: matchedDouban?.directors || [],

      doubanId: matchedDouban?.id,

      // 播放信息来自CMS
      playUrl: cms.playUrl,
      playFrom: cms.playFrom,
      sourceName: cms.sourceName,

      fromDouban: !!matchedDouban,
      fromCms: true,
      fromNetflixGC: false,
    });
  }

  // 合并 NetflixGC 结果
  for (const ngc of netflixgcResults) {
    // 检查是否已存在（去重）
    const exists = merged.some(m =>
      m.title === ngc.title ||
      m.title.includes(ngc.title) ||
      ngc.title.includes(m.title)
    );

    if (!exists) {
      // 尝试匹配豆瓣数据
      let matchedDouban = null;

      for (const douban of doubanResults) {
        if (usedDouban.has(douban.id)) continue;

        const titleMatch = ngc.title.includes(douban.title) || douban.title.includes(ngc.title);

        if (titleMatch) {
          matchedDouban = douban;
          usedDouban.add(douban.id);
          break;
        }
      }

      merged.push({
        id: `netflixgc_${ngc.id}`,
        title: ngc.title,
        year: matchedDouban?.year || '',
        type: matchedDouban?.genres?.[0] || '',

        // 海报：豆瓣优先
        poster: matchedDouban?.cover || ngc.poster || '',

        // 评分：豆瓣或NetflixGC评分
        rating: matchedDouban?.rating || parseFloat(ngc.doubanScore) || 0,

        // 简介：豆瓣优先
        description: matchedDouban?.description || ngc.description || '',

        // 演员/导演：豆瓣优先
        actors: matchedDouban?.actors || [],
        directors: matchedDouban?.directors || [],

        doubanId: matchedDouban?.id,

        // 播放信息来自NetflixGC
        playUrl: ngc.playUrl,
        playFrom: 'netflixgc',
        sourceName: 'NetflixGC',

        fromDouban: !!matchedDouban,
        fromCms: false,
        fromNetflixGC: true,
      });
    }
  }

  return merged;
}

/**
 * GET /api/movie/search?wd=关键词
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('wd');

  if (!keyword) {
    return NextResponse.json(
      { error: '请提供搜索关键词 (wd 参数)' },
      { status: 400 }
    );
  }

  // 检查缓存
  const cacheKey = CacheKeys.movieDetail(`search:${keyword.toLowerCase().trim()}`);
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('[搜索缓存] 命中缓存:', keyword);
    return NextResponse.json(cached);
  }

  console.log('[搜索缓存] 未命中，开始搜索:', keyword);

  // 并行搜索 CMS、NetflixGC 和猫眼/豆瓣
  const [sourcesResults, movieInfoResults] = await Promise.all([
    searchAllSources(keyword),
    fetchMovieInfo(keyword),
  ]);

  // 合并数据
  const merged = mergeData(
    sourcesResults.cmsResults,
    sourcesResults.netflixgcResults,
    movieInfoResults
  );

  // 统计信息
  const stats = {
    total: merged.length,
    fromDouban: merged.filter(m => m.fromDouban).length,
    fromCms: merged.filter(m => m.fromCms).length,
    fromNetflixGC: merged.filter(m => m.fromNetflixGC).length,
  };

  const response = {
    success: merged.length > 0,
    keyword,
    stats,
    results: merged,
  };

  // 缓存5分钟
  cache.set(cacheKey, response, 5 * 60 * 1000);
  console.log('[搜索缓存] 已缓存结果:', keyword, '共', merged.length, '条');

  return NextResponse.json(response);
}
