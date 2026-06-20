/**
 * TMDB 刮削器实现
 *
 * 使用 TMDB (The Movie Database) API 获取电影元数据
 * API 文档：https://developer.themoviedb.org/reference/intro/getting-started
 */

import type {
  MovieMetadata,
  ScrapeResult,
  ScrapeSearchResult,
  ScraperConfig,
  TMDBMovieDetail,
  TMDBSearchResponse,
  TMDBConfig,
  CastMember,
  CrewMember,
} from './types';
import { ScraperBase } from './scraper-base';

/** TMDB 配置 */
interface TMDBScraperConfig extends ScraperConfig {
  api_key: string;                  // TMDB API Key
  image_base_url?: string;          // 图片基础 URL
}

export class TMDBScraper extends ScraperBase {
  private tmdbConfig: TMDBScraperConfig;
  private apiBaseUrl = 'https://api.themoviedb.org/3';
  private imageBaseUrl = 'https://image.tmdb.org/t/p';

  constructor(config: TMDBScraperConfig) {
    super(config);
    this.tmdbConfig = config;
  }

  /**
   * 获取刮削器名称
   */
  getName(): string {
    return 'TMDB';
  }

  /**
   * 获取基础 URL（用于图片）
   */
  protected getBaseUrl(): string {
    return this.imageBaseUrl;
  }

  /**
   * 搜索电影
   * @param query - 搜索关键词
   * @param year - 年份（可选）
   * @returns 搜索结果列表
   */
  async search(query: string, year?: number): Promise<ScrapeSearchResult[]> {
    // 检查缓存
    const cacheKey = `search:${query}:${year || ''}`;
    const cached = this.getCache<ScrapeSearchResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 构建请求 URL
    const params = new URLSearchParams({
      api_key: this.tmdbConfig.api_key,
      query: query,
      language: this.config.language || 'zh-CN',
      include_adult: 'false',
    });

    if (year) {
      params.append('year', year.toString());
    }

    const url = `${this.apiBaseUrl}/search/movie?${params.toString()}`;

    try {
      const response = await this.fetchWithTimeout<TMDBSearchResponse>(url);

      // 标准化搜索结果
      const results = this.normalizeSearchResults(response.results, 'TMDB');

      // 设置缓存
      this.setCache(cacheKey, results);

      return results;
    } catch (error) {
      console.error('TMDB search error:', error);
      throw error;
    }
  }

  /**
   * 获取电影详情
   * @param id - TMDB 电影ID
   * @returns 电影元数据
   */
  async getMovieDetail(id: number): Promise<MovieMetadata> {
    // 检查缓存
    const cacheKey = `detail:${id}`;
    const cached = this.getCache<MovieMetadata>(cacheKey);
    if (cached) {
      return cached;
    }

    // 构建请求 URL（包含附加信息）
    const params = new URLSearchParams({
      api_key: this.tmdbConfig.api_key,
      language: this.config.language || 'zh-CN',
      append_to_response: 'credits,videos,external_ids',
    });

    const url = `${this.apiBaseUrl}/movie/${id}?${params.toString()}`;

    try {
      const response = await this.fetchWithTimeout<TMDBMovieDetail>(url);

      // 转换为标准格式
      const metadata = this.convertToMetadata(response);

      // 设置缓存
      this.setCache(cacheKey, metadata);

      return metadata;
    } catch (error) {
      console.error('TMDB detail error:', error);
      throw error;
    }
  }

  /**
   * 根据关键词搜索并获取最匹配的电影详情
   * @param query - 搜索关键词
   * @param year - 年份（可选）
   * @returns 刮削结果
   */
  async searchAndScrape(query: string, year?: number): Promise<ScrapeResult> {
    try {
      // 搜索电影
      const searchResults = await this.search(query, year);

      if (searchResults.length === 0) {
        return this.createErrorResult(`未找到 "${query}" 相关的电影`);
      }

      // 获取第一个结果的详情
      const detail = await this.getMovieDetail(searchResults[0].id);

      return this.createSuccessResult(detail);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : '刮削失败'
      );
    }
  }

  /**
   * 转换 TMDB 电影详情为标准格式
   * @param tmdbMovie - TMDB 电影详情
   * @returns 标准化的电影元数据
   */
  private convertToMetadata(tmdbMovie: TMDBMovieDetail): MovieMetadata {
    // 提取预告片
    let trailerUrl: string | undefined;
    if (tmdbMovie.videos?.results) {
      const trailer = tmdbMovie.videos.results.find(
        (v) => v.type === 'Trailer' && v.site === 'YouTube'
      );
      if (trailer) {
        trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
      }
    }

    // 提取导演
    const directors: MovieMetadata['director'] = [];
    if (tmdbMovie.credits?.crew) {
      const directorCrew = tmdbMovie.credits.crew.filter(
        (c) => c.job === 'Director'
      );
      directors.push(
        ...directorCrew.map((d) => ({
          id: d.id,
          name: d.name,
          profile_path: this.formatImageUrl(d.profile_path),
        }))
      );
    }

    return {
      title: tmdbMovie.title,
      original_title: tmdbMovie.original_title,
      tagline: tmdbMovie.tagline,
      description: tmdbMovie.overview,
      overview: tmdbMovie.overview,
      year: this.parseYear(tmdbMovie.release_date),
      release_date: tmdbMovie.release_date,
      runtime: tmdbMovie.runtime,
      genres: tmdbMovie.genres,
      rating: tmdbMovie.vote_average,
      rating_count: tmdbMovie.vote_count,
      popularity: tmdbMovie.popularity,
      director: directors,
      cast: tmdbMovie.credits?.cast?.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        profile_path: this.formatImageUrl(c.profile_path),
        character: c.character,
        order: c.order,
      })),
      crew: tmdbMovie.credits?.crew?.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        profile_path: this.formatImageUrl(c.profile_path),
        job: c.job,
        department: c.department,
      })),
      poster_path: this.formatImageUrl(tmdbMovie.poster_path, 'w500'),
      backdrop_path: this.formatImageUrl(tmdbMovie.backdrop_path, 'w1280'),
      trailer_url: trailerUrl,
      original_language: tmdbMovie.original_language,
      spoken_languages: tmdbMovie.spoken_languages,
      production_countries: tmdbMovie.production_countries,
      production_companies: tmdbMovie.production_companies,
      status: tmdbMovie.status,
      budget: tmdbMovie.budget,
      revenue: tmdbMovie.revenue,
      external_ids: tmdbMovie.external_ids,
    };
  }

  /**
   * 获取图片 URL
   * @param path - 图片路径
   * @param size - 尺寸
   * @returns 完整的图片 URL
   */
  getImageUrl(path: string | null | undefined, size: string = 'w500'): string | null {
    if (!path) return null;
    return `${this.imageBaseUrl}/${size}${path}`;
  }
}

/**
 * 创建 TMDB 刮削器实例
 * @param apiKey - TMDB API Key
 * @param language - 语言（默认 zh-CN）
 * @returns TMDB 刮削器实例
 */
export function createTMDBScraper(
  apiKey: string,
  language: string = 'zh-CN'
): TMDBScraper {
  return new TMDBScraper({
    api_key: apiKey,
    language,
  });
}
