/**
 * 刮削搜索 API
 *
 * GET /api/scraper/search?query=电影名&year=2024
 *
 * 在 TMDB 中搜索电影，返回匹配结果
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTMDBScraper } from '@/lib/scraper';

// TMDB API Key（从环境变量读取）
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 解析参数
    const query = searchParams.get('query') || '';
    const year = searchParams.get('year');

    // 验证参数
    if (!query.trim()) {
      return NextResponse.json(
        { success: false, error: '搜索关键词不能为空' },
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

    // 执行搜索
    const results = await scraper.search(
      query,
      year ? parseInt(year) : undefined
    );

    return NextResponse.json({
      success: true,
      data: results,
      total: results.length,
      query,
    });
  } catch (error) {
    console.error('Scraper search error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '搜索失败',
      },
      { status: 500 }
    );
  }
}
