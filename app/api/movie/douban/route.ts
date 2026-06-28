/**
 * 豆瓣API代理
 * 用于获取电影的海报、评分、简介等信息
 * 处理豆瓣的反爬限制
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * 豆瓣搜索结果类型
 */
interface DoubanMovie {
  id: string;
  title: string;
  year: string;
  cover: string;      // 海报URL
  rating: number;     // 评分
  genres: string[];   // 类型
  description: string; // 简介
  actors: string[];   // 演员
  directors: string[]; // 导演
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

/**
 * 从豆瓣搜索页面提取电影信息
 * 使用移动端API（更稳定）
 */
async function searchDouban(keyword: string): Promise<DoubanMovie[]> {
  const results: DoubanMovie[] = [];

  try {
    // 使用豆瓣移动端搜索API
    const searchUrl = `https://www.douban.com/j/search_suggestion?q=${encodeURIComponent(keyword)}`;

    const response = await fetch(searchUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`豆瓣搜索响应错误: ${response.status}`);
    }

    const data = await response.json();

    // 提取电影ID列表
    const movieIds: string[] = [];
    if (data?.items) {
      for (const item of data.items) {
        if (item.url?.includes('movie/subject/')) {
          const id = item.url.match(/subject\/(\d+)/)?.[1];
          if (id) movieIds.push(id);
        }
      }
    }

    // 获取每部电影的详细信息
    for (const id of movieIds.slice(0, 5)) {
      try {
        const movie = await getMovieDetail(id);
        if (movie) results.push(movie);
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
 * 获取电影详情
 */
async function getMovieDetail(id: string): Promise<DoubanMovie | null> {
  try {
    // 使用豆瓣API获取电影信息
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
      cover: subject.cover_url || subject.pic?.normal || '',
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

/**
 * 备用方案：通过代理服务获取豆瓣数据
 */
async function searchDoubanViaProxy(keyword: string): Promise<DoubanMovie[]> {
  // 使用公开的豆瓣代理服务
  const PROXY_SERVICES = [
    'https://douban.api.mcloc.cn',
    'https://api.douban.com',
  ];

  for (const proxy of PROXY_SERVICES) {
    try {
      const url = `${proxy}/v2/movie/search?q=${encodeURIComponent(keyword)}&start=0&count=5`;

      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (!data?.subjects) continue;

      return data.subjects.map((item: any) => ({
        id: `douban_${item.id}`,
        title: item.title || '',
        year: item.year || '',
        cover: item.image || item.images?.large || '',
        rating: item.rating?.average || 0,
        genres: item.genres || [],
        description: cleanHtml(item.summary || ''),
        actors: item.casts?.map((c: any) => c.name) || [],
        directors: item.directors?.map((d: any) => d.name) || [],
      }));
    } catch (error) {
      continue;
    }
  }

  return [];
}

/**
 * GET /api/movie/douban?wd=关键词
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

  // 尝试直接搜索
  let results = await searchDouban(keyword);

  // 如果直接搜索失败，尝试代理
  if (results.length === 0) {
    results = await searchDoubanViaProxy(keyword);
  }

  return NextResponse.json({
    success: results.length > 0,
    keyword,
    total: results.length,
    results,
  });
}
