/**
 * 刮削详情 API
 *
 * GET /api/scraper/detail?id=12345
 *
 * 根据 TMDB ID 获取电影详细元数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTMDBScraper } from '@/lib/scraper';

// TMDB API Key（从环境变量读取）
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 解析参数
    const idStr = searchParams.get('id');

    // 验证参数
    if (!idStr) {
      return NextResponse.json(
        { success: false, error: '缺少 id 参数' },
        { status: 400 }
      );
    }

    const id = parseInt(idStr);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'id 必须是数字' },
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

    // 获取详情
    const metadata = await scraper.getMovieDetail(id);

    return NextResponse.json({
      success: true,
      data: metadata,
      source: 'TMDB',
    });
  } catch (error) {
    console.error('Scraper detail error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取详情失败',
      },
      { status: 500 }
    );
  }
}
