/**
 * 多源聚合搜索器
 *
 * 同时搜索多个视频源，合并并排序结果
 */

import { createClient } from '@/lib/supabase/server';
import { createParser } from './parser-factory';
import type {
  VideoSourceConfig,
  SearchResult,
  SearchParams,
  SearchResponse,
  SourceError,
} from './types';

/**
 * 聚合搜索器类
 */
export class Aggregator {
  private configs: VideoSourceConfig[] = [];

  /**
   * 加载启用的视频源配置
   */
  async loadConfigs(): Promise<void> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('video_source_configs')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('Failed to load video source configs:', error);
      throw error;
    }

    this.configs = data || [];
  }

  /**
   * 聚合搜索
   * @param params - 搜索参数
   * @returns 搜索响应
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    // 加载配置
    if (this.configs.length === 0) {
      await this.loadConfigs();
    }

    // 确定要搜索的视频源
    let configsToSearch = this.configs;
    if (params.sources && params.sources.length > 0) {
      configsToSearch = this.configs.filter(c =>
        params.sources!.includes(c.code)
      );
    }

    if (configsToSearch.length === 0) {
      return {
        success: true,
        data: [],
        total: 0,
        page: params.page || 1,
        limit: params.limit || 20,
        sources_used: [],
        errors: [],
      };
    }

    // 并发搜索所有源
    const searchResults: { source: string; results: SearchResult[] }[] = [];
    const searchErrors: SourceError[] = [];

    await Promise.all(
      configsToSearch.map(async (config) => {
        try {
          const result = await this.searchSingleSource(config, params);
          searchResults.push(result);
        } catch (error) {
          searchErrors.push({
            source: config.code,
            source_name: config.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    // 合并结果
    const allResults: SearchResult[] = [];
    for (const result of searchResults) {
      allResults.push(...result.results);
    }
    const sourcesUsed = searchResults.map(r => r.source);
    const errors = searchErrors;

    // 去重（基于标题）
    const uniqueResults = this.deduplicateResults(allResults);

    // 排序（按优先级和评分）
    const sortedResults = this.sortResults(uniqueResults, configsToSearch);

    // 分页
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;
    const paginatedResults = sortedResults.slice(offset, offset + limit);

    return {
      success: true,
      data: paginatedResults,
      total: uniqueResults.length,
      page,
      limit,
      sources_used: sourcesUsed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 搜索单个视频源
   * @param config - 视频源配置
   * @param params - 搜索参数
   * @returns 搜索结果
   */
  private async searchSingleSource(
    config: VideoSourceConfig,
    params: SearchParams
  ): Promise<{ source: string; results: SearchResult[] }> {
    try {
      const parser = createParser(config);
      const results = await parser.search(params);

      return {
        source: config.code,
        results: results.map(r => ({
          ...r,
          source: config.code,
          source_name: config.name,
        })),
      };
    } catch (error) {
      console.error(`Search failed for source ${config.code}:`, error);
      throw error;
    }
  }

  /**
   * 去重结果
   * @param results - 搜索结果
   * @returns 去重后的结果
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Map<string, SearchResult>();

    for (const result of results) {
      const key = this.normalizeTitle(result.title);

      if (!seen.has(key)) {
        seen.set(key, result);
      } else {
        // 保留优先级更高的源
        const existing = seen.get(key)!;
        if (this.getSourcePriority(result.source) > this.getSourcePriority(existing.source)) {
          seen.set(key, result);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * 标准化标题（用于去重）
   * @param title - 标题
   * @returns 标准化后的标题
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[【】\[\]《》「」『』]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * 排序结果
   * @param results - 搜索结果
   * @param configs - 视频源配置
   * @returns 排序后的结果
   */
  private sortResults(
    results: SearchResult[],
    configs: VideoSourceConfig[]
  ): SearchResult[] {
    return results.sort((a, b) => {
      // 首先按优先级排序
      const priorityA = this.getSourcePriority(a.source, configs);
      const priorityB = this.getSourcePriority(b.source, configs);

      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      // 然后按年份排序（新的优先）
      const yearA = a.year || 0;
      const yearB = b.year || 0;
      return yearB - yearA;
    });
  }

  /**
   * 获取视频源优先级
   * @param sourceCode - 视频源代码
   * @param configs - 视频源配置（可选）
   * @returns 优先级
   */
  private getSourcePriority(
    sourceCode: string,
    configs?: VideoSourceConfig[]
  ): number {
    const sourceConfigs = configs || this.configs;
    const config = sourceConfigs.find(c => c.code === sourceCode);
    return config?.priority || 0;
  }

  /**
   * 获取所有启用的视频源
   * @returns 视频源列表
   */
  async getEnabledSources(): Promise<VideoSourceConfig[]> {
    if (this.configs.length === 0) {
      await this.loadConfigs();
    }
    return this.configs;
  }

  /**
   * 根据代码获取视频源配置
   * @param code - 视频源代码
   * @returns 视频源配置
   */
  getSourceByCode(code: string): VideoSourceConfig | undefined {
    return this.configs.find(c => c.code === code);
  }
}

// 导出单例
export const aggregator = new Aggregator();
