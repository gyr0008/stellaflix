/**
 * 多源聚合搜索 API
 *
 * GET /api/search-multi?wd=关键词
 *
 * 并行搜索所有 CMS 源，合并同名电影的播放源
 * 返回带有多个播放源的电影列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnabledSources, getSearchUrl, type CmsSource } from '@/lib/cms-sources';
import { mergeSearchResults, sortMoviesByQuality, type AggregatedMovie } from '@/lib/video-utils';

/** 单个源的搜索结果 */
interface SourceSearchResult {
  source: string;
  success: boolean;
  results: any[];
  responseTime: number;
  error?: string;
}

/** 搜索响应 */
interface SearchResponse {
  success: boolean;
  keyword: string;
  stats: {
    totalMovies: number;
    totalSources: number;
    sourcesUsed: number;
    avgSourcesPerMovie: number;
  };
  results: AggregatedMovie[];
  sourceStats: SourceSearchResult[];
}

/**
 * 搜索单个 CMS 源
 *
 * @param source 源配置
 * @param keyword 搜索关键词
 * @returns 搜索结果
 */
async function searchSource(source: CmsSource, keyword: string): Promise<SourceSearchResult> {
  const startTime = Date.now();
  const result: SourceSearchResult = {
    source: source.name,
    success: false,
    results: [],
    responseTime: 0,
  };

  try {
    const url = getSearchUrl(source, keyword);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000), // 8秒超时
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 1 || !data.list) {
      throw new Error('Invalid response');
    }

    result.success = true;
    result.results = data.list.map((item: any) => ({
      ...item,
      sourceName: source.name, // 添加源名称
    }));
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  result.responseTime = Date.now() - startTime;
  return result;
}

/**
 * 并行搜索所有源
 *
 * @param keyword 搜索关键词
 * @returns 所有源的搜索结果
 */
async function searchAllSources(keyword: string): Promise<SourceSearchResult[]> {
  const sources = getEnabledSources();

  // 并行搜索所有源
  const promises = sources.map(source => searchSource(source, keyword));

  // 等待所有结果（不使用 Promise.allSettled，因为我们需要处理超时）
  const results = await Promise.all(promises);

  return results;
}

/**
 * 获取第一个成功的搜索结果（竞速策略）
 *
 * @param keyword 搜索关键词
 * @returns 第一个成功的结果
 */
async function searchWithRace(keyword: string): Promise<SourceSearchResult | null> {
  const sources = getEnabledSources();

  // 创建所有搜索任务
  const promises = sources.map(source => searchSource(source, keyword));

  // 使用 Promise.race 获取第一个成功的结果
  const firstResult = await Promise.race(
    promises.map(async (promise) => {
      const result = await promise;
      if (result.success && result.results.length > 0) {
        return result;
      }
      throw new Error('No results');
    })
  );

  return firstResult;
}

/**
 * GET /api/search-multi?wd=关键词
 *
 * 主处理函数
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('wd');
  const mode = searchParams.get('mode') || 'full'; // 'fast' = 竞速模式, 'full' = 完整模式

  // 参数验证
  if (!keyword?.trim()) {
    return NextResponse.json(
      { error: '请提供搜索关键词 (wd 参数)' },
      { status: 400 }
    );
  }

  const startTime = Date.now();

  try {
    // 竞速模式：只获取第一个成功的结果
    if (mode === 'fast') {
      const firstResult = await searchWithRace(keyword);

      if (!firstResult) {
        return NextResponse.json({
          success: false,
          keyword,
          error: '所有视频源都搜索失败',
        });
      }

      const movies = mergeSearchResults(firstResult.results);

      return NextResponse.json({
        success: true,
        keyword,
        stats: {
          totalMovies: movies.length,
          totalSources: 1,
          sourcesUsed: 1,
          avgSourcesPerMovie: 1,
        },
        results: sortMoviesByQuality(movies),
        sourceStats: [firstResult],
      });
    }

    // 完整模式：搜索所有源并聚合
    const allResults = await searchAllSources(keyword);

    // 收集所有成功的搜索结果
    const successfulResults = allResults.filter(r => r.success && r.results.length > 0);

    if (successfulResults.length === 0) {
      return NextResponse.json({
        success: false,
        keyword,
        error: '所有视频源都搜索失败',
        sourceStats: allResults,
      });
    }

    // 合并所有结果
    const allItems = successfulResults.flatMap(r => r.results);
    const movies = mergeSearchResults(allItems);

    // 统计信息
    const totalMovies = movies.length;
    const totalSources = successfulResults.length;
    const avgSourcesPerMovie = totalMovies > 0
      ? movies.reduce((sum, m) => sum + m.sources.length, 0) / totalMovies
      : 0;

    const response: SearchResponse = {
      success: true,
      keyword,
      stats: {
        totalMovies,
        totalSources,
        sourcesUsed: totalSources,
        avgSourcesPerMovie: Math.round(avgSourcesPerMovie * 10) / 10,
      },
      results: sortMoviesByQuality(movies),
      sourceStats: allResults,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('搜索失败:', error);

    return NextResponse.json(
      {
        success: false,
        keyword,
        error: error instanceof Error ? error.message : '搜索失败',
      },
      { status: 500 }
    );
  }
}
