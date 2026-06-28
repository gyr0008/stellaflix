/**
 * 豆瓣评分爬虫
 *
 * 从豆瓣获取电影评分信息
 * 注意：豆瓣有反爬机制，需要设置合理的 headers 和请求间隔
 */

import { ScraperBase } from './scraper-base';
import type { MovieMetadata, ScrapeSearchResult, ScrapeResult } from './types';

/** 豆瓣电影搜索结果 */
interface DoubanSearchResult {
  id: string;
  title: string;
  year: string;
  cover: string;
  rating: {
    count: number;
    max: number;
    starCount: number[];
    average: number;
  };
  episodes_info?: string;
  genres?: string[];
  actors?: string[];
}

/** 豆瓣电影详情 */
interface DoubanMovieDetail {
  id: string;
  title: string;
  original_title?: string;
  year: string;
  genres: string[];
  directors: string[];
  actors: string[];
  rating: {
    max: number;
    average: number;
    stars: string;
    min: number;
  };
  rating_count: number;
  summary: string;
  year_int?: number;
  countries?: string[];
  languages?: string[];
  pubdate?: string[];
  image: string;
  alt: string;
  images?: {
    small: string;
    large: string;
    medium: string;
  };
  wish_count?: number;
  collect_count?: number;
}

export class DoubanScraper extends ScraperBase {
  private baseUrl = 'https://movie.douban.com';
  private searchUrl = 'https://movie.douban.com/j/subject_suggest';
  private apiBaseUrl = 'https://api.douban.com/v2/movie';

  // 模拟浏览器 headers
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://movie.douban.com/',
  };

  constructor() {
    super({
      language: 'zh-CN',
      timeout: 15000,
    });
  }

  /**
   * 获取刮削器名称
   */
  getName(): string {
    return '豆瓣';
  }

  /**
   * 获取基础 URL
   */
  protected getBaseUrl(): string {
    return 'https://img.doubanio.com/view/photo/s_ratio_poster/public/';
  }

  /**
   * 搜索电影
   * @param query - 搜索关键词
   * @param year - 年份（可选）
   * @returns 搜索结果列表
   */
  async search(query: string, year?: number): Promise<ScrapeSearchResult[]> {
    // 检查缓存
    const cacheKey = `douban:search:${query}:${year || ''}`;
    const cached = this.getCache<ScrapeSearchResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // 使用 subject_suggest API
      const params = new URLSearchParams({
        q: query,
        type: 'movie',
      });

      const url = `${this.searchUrl}?${params.toString()}`;

      const response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(this.config.timeout || 15000),
      });

      if (!response.ok) {
        console.warn(`豆瓣搜索失败: ${response.status}`);
        return [];
      }

      const data = await response.json() as DoubanSearchResult[];

      // 过滤和转换结果
      let results: ScrapeSearchResult[] = data
        .filter(item => item.year && item.rating)
        .map(item => ({
          id: parseInt(item.id),
          title: item.title,
          year: parseInt(item.year),
          poster_path: item.cover,
          overview: '',
          popularity: item.rating.count || 0,
        }));

      // 如果指定了年份，优先显示该年份的结果
      if (year) {
        const exactYear = results.filter(r => r.year === year);
        const otherYears = results.filter(r => r.year !== year);
        results = [...exactYear, ...otherYears];
      }

      // 设置缓存
      this.setCache(cacheKey, results);

      return results;
    } catch (error) {
      console.error('豆瓣搜索错误:', error);
      return [];
    }
  }

  /**
   * 获取电影详情
   * @param id - 豆瓣电影ID
   * @returns 电影元数据
   */
  async getMovieDetail(id: number): Promise<MovieMetadata> {
    // 检查缓存
    const cacheKey = `douban:detail:${id}`;
    const cached = this.getCache<MovieMetadata>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // 豆瓣没有公开 API，需要从网页提取数据
      // 这里使用移动端 API（相对稳定）
      const url = `${this.baseUrl}/subject/${id}/mobile`;

      const response = await fetch(url, {
        headers: {
          ...this.headers,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        },
        signal: AbortSignal.timeout(this.config.timeout || 15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // 解析 HTML 提取数据
      const html = await response.text();
      const metadata = this.parseHtmlToMetadata(html, id);

      // 设置缓存
      this.setCache(cacheKey, metadata);

      return metadata;
    } catch (error) {
      console.error(`豆瓣详情获取失败 (ID: ${id}):`, error);
      throw error;
    }
  }

  /**
   * 从 HTML 解析电影元数据
   * @param html - HTML 内容
   * @param id - 电影ID
   * @returns 电影元数据
   */
  private parseHtmlToMetadata(html: string, id: number): MovieMetadata {
    // 提取标题
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' (豆瓣)', '').trim() : '未知';

    // 提取评分
    const ratingMatch = html.match(/property="v:average"[^>]*>([^<]+)</);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    // 提取评分人数
    const ratingCountMatch = html.match(/property="v:votes"[^>]*>([^<]+)</);
    const ratingCount = ratingCountMatch ? parseInt(ratingCountMatch[1]) : 0;

    // 提取年份
    const yearMatch = html.match(/<span class="year">\((\d{4})\)/);
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;

    // 提取类型
    const genreMatches = html.match(/property="v:genre"[^>]*>([^<]+)</g) || [];
    const genres = genreMatches.map(m => {
      const match = m.match(/>([^<]+)</);
      return match ? match[1].trim() : '';
    }).filter(Boolean);

    // 提取导演
    const directorMatches = html.match(/rel="v:directedBy"[^>]*>([^<]+)</g) || [];
    const directors = directorMatches.map(m => {
      const match = m.match(/>([^<]+)</);
      return match ? match[1].trim() : '';
    }).filter(Boolean);

    // 提取演员
    const actorMatches = html.match(/rel="v:starring"[^>]*>([^<]+)</g) || [];
    const actors = actorMatches.map(m => {
      const match = m.match(/>([^<]+)</);
      return match ? match[1].trim() : '';
    }).filter(Boolean);

    // 提取简介
    const summaryMatch = html.match(/property="v:summary"[^>]*>([\s\S]*?)<\/span>/);
    const summary = summaryMatch ? this.cleanHtml(summaryMatch[1]) : '';

    // 提取地区
    const countryMatch = html.match(/制片国家\/地区:<\/span>\s*([^<]+)/);
    const countries = countryMatch ? countryMatch[1].split('/').map(s => s.trim()) : [];

    // 提取语言
    const languageMatch = html.match(/语言:<\/span>\s*([^<]+)/);
    const languages = languageMatch ? languageMatch[1].split('/').map(s => s.trim()) : [];

    // 提取海报
    const posterMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/);
    const poster = posterMatch ? posterMatch[1] : '';

    return {
      title,
      original_title: title,
      year,
      release_date: year ? `${year}-01-01` : undefined,
      genres: genres.map(g => ({ id: 0, name: g })),
      director: directors.map((d, i) => ({ id: i, name: d })),
      cast: actors.slice(0, 10).map((a, i) => ({
        id: i,
        name: a,
        character: '',
        order: i,
      })),
      rating,
      rating_count: ratingCount,
      description: summary,
      overview: summary,
      poster_path: poster,
      production_countries: countries.map(c => ({ iso_3166_1: '', name: c })),
      original_language: languages[0] || 'zh',
      spoken_languages: languages.map(l => ({ iso_639_1: '', name: l })),
      external_ids: {
        douban_id: id,
      },
    };
  }

  /**
   * 根据电影名称搜索并获取评分
   * @param title - 电影名称
   * @param year - 年份（可选）
   * @returns 刮削结果
   */
  async searchAndGetRating(title: string, year?: number): Promise<ScrapeResult> {
    try {
      const searchResults = await this.search(title, year);

      if (searchResults.length === 0) {
        return this.createErrorResult(`未找到 "${title}" 相关的电影`);
      }

      // 获取第一个结果的详情
      const detail = await this.getMovieDetail(searchResults[0].id);

      return this.createSuccessResult(detail);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : '获取评分失败'
      );
    }
  }
}

/**
 * 创建豆瓣爬虫实例
 */
export function createDoubanScraper(): DoubanScraper {
  return new DoubanScraper();
}
