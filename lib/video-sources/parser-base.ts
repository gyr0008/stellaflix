/**
 * 解析器基类
 *
 * 提供通用的 HTTP 请求、错误处理、日志记录等功能
 */

import type { VideoSourceConfig, VideoSourceParser, SourceLog, LogAction } from './types';

export abstract class BaseParser implements VideoSourceParser {
  protected config: VideoSourceConfig;
  protected requestTimeout = 10000; // 10秒超时

  constructor(config: VideoSourceConfig) {
    this.config = config;
  }

  /** 获取视频源配置 */
  getConfig(): VideoSourceConfig {
    return this.config;
  }

  /** 抽象方法：子类必须实现 */
  abstract search(params: { query: string; page?: number }): Promise<any[]>;
  abstract getDetail(url: string): Promise<any>;
  abstract getPlayUrl(url: string): Promise<any[]>;
  abstract testConnection(): Promise<boolean>;

  /**
   * 发送 HTTP 请求
   * @param url - 请求地址
   * @param options - 请求选项
   * @returns 响应数据
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 获取 JSON 数据
   * @param url - 请求地址
   * @returns 解析后的 JSON 数据
   */
  protected async fetchJson<T = any>(url: string): Promise<T> {
    const response = await this.fetchWithTimeout(url);
    return response.json();
  }

  /**
   * 获取文本数据
   * @param url - 请求地址
   * @returns 文本内容
   */
  protected async fetchText(url: string): Promise<string> {
    const response = await this.fetchWithTimeout(url);
    return response.text();
  }

  /**
   * 构建完整 URL
   * @param path - 路径
   * @returns 完整 URL
   */
  protected buildUrl(path: string): string {
    const base = this.config.base_url.replace(/\/$/, '');
    const relative = path.startsWith('/') ? path : `/${path}`;
    return `${base}${relative}`;
  }

  /**
   * 构建搜索 URL
   * @param query - 搜索关键词
   * @param page - 页码
   * @returns 搜索 URL
   */
  protected buildSearchUrl(query: string, page: number = 1): string {
    if (this.config.search_path) {
      // 使用配置的搜索路径模板
      const path = this.config.search_path
        .replace('{query}', encodeURIComponent(query))
        .replace('{page}', page.toString());
      return this.buildUrl(path);
    }
    // 默认搜索路径
    return this.buildUrl(`/search?query=${encodeURIComponent(query)}&page=${page}`);
  }

  /**
   * 构建详情 URL
   * @param path - 详情路径
   * @returns 详情 URL
   */
  protected buildDetailUrl(path: string): string {
    if (this.config.detail_path && !path.startsWith('http')) {
      const fullPath = this.config.detail_path.replace('{id}', path);
      return this.buildUrl(fullPath);
    }
    if (path.startsWith('http')) {
      return path;
    }
    return this.buildUrl(path);
  }

  /**
   * 记录日志
   * @param action - 操作类型
   * @param requestUrl - 请求 URL
   * @param responseCode - 响应码
   * @param responseTime - 响应时间（毫秒）
   * @param error - 错误信息
   */
  protected async log(
    action: LogAction,
    requestUrl?: string,
    responseCode?: number,
    responseTime?: number,
    error?: string
  ): Promise<void> {
    try {
      // 这里可以调用 API 记录日志，暂时只输出到控制台
      const logData: SourceLog = {
        id: crypto.randomUUID(),
        source_id: this.config.id,
        action,
        request_url: requestUrl,
        response_code: responseCode,
        response_time_ms: responseTime,
        error_message: error,
        created_at: new Date().toISOString(),
      };

      console.log(`[VideoSource:${this.config.code}]`, logData);

      // TODO: 调用日志 API
      // await fetch('/api/video-sources/logs', {
      //   method: 'POST',
      //   body: JSON.stringify(logData),
      // });
    } catch (e) {
      // 日志记录失败不影响主流程
      console.error('Failed to log:', e);
    }
  }

  /**
   * 处理错误
   * @param action - 操作类型
   * @param error - 错误对象
   * @param requestUrl - 请求 URL
   */
  protected async handleError(
    action: LogAction,
    error: any,
    requestUrl?: string
  ): Promise<never> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await this.log(action, requestUrl, undefined, undefined, errorMessage);
    throw error;
  }
}
