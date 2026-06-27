/**
 * 混合搜索API
 * 合并 CMS视频源 + 豆瓣信息
 *
 * 流程：
 * 1. 从CMS获取视频源（用于播放）
 * 2. 从豆瓣获取电影信息（海报、评分、简介）
 * 3. 智能匹配合并数据
 */

import { NextRequest, NextResponse } from "next/server";

// 导入统一的 CMS 源配置
import { getEnabledSources, getSearchUrl, type CmsSource } from '@/lib/cms-sources';

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
}

/**
 * 模拟浏览器请求头
 */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.douban.com/',
};

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
 * 从所有CMS源搜索
 */
async function searchAllCms(keyword: string): Promise<any[]> {
  const allResults: any[] = [];
  const sources = getEnabledSources().slice(0, 3); // 只用前3个优先级最高的源

  // 并行搜索
  const promises = sources.map(source => searchCms(keyword, source));
  const results = await Promise.all(promises);

  for (const result of results) {
    allResults.push(...result);
  }

  return allResults;
}

// ==================== 豆瓣 搜索 ====================

/**
 * 搜索豆瓣获取电影信息
 */
async function searchDouban(keyword: string): Promise<any[]> {
  const results: any[] = [];

  try {
    // 尝试多个豆瓣API端点
    const DOUBAN_APIS = [
      `https://www.douban.com/j/search_suggestion?q=${encodeURIComponent(keyword)}`,
      `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`,
    ];

    for (const searchUrl of DOUBAN_APIS) {
      try {
        const response = await fetch(searchUrl, {
          headers: HEADERS,
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) continue;

        const data = await response.json();

        // 提取电影ID列表
        const movieIds: string[] = [];

        // 处理不同的API响应格式
        if (data?.items) {
          for (const item of data.items) {
            if (item.url?.includes('movie/subject/')) {
              const id = item.url.match(/subject\/(\d+)/)?.[1];
              if (id) movieIds.push(id);
            }
          }
        } else if (Array.isArray(data)) {
          for (const item of data) {
            if (item.id) movieIds.push(item.id);
          }
        }

        // 获取每部电影的详细信息
        for (const id of movieIds.slice(0, 3)) {
          try {
            const detail = await getDoubanDetail(id);
            if (detail) results.push(detail);
          } catch (e) {
            continue;
          }
        }

        if (results.length > 0) break;
      } catch (e) {
        continue;
      }
    }
  } catch (error) {
    console.error('豆瓣搜索失败:', error);
  }

  return results;
}

/**
 * 获取豆瓣电影详情
 */
async function getDoubanDetail(id: string): Promise<any | null> {
  try {
    const url = `https://movie.douban.com/j/subject_abstract?subject_id=${id}`;

    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.subject) return null;

    const subject = data.subject;

    return {
      id: `douban_${id}`,
      title: subject.title || '',
      year: subject.year || '',
      cover: subject.cover_url || '',
      rating: parseFloat(subject.score) || 0,
      genres: subject.types || [],
      description: cleanHtml(subject.abstract || ''),
      actors: subject.actors || [],
      directors: subject.directors || [],
    };
  } catch (error) {
    return null;
  }
}

// ==================== 数据合并 ====================

/**
 * 智能匹配 CMS 和豆瓣数据
 */
function mergeData(cmsResults: any[], doubanResults: any[]): MovieResult[] {
  const merged: MovieResult[] = [];
  const usedDouban = new Set<string>();

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
    });
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

  // 并行搜索 CMS 和豆瓣
  const [cmsResults, doubanResults] = await Promise.all([
    searchAllCms(keyword),
    searchDouban(keyword),
  ]);

  // 合并数据
  const merged = mergeData(cmsResults, doubanResults);

  // 统计信息
  const stats = {
    total: merged.length,
    fromDouban: merged.filter(m => m.fromDouban).length,
    fromCms: cmsResults.length,
  };

  return NextResponse.json({
    success: merged.length > 0,
    keyword,
    stats,
    results: merged,
  });
}
