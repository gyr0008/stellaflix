/**
 * 电影详情 API（猫眼 + 豆瓣双源容灾）
 *
 * GET /api/scraper/douban?id=豆瓣ID 或 wd=电影名
 *
 * 数据源优先级：
 * 1. 猫眼 - 实时热映数据，评分准确
 * 2. 豆瓣 - 备用方案，详情更丰富
 *
 * 特性：
 * - 内存缓存：30 分钟 TTL，减少重复请求
 * - 自动降级：猫眼失败时自动切换豆瓣
 * - User-Agent 轮换：避免反爬
 */

import { NextRequest, NextResponse } from 'next/server';
import { cache, CacheKeys } from '@/lib/cache';
import { getHotMovies, MaoyanMovie } from '@/lib/maoyan';

// ==========================================
// 类型定义
// ==========================================

/**
 * 统一的电影数据结构（返回给前端）
 */
interface UnifiedMovie {
  /** 数据来源 */
  source: 'maoyan' | 'douban';
  /** 电影 ID */
  id: string;
  /** 电影名称（中文） */
  title: string;
  /** 原始名称 */
  originalTitle: string;
  /** 简介 */
  description: string;
  /** 年份 */
  year: string;
  /** 评分 */
  rating: number;
  /** 评分人数 */
  ratingCount: number;
  /** 类型 */
  genres: string[];
  /** 导演 */
  directors: string[];
  /** 演员 */
  actors: string[];
  /** 海报 URL */
  poster: string;
  /** 国家/地区 */
  country: string;
  /** 语言 */
  language: string;
  /** 时长（分钟） */
  runtime?: number;
  /** 详细剧情 */
  summary: string;
}

// ==========================================
// 工具函数
// ==========================================

/** User-Agent 池 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
];

/** 随机获取 User-Agent */
function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ==========================================
// 数据源 1：猫眼（优先）
// ==========================================

/**
 * 从猫眼匹配电影详情
 * @param keyword - 搜索关键词
 * @returns 匹配的电影详情
 */
async function fetchFromMaoyan(keyword: string): Promise<UnifiedMovie | null> {
  try {
    const hotMovies: MaoyanMovie[] = await getHotMovies();
    if (hotMovies.length === 0) return null;

    // 1. 精确匹配名称
    let matched = hotMovies.find(
      (m) => m.title === keyword || m.originalTitle === keyword
    );

    // 2. 模糊匹配（包含关键词）
    if (!matched) {
      matched = hotMovies.find(
        (m) => m.title.includes(keyword) || keyword.includes(m.title)
      );
    }

    // 3. 部分匹配（去掉空格/标点后比较）
    if (!matched) {
      const cleanKeyword = keyword.replace(/[\s\-:：]/g, '').toLowerCase();
      matched = hotMovies.find((m) => {
        const cleanTitle = m.title.replace(/[\s\-:：]/g, '').toLowerCase();
        return cleanTitle.includes(cleanKeyword) || cleanKeyword.includes(cleanTitle);
      });
    }

    if (!matched) return null;

    console.log(`[猫眼] 匹配成功: ${matched.title}`);
    return {
      source: 'maoyan',
      id: String(matched.id),
      title: matched.title,
      originalTitle: matched.originalTitle,
      description: '', // 猫眼 API 不提供简介
      year: matched.year,
      rating: matched.rating,
      ratingCount: matched.ratingCount,
      genres: matched.genres,
      directors: matched.directors,
      actors: matched.actors,
      poster: matched.posterUrl,
      country: matched.country,
      language: '汉语',
      runtime: matched.runtime,
      summary: '',
    };
  } catch (error) {
    console.error('[猫眼] 获取失败:', error);
    return null;
  }
}

// ==========================================
// 数据源 2：豆瓣（备用）
// ==========================================

/**
 * 从豆瓣移动端 API 获取电影详情
 * @param id - 豆瓣电影 ID
 * @returns 电影详情
 */
async function fetchFromDoubanMobile(id: string): Promise<UnifiedMovie | null> {
  try {
    const url = `https://m.douban.com/rexxar/api/v2/movie/${id}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json',
        'Referer': 'https://m.douban.com/',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();

    console.log(`[豆瓣] 获取成功: ${data.title}`);
    return {
      source: 'douban',
      id,
      title: data.title || '',
      originalTitle: data.original_title || '',
      description: data.intro || '',
      year: data.year || '',
      rating: data.rating?.value || 0,
      ratingCount: data.rating?.count || 0,
      genres: data.genres || [],
      directors: data.directors?.map((d: any) => d.name) || [],
      actors: data.actors?.map((a: any) => a.name) || [],
      poster: data.cover?.url || '',
      country: data.countries?.[0] || '',
      language: '',
      runtime: data.durations?.[0] ? parseInt(data.durations[0]) : undefined,
      summary: data.intro || '',
    };
  } catch (error) {
    console.error('[豆瓣移动端] 获取失败:', error);
    return null;
  }
}

/**
 * 从豆瓣网页爬取（最后备用）
 * @param id - 豆瓣电影 ID
 * @returns 电影详情
 */
async function fetchFromDoubanWeb(id: string): Promise<UnifiedMovie | null> {
  try {
    const url = `https://movie.douban.com/subject/${id}/`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cookie': `bid=${Math.random().toString(36).substring(2, 15)}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // 提取各字段
    const titleMatch = html.match(/<span\s+property="v:itemreviewed">([^<]+)<\/span>/);
    const yearMatch = html.match(/<span class="year">\((\d{4})\)<\/span>/);
    const ratingMatch = html.match(/<strong[^>]*property="v:average">([^<]+)<\/strong>/);
    const ratingCountMatch = html.match(/<span property="v:votes">([^<]+)<\/span>/);
    const posterMatch = html.match(/<img[^>]*rel="v:image"[^>]*src="([^"]+)"/);

    // 提取类型
    const genres: string[] = [];
    for (const match of html.matchAll(/<span property="v:genre">([^<]+)<\/span>/g)) {
      genres.push(match[1]);
    }

    // 提取导演
    const directors: string[] = [];
    for (const match of html.matchAll(/<a[^>]*rel="v:directedBy"[^>]*>([^<]+)<\/a>/g)) {
      directors.push(match[1]);
    }

    // 提取演员
    const actors: string[] = [];
    for (const match of html.matchAll(/<a[^>]*rel="v:starring"[^>]*>([^<]+)<\/a>/g)) {
      actors.push(match[1]);
    }

    // 提取简介
    let summary = '';
    const summaryMatch = html.match(/<span property="v:summary"[^>]*>([\s\S]*?)<\/span>/);
    if (summaryMatch) {
      summary = summaryMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    if (!summary) {
      const altMatch = html.match(/<div class="indent"[^>]*>([\s\S]*?)<\/div>/);
      if (altMatch) summary = altMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    const title = titleMatch?.[1] || '';
    console.log(`[豆瓣网页] 获取成功: ${title}`);

    return {
      source: 'douban',
      id,
      title,
      originalTitle: title,
      description: summary,
      year: yearMatch?.[1] || '',
      rating: parseFloat(ratingMatch?.[1] || '0'),
      ratingCount: parseInt(ratingCountMatch?.[1] || '0'),
      genres,
      directors,
      actors,
      poster: posterMatch?.[1] || '',
      country: '',
      language: '',
      summary,
    };
  } catch (error) {
    console.error('[豆瓣网页] 获取失败:', error);
    return null;
  }
}

/**
 * 从豆瓣搜索电影（获取 ID）
 * @param keyword - 搜索关键词
 * @returns 豆瓣电影 ID
 */
async function searchDoubanId(keyword: string): Promise<string | null> {
  try {
    const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://movie.douban.com/',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    // 优先找电影类型
    const movie = data.find((item: any) => item.type === 'movie');
    return movie?.id || data[0]?.id || null;
  } catch (error) {
    console.error('[豆瓣搜索] 失败:', error);
    return null;
  }
}

// ==========================================
// 主入口：双源容灾
// ==========================================

/**
 * 获取电影详情（猫眼 → 豆瓣）
 * @param params - 查询参数
 * @returns 电影详情
 */
async function getMovieDetail(params: {
  id?: string;
  keyword?: string;
}): Promise<UnifiedMovie | null> {
  const { id, keyword } = params;
  const searchKey = keyword || id || '';

  // 检查缓存
  const cacheKey = CacheKeys.movieDetail(searchKey);
  const cached = cache.get<UnifiedMovie>(cacheKey);
  if (cached) {
    console.log(`[缓存] 命中: ${searchKey}`);
    return cached;
  }

  let result: UnifiedMovie | null = null;

  // 1. 尝试猫眼（仅关键词搜索）
  if (keyword) {
    result = await fetchFromMaoyan(keyword);
    if (result) {
      cache.set(cacheKey, result, 30 * 60 * 1000);
      return result;
    }
  }

  // 2. 尝试豆瓣（移动端 → 网页）
  let doubanId = id;

  // 如果没有 ID，先搜索获取
  if (!doubanId && keyword) {
    doubanId = await searchDoubanId(keyword) || undefined;
  }

  if (doubanId) {
    // 2.1 移动端 API
    result = await fetchFromDoubanMobile(doubanId);
    if (result) {
      cache.set(cacheKey, result, 30 * 60 * 1000);
      return result;
    }

    // 2.2 网页爬取
    result = await fetchFromDoubanWeb(doubanId);
    if (result) {
      cache.set(cacheKey, result, 30 * 60 * 1000);
      return result;
    }
  }

  // 所有数据源失败
  console.error(`[容灾] 所有数据源失败: ${searchKey}`);
  return null;
}

// ==========================================
// API 路由
// ==========================================

/**
 * GET /api/scraper/douban?id=xxx 或 wd=xxx
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const keyword = searchParams.get('wd');

  // 参数校验
  if (!id && !keyword) {
    return NextResponse.json(
      { error: '请提供豆瓣电影 ID (id) 或搜索关键词 (wd)' },
      { status: 400 }
    );
  }

  try {
    const detail = await getMovieDetail({
      id: id || undefined,
      keyword: keyword || undefined,
    });

    if (!detail) {
      return NextResponse.json(
        { error: '获取电影详情失败', id, keyword },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    console.error('电影详情 API 错误:', error);
    return NextResponse.json(
      {
        error: '请求失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
