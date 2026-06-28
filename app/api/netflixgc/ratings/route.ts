/**
 * NetflixGC 批量豆瓣评分 API
 *
 * POST /api/netflixgc/ratings
 * Body: { movies: [{ id: number, title: string }] }
 *
 * 返回每个电影的豆瓣评分
 */

import { NextRequest, NextResponse } from 'next/server';
import { DoubanScraper } from '@/lib/scraper/scraper-douban';

/** 请求体类型 */
interface RatingsRequest {
  movies: Array<{
    id: number;
    title: string;
    year?: number;
  }>;
}

/** 单个电影评分响应 */
interface MovieRating {
  id: number;
  title: string;
  rating: number;
  ratingCount: number;
  error?: string;
}

/** 批量响应 */
interface RatingsResponse {
  success: boolean;
  ratings: MovieRating[];
  error?: string;
}

// 评分缓存（内存缓存，避免重复请求）
const ratingCache = new Map<string, { rating: number; count: number; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

/**
 * 获取缓存的评分
 */
function getCachedRating(key: string): { rating: number; count: number } | null {
  const cached = ratingCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { rating: cached.rating, count: cached.count };
  }
  return null;
}

/**
 * 设置评分缓存
 */
function setRatingCache(key: string, rating: number, count: number): void {
  ratingCache.set(key, { rating, count, timestamp: Date.now() });

  // 限制缓存大小
  if (ratingCache.size > 10000) {
    const oldestKey = Array.from(ratingCache.keys())[0];
    ratingCache.delete(oldestKey);
  }
}

/**
 * POST /api/netflixgc/ratings
 *
 * 批量获取电影豆瓣评分
 */
export async function POST(request: NextRequest): Promise<NextResponse<RatingsResponse>> {
  try {
    const body: RatingsRequest = await request.json();

    if (!body.movies || !Array.isArray(body.movies)) {
      return NextResponse.json(
        { success: false, ratings: [], error: '无效的请求参数' },
        { status: 400 }
      );
    }

    // 限制批量大小
    const movies = body.movies.slice(0, 20);

    const scraper = new DoubanScraper();
    const ratings: MovieRating[] = [];

    // 并发获取评分（带缓存检查）
    const results = await Promise.allSettled(
      movies.map(async (movie) => {
        const cacheKey = `douban:${movie.title}:${movie.year || ''}`;

        // 检查缓存
        const cached = getCachedRating(cacheKey);
        if (cached) {
          return {
            id: movie.id,
            title: movie.title,
            rating: cached.rating,
            ratingCount: cached.count,
          };
        }

        // 搜索并获取评分
        try {
          const searchResults = await scraper.search(movie.title, movie.year);

          if (searchResults.length === 0) {
            return {
              id: movie.id,
              title: movie.title,
              rating: 0,
              ratingCount: 0,
              error: '未找到匹配的电影',
            };
          }

          const detail = await scraper.getMovieDetail(searchResults[0].id);
          const rating = detail.rating || 0;
          const ratingCount = detail.rating_count || 0;

          // 设置缓存
          setRatingCache(cacheKey, rating, ratingCount);

          return {
            id: movie.id,
            title: movie.title,
            rating,
            ratingCount,
          };
        } catch (error) {
          return {
            id: movie.id,
            title: movie.title,
            rating: 0,
            ratingCount: 0,
            error: error instanceof Error ? error.message : '获取评分失败',
          };
        }
      })
    );

    // 收集结果
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        ratings.push(result.value);
      }
    });

    return NextResponse.json({
      success: true,
      ratings,
    });
  } catch (error) {
    console.error('批量获取评分失败:', error);

    return NextResponse.json(
      {
        success: false,
        ratings: [],
        error: error instanceof Error ? error.message : '服务器错误',
      },
      { status: 500 }
    );
  }
}
