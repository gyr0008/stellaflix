/**
 * 评分聚合服务
 *
 * 整合多个来源的评分（TMDB、豆瓣）
 * 提供统一的评分查询和更新接口
 */

import { createClient } from '@/lib/supabase/server';
import { createTMDBScraper } from './scraper-tmdb';
import { createDoubanScraper } from './scraper-douban';

/** 评分来源 */
export interface RatingSource {
  source: string;       // 来源名称
  rating: number;       // 评分
  ratingCount: number;  // 评分人数
  url?: string;         // 来源链接
}

/** 聚合评分结果 */
export interface AggregatedRating {
  movieId: string;
  title: string;
  sources: RatingSource[];
  averageRating: number;    // 综合平均分
  ratingCount: number;      // 总评分人数
  highQuality: boolean;     // 是否高分（≥8.0）
}

export class RatingAggregator {
  private tmdbScraper;
  private doubanScraper;

  constructor(tmdbApiKey?: string) {
    // TMDB API Key（从环境变量获取）
    const apiKey = tmdbApiKey || process.env.TMDB_API_KEY || '';
    this.tmdbScraper = createTMDBScraper(apiKey);
    this.doubanScraper = createDoubanScraper();
  }

  /**
   * 获取电影的多来源评分
   * @param title - 电影名称
   * @param year - 年份（可选）
   * @returns 评分来源列表
   */
  async getRatingsFromSources(title: string, year?: number): Promise<RatingSource[]> {
    const sources: RatingSource[] = [];

    // 并行获取各来源评分
    const [tmdbResult, doubanResult] = await Promise.allSettled([
      this.tmdbScraper.search(title, year),
      this.doubanScraper.search(title, year),
    ]);

    // 处理 TMDB 评分
    if (tmdbResult.status === 'fulfilled' && tmdbResult.value.length > 0) {
      const tmdbMovie = tmdbResult.value[0];
      try {
        const detail = await this.tmdbScraper.getMovieDetail(tmdbMovie.id);
        sources.push({
          source: 'TMDB',
          rating: detail.rating || 0,
          ratingCount: detail.rating_count || 0,
          url: `https://www.themoviedb.org/movie/${tmdbMovie.id}`,
        });
      } catch (error) {
        console.warn('TMDB 详情获取失败:', error);
      }
    }

    // 处理豆瓣评分
    if (doubanResult.status === 'fulfilled' && doubanResult.value.length > 0) {
      const doubanMovie = doubanResult.value[0];
      try {
        const detail = await this.doubanScraper.getMovieDetail(doubanMovie.id);
        sources.push({
          source: '豆瓣',
          rating: detail.rating || 0,
          ratingCount: detail.rating_count || 0,
          url: `https://movie.douban.com/subject/${doubanMovie.id}`,
        });
      } catch (error) {
        console.warn('豆瓣详情获取失败:', error);
      }
    }

    return sources;
  }

  /**
   * 计算综合评分
   * @param sources - 评分来源列表
   * @returns 综合评分
   */
  calculateAverageRating(sources: RatingSource[]): { average: number; count: number } {
    if (sources.length === 0) {
      return { average: 0, count: 0 };
    }

    // 使用加权平均，豆瓣权重稍高（国内用户更认可）
    let totalWeight = 0;
    let weightedSum = 0;

    for (const source of sources) {
      if (source.rating <= 0) continue;

      // 权重：豆瓣 1.2，其他 1.0
      const weight = source.source === '豆瓣' ? 1.2 : 1.0;
      weightedSum += source.rating * weight * source.ratingCount;
      totalWeight += weight * source.ratingCount;
    }

    if (totalWeight === 0) {
      return { average: 0, count: 0 };
    }

    return {
      average: Math.round((weightedSum / totalWeight) * 10) / 10,
      count: Math.round(totalWeight),
    };
  }

  /**
   * 更新数据库中的电影评分
   * @param movieId - 电影ID
   * @param title - 电影名称
   * @param year - 年份
   * @returns 更新后的评分信息
   */
  async updateMovieRating(movieId: string, title: string, year?: number): Promise<AggregatedRating | null> {
    const supabase = await createClient();

    try {
      // 获取多来源评分
      const sources = await this.getRatingsFromSources(title, year);

      // 计算综合评分
      const { average, count } = this.calculateAverageRating(sources);

      // 更新数据库
      const { error } = await supabase
        .from('movies')
        .update({
          rating: average,
          rating_count: count,
          rating_sources: sources,  // 存储原始评分来源
          updated_at: new Date().toISOString(),
        })
        .eq('id', movieId);

      if (error) {
        console.error('更新电影评分失败:', error);
        return null;
      }

      return {
        movieId,
        title,
        sources,
        averageRating: average,
        ratingCount: count,
        highQuality: average >= 8.0,
      };
    } catch (error) {
      console.error('评分聚合错误:', error);
      return null;
    }
  }

  /**
   * 批量更新电影评分
   * @param movies - 电影列表 [{id, title, year}]
   * @param delayMs - 每次请求间隔（毫秒，避免被封）
   */
  async batchUpdateRatings(movies: { id: string; title: string; year?: number }[], delayMs: number = 2000): Promise<void> {
    console.log(`开始批量更新 ${movies.length} 部电影评分...`);

    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      console.log(`[${i + 1}/${movies.length}] 正在更新: ${movie.title}`);

      const result = await this.updateMovieRating(movie.id, movie.title, movie.year);

      if (result) {
        console.log(`  ✅ 评分: ${result.averageRating} (${result.ratingCount}人评)`);
      } else {
        console.log(`  ❌ 更新失败`);
      }

      // 延迟，避免请求过于频繁
      if (i < movies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log('批量更新完成！');
  }

  /**
   * 获取所有需要更新评分的电影
   * @param limit - 数量限制
   * @returns 电影列表
   */
  async getMoviesNeedingRatingUpdate(limit: number = 50): Promise<{ id: string; title: string; year?: number }[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('movies')
      .select('id, title, year')
      .eq('is_published', true)
      .or('rating.is.null,rating_count.is.null,rating_count.eq.0')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('获取电影列表失败:', error);
      return [];
    }

    return data || [];
  }
}

/**
 * 创建评分聚合服务实例
 */
export function createRatingAggregator(tmdbApiKey?: string): RatingAggregator {
  return new RatingAggregator(tmdbApiKey);
}
