/**
 * 自动刮削 API
 *
 * POST /api/scraper/scrape
 *
 * 根据电影标题自动搜索并获取元数据，可选保存到数据库
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createTMDBScraper } from '@/lib/scraper';
import type { MovieMetadata } from '@/lib/scraper';

// TMDB API Key（从环境变量读取）
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

interface ScrapeRequestBody {
  movie_id?: string;               // 本地电影ID（可选，用于更新）
  title: string;                   // 电影标题
  year?: number;                   // 年份（可选）
  tmdb_id?: number;                // TMDB ID（可选，直接指定）
  auto_save?: boolean;             // 是否自动保存到数据库
}

export async function POST(request: NextRequest) {
  try {
    const body: ScrapeRequestBody = await request.json();
    const { movie_id, title, year, tmdb_id, auto_save = false } = body;

    // 验证参数
    if (!title.trim()) {
      return NextResponse.json(
        { success: false, error: '电影标题不能为空' },
        { status: 400 }
      );
    }

    // 检查 API Key
    if (!TMDB_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'TMDB API Key 未配置，请在环境变量 TMDB_API_KEY 中设置',
        },
        { status: 500 }
      );
    }

    // 创建刮削器实例
    const scraper = createTMDBScraper(TMDB_API_KEY, 'zh-CN');

    let metadata: MovieMetadata;

    if (tmdb_id) {
      // 直接使用 TMDB ID 获取详情
      metadata = await scraper.getMovieDetail(tmdb_id);
    } else {
      // 搜索并获取最匹配的电影详情
      const result = await scraper.searchAndScrape(title, year);
      if (!result.success || !result.data) {
        return NextResponse.json(
          {
            success: false,
            error: result.error || '未找到匹配的电影',
          },
          { status: 404 }
        );
      }
      metadata = result.data;
    }

    // 如果指定了 movie_id 且 auto_save 为 true，保存到数据库
    if (movie_id && auto_save) {
      const supabase = await createClient();

      // 检查用户权限
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { success: false, error: '请先登录' },
          { status: 401 }
        );
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json(
          { success: false, error: '无管理权限' },
          { status: 403 }
        );
      }

      // 更新电影元数据
      const updateData: Record<string, any> = {};

      if (metadata.title) updateData.title = metadata.title;
      if (metadata.description) updateData.description = metadata.description;
      if (metadata.poster_path) updateData.poster_url = metadata.poster_path;
      if (metadata.backdrop_path)
        updateData.backdrop_url = metadata.backdrop_path;
      if (metadata.year) updateData.year = metadata.year;
      if (metadata.rating) updateData.rating = metadata.rating;
      if (metadata.runtime) updateData.duration = metadata.runtime;
      if (metadata.director && metadata.director.length > 0) {
        updateData.director = metadata.director.map((d) => d.name).join(', ');
      }
      if (metadata.cast && metadata.cast.length > 0) {
        updateData.cast_members = metadata.cast.map((c) => c.name);
      }
      if (metadata.genres && metadata.genres.length > 0) {
        updateData.genre = metadata.genres.map((g) => g.name);
      }
      if (metadata.trailer_url) updateData.trailer_url = metadata.trailer_url;

      // 存储额外元数据
      updateData.extra_data = {
        tmdb_id: tmdb_id,
        original_title: metadata.original_title,
        tagline: metadata.tagline,
        overview: metadata.overview,
        original_language: metadata.original_language,
        production_countries: metadata.production_countries,
        production_companies: metadata.production_companies,
        spoken_languages: metadata.spoken_languages,
        budget: metadata.budget,
        revenue: metadata.revenue,
        status: metadata.status,
        external_ids: metadata.external_ids,
      };

      const { error } = await supabase
        .from('movies')
        .update(updateData)
        .eq('id', movie_id);

      if (error) {
        console.error('Database update error:', error);
        return NextResponse.json(
          { success: false, error: '保存到数据库失败' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: metadata,
      source: 'TMDB',
      saved: auto_save && !!movie_id,
    });
  } catch (error) {
    console.error('Scraper error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '刮削失败',
      },
      { status: 500 }
    );
  }
}
