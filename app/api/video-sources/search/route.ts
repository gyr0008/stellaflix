/**
 * 多源搜索 API
 *
 * GET /api/video-sources/search?query=关键词&sources=source1,source2&page=1&limit=20
 */

import { NextRequest, NextResponse } from 'next/server';
import { aggregator } from '@/lib/video-sources';
import type { SearchParams } from '@/lib/video-sources';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 解析参数
    const params: SearchParams = {
      query: searchParams.get('query') || '',
      sources: searchParams.get('sources')?.split(',').filter(Boolean),
      categories: searchParams.get('categories')?.split(',').filter(Boolean),
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    };

    // 验证参数
    if (!params.query.trim()) {
      return NextResponse.json(
        { success: false, error: '搜索关键词不能为空' },
        { status: 400 }
      );
    }

    // 执行搜索
    const result = await aggregator.search(params);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '搜索失败',
      },
      { status: 500 }
    );
  }
}
