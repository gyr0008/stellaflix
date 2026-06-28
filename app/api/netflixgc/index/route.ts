/**
 * NetflixGC 索引 API
 *
 * GET /api/netflixgc/index - 获取索引状态
 * POST /api/netflixgc/index - 重建索引
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStats, buildIndex, searchIndex } from '@/lib/scrapers/netflixgc-index';

/**
 * GET /api/netflixgc/index
 */
export async function GET() {
  try {
    const stats = await getStats();

    return NextResponse.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取索引状态失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/netflixgc/index
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'rebuild') {
      await buildIndex();
      const stats = await getStats();

      return NextResponse.json({
        success: true,
        message: '索引重建完成',
        ...stats,
      });
    }

    if (action === 'search') {
      const { keyword } = await request.json();

      if (!keyword) {
        return NextResponse.json(
          { success: false, error: '请提供搜索关键词' },
          { status: 400 }
        );
      }

      const results = await searchIndex(keyword);

      return NextResponse.json({
        success: true,
        keyword,
        total: results.length,
        results,
      });
    }

    return NextResponse.json(
      { success: false, error: '未知操作' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '操作失败',
      },
      { status: 500 }
    );
  }
}
