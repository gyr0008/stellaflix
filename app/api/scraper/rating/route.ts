/**
 * 评分更新 API
 *
 * 用于手动触发电影评分更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRatingAggregator } from '@/lib/scraper/rating-aggregator';

/**
 * POST /api/scraper/rating
 *
 * 更新电影评分
 *
 * 请求体：
 * - movieId?: string  - 指定电影ID（可选，不传则批量更新）
 * - title?: string    - 电影名称（与 movieId 配合使用）
 * - year?: number     - 年份（可选）
 * - batch?: boolean   - 是否批量更新
 * - limit?: number    - 批量更新数量限制
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movieId, title, year, batch, limit = 10 } = body;

    const aggregator = createRatingAggregator();

    // 单部电影评分更新
    if (movieId && title) {
      const result = await aggregator.updateMovieRating(movieId, title, year);

      if (!result) {
        return NextResponse.json(
          { error: '评分更新失败' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // 批量更新
    if (batch) {
      const supabase = await createClient();

      // 获取需要更新评分的电影
      const { data: movies, error } = await supabase
        .from('movies')
        .select('id, title, year')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !movies) {
        return NextResponse.json(
          { error: '获取电影列表失败' },
          { status: 500 }
        );
      }

      // 异步执行批量更新（不阻塞请求）
      aggregator.batchUpdateRatings(movies, 2000).catch(console.error);

      return NextResponse.json({
        success: true,
        message: `开始批量更新 ${movies.length} 部电影评分`,
        total: movies.length,
      });
    }

    return NextResponse.json(
      { error: '请提供 movieId 和 title，或设置 batch 为 true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('评分更新 API 错误:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scraper/rating
 *
 * 获取电影评分状态
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = request.nextUrl;

    const movieId = searchParams.get('movieId');

    // 获取单部电影评分
    if (movieId) {
      const { data, error } = await supabase
        .from('movies')
        .select('id, title, rating, rating_count, rating_sources')
        .eq('id', movieId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: '电影不存在' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          id: data.id,
          title: data.title,
          rating: data.rating,
          ratingCount: data.rating_count,
          sources: data.rating_sources || [],
        },
      });
    }

    // 获取评分统计
    const { data: stats, error: statsError } = await supabase
      .from('movies')
      .select('rating')
      .eq('is_published', true);

    if (statsError) {
      return NextResponse.json(
        { error: '获取统计失败' },
        { status: 500 }
      );
    }

    const totalMovies = stats?.length || 0;
    const ratedMovies = stats?.filter(m => m.rating && m.rating > 0).length || 0;
    const highQualityMovies = stats?.filter(m => m.rating && m.rating >= 8.0).length || 0;

    return NextResponse.json({
      success: true,
      data: {
        totalMovies,
        ratedMovies,
        highQualityMovies,
        unratedMovies: totalMovies - ratedMovies,
      },
    });
  } catch (error) {
    console.error('获取评分状态错误:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
