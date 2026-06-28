/**
 * 电影简介更新 API
 *
 * POST /api/movies/update-description
 *
 * 功能：
 * 1. 从猫眼/豆瓣爬取高质量简介
 * 2. 更新数据库中的电影简介
 *
 * 数据源优先级：
 * 1. 猫眼（热映电影）
 * 2. 豆瓣（详情更丰富）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cache, CacheKeys } from '@/lib/cache';
import { getHotMovies } from '@/lib/maoyan';

/** 电影详情 */
interface MovieDetail {
  success: boolean;
  title: string;
  summary: string;
  description: string;
  rating: number;
  ratingCount: number;
  genres: string[];
  directors: string[];
  actors: string[];
  poster: string;
}

/**
 * 获取电影简介（猫眼 → 豆瓣）
 */
async function fetchMovieDescription(title: string, year?: number): Promise<MovieDetail | null> {
  const searchKey = year ? `${title} ${year}` : title;

  // 检查缓存
  const cacheKey = CacheKeys.movieDetail(`desc:${searchKey}`);
  const cached = cache.get<MovieDetail>(cacheKey);
  if (cached) {
    console.log('[简介缓存] 命中:', searchKey);
    return cached;
  }

  // 1. 先尝试猫眼
  try {
    const hotMovies = await getHotMovies();
    const matched = hotMovies.find(
      (m) => m.title === title || m.title.includes(title) || title.includes(m.title)
    );

    if (matched) {
      const result: MovieDetail = {
        success: true,
        title: matched.title,
        summary: '',
        description: '',
        rating: matched.rating,
        ratingCount: matched.ratingCount,
        genres: matched.genres,
        directors: matched.directors,
        actors: matched.actors,
        poster: matched.posterUrl,
      };
      cache.set(cacheKey, result, 30 * 60 * 1000);
      return result;
    }
  } catch (error) {
    console.error('[猫眼] 获取失败:', error);
  }

  // 2. 尝试豆瓣
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/scraper/douban?wd=${encodeURIComponent(searchKey)}`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        const result: MovieDetail = {
          success: true,
          title: data.title || title,
          summary: data.summary || '',
          description: data.description || '',
          rating: data.rating || 0,
          ratingCount: data.ratingCount || 0,
          genres: data.genres || [],
          directors: data.directors || [],
          actors: data.actors || [],
          poster: data.poster || '',
        };
        cache.set(cacheKey, result, 30 * 60 * 1000);
        return result;
      }
    }
  } catch (error) {
    console.error('[豆瓣] 获取失败:', error);
  }

  return null;
}

/**
 * POST /api/movies/update-description
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movieId, title, year, forceUpdate, doubanId } = body;

    if (!title && !doubanId) {
      return NextResponse.json(
        { error: '请提供电影标题或豆瓣 ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 查询现有电影
    let query = supabase.from('movies').select('id, title, year, description');
    if (movieId) {
      query = query.eq('id', movieId);
    } else if (title) {
      query = query.eq('title', title);
    }

    const { data: movies, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json(
        { error: '查询电影失败', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!movies || movies.length === 0) {
      return NextResponse.json(
        { error: '未找到电影' },
        { status: 404 }
      );
    }

    const movie = movies[0];

    // 检查是否需要更新
    if (movie.description && !forceUpdate && !doubanId) {
      // 如果简介已经存在且不包含 HTML 标签，跳过
      if (!movie.description.includes('<') && movie.description.length > 50) {
        return NextResponse.json({
          success: true,
          message: '简介已存在，跳过更新',
          movie,
          updated: false,
        });
      }
    }

    // 获取电影简介
    let movieDetail: MovieDetail | null = null;

    // 如果提供了豆瓣 ID，直接使用
    if (doubanId) {
      try {
        const doubanUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/scraper/douban?id=${doubanId}`;
        const response = await fetch(doubanUrl, {
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            movieDetail = {
              success: true,
              title: data.title || title,
              summary: data.summary || '',
              description: data.description || '',
              rating: data.rating || 0,
              ratingCount: data.ratingCount || 0,
              genres: data.genres || [],
              directors: data.directors || [],
              actors: data.actors || [],
              poster: data.poster || '',
            };
          }
        }
      } catch (error) {
        console.error('[豆瓣ID] 获取失败:', error);
      }
    } else {
      // 通过标题搜索（猫眼 → 豆瓣）
      movieDetail = await fetchMovieDescription(title, year || movie.year);
    }

    // 如果没有获取到简介，返回友好的错误提示
    if (!movieDetail || !movieDetail.success) {
      return NextResponse.json(
        {
          success: false,
          error: '未找到该电影的简介信息',
          hint: '该电影可能较为冷门，建议：1. 稍后重试 2. 手动输入豆瓣链接',
          canManualInput: true,
        },
        { status: 200 } // 返回 200 而非 500，避免前端报错
      );
    }

    // 选择最佳简介
    const newDescription = movieDetail.summary ||
                           movieDetail.description ||
                           '';

    if (!newDescription) {
      return NextResponse.json(
        {
          success: false,
          error: '该电影暂无简介',
          hint: '数据源未提供简介，建议手动输入豆瓣链接',
          canManualInput: true,
          movieInfo: {
            title: movieDetail.title,
            rating: movieDetail.rating,
            genres: movieDetail.genres,
          },
        },
        { status: 200 }
      );
    }

    // 更新数据库
    const { error: updateError } = await supabase
      .from('movies')
      .update({
        description: newDescription,
        updated_at: new Date().toISOString(),
      })
      .eq('id', movie.id);

    if (updateError) {
      return NextResponse.json(
        { error: '更新数据库失败', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '简介更新成功',
      movie: {
        ...movie,
        description: newDescription,
      },
      source: movieDetail.rating > 0 ? 'maoyan/douban' : 'unknown',
      originalLength: movie.description?.length || 0,
      newLength: newDescription.length,
      updated: true,
    });
  } catch (error) {
    console.error('更新简介失败:', error);
    return NextResponse.json(
      {
        error: '更新失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
