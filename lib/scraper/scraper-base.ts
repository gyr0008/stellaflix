/**
 * 刮削器基类
 *
 * 提供通用的 HTTP 请求、缓存、错误处理等功能
 */

import type {
  MovieMetadata,
  ScrapeResult,
  ScrapeSearchResult,
  ScraperConfig,
} from './types';

export abstract class ScraperBase {
  protected config: ScraperConfig;
  protected cache = new Map<string, { data: any; expiry: number }>();
  protected cacheDuration = 60 * 60 * 1000; // 1小时缓存

  constructor(config: ScraperConfig = {}) {
    this.config = {
      language: 'zh-CN',
      region: 'CN',
      include_adult: false,
      timeout: 10000,
      ...config,
    };
  }

  /**
   * 搜索电影（子类必须实现）
   * @param query - 搜索关键词
   * @param year - 年份（可选）
   * @returns 搜索结果列表
   */
  abstract search(query: string, year?: number): Promise<ScrapeSearchResult[]>;

  /**
   * 获取电影详情（子类必须实现）
   * @param id - 电影ID
   * @returns 电影元数据
   */
  abstract getMovieDetail(id: number): Promise<MovieMetadata>;

  /**
   * 获取刮削器名称
   */
  abstract getName(): string;

  /**
   * 获取刮削器配置
   */
  getConfig(): ScraperConfig {
    return this.config;
  }

  /**
   * 发送 HTTP 请求
   * @param url - 请求地址
   * @param options - 请求选项
   * @returns 响应数据
   */
  protected async fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeout || 10000
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 获取缓存数据
   * @param key - 缓存键
   * @returns 缓存的数据，如果没有或已过期则返回 null
   */
  protected getCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  /**
   * 设置缓存
   * @param key - 缓存键
   * @param data - 要缓存的数据
   * @param duration - 缓存时长（毫秒，可选）
   */
  protected setCache<T>(key: string, data: T, duration?: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + (duration || this.cacheDuration),
    });
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 格式化图片 URL
   * @param path - 图片路径
   * @param size - 图片尺寸
   * @returns 完整的图片 URL
   */
  protected formatImageUrl(path: string | null | undefined, size: string = 'w500'): string | undefined {
    if (!path) return undefined;
    // 子类需要实现 getBaseUrl
    return `${this.getBaseUrl()}${size}${path}`;
  }

  /**
   * 获取基础 URL（子类实现）
   */
  protected abstract getBaseUrl(): string;

  /**
   * 解析年份
   * @param dateStr - 日期字符串
   * @returns 年份
   */
  protected parseYear(dateStr?: string): number | undefined {
    if (!dateStr) return undefined;
    const year = parseInt(dateStr.substring(0, 4));
    return isNaN(year) ? undefined : year;
  }

  /**
   * 清理 HTML 标签
   * @param html - HTML 字符串
   * @returns 纯文本
   */
  protected cleanHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * 标准化搜索结果
   * @param results - 搜索结果
   * @param source - 数据来源
   * @returns 标准化的搜索结果
   */
  protected normalizeSearchResults(
    results: any[],
    source: string
  ): ScrapeSearchResult[] {
    return results.map((item) => ({
      id: item.id,
      title: item.title || item.name || '未知标题',
      original_title: item.original_title || item.original_name,
      year: this.parseYear(item.release_date || item.first_air_date),
      overview: item.overview || '',
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      release_date: item.release_date || item.first_air_date,
      popularity: item.popularity || 0,
    }));
  }

  /**
   * 创建成功结果
   * @param data - 电影元数据
   * @param cached - 是否来自缓存
   * @returns 刮削结果
   */
  protected createSuccessResult(data: MovieMetadata, cached = false): ScrapeResult {
    return {
      success: true,
      data,
      source: this.getName(),
      cached,
    };
  }

  /**
   * 创建失败结果
   * @param error - 错误信息
   * @returns 刮削结果
   */
  protected createErrorResult(error: string): ScrapeResult {
    return {
      success: false,
      source: this.getName(),
      error,
    };
  }
}
