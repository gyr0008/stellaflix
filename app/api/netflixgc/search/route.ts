/**
 * NetflixGC 搜索 API
 *
 * GET /api/netflixgc/search?type=movie&page=1&class=喜剧&area=中国&year=2024
 *
 * 支持的参数：
 * - type: 频道类型 (movie/tv/comic/variety/documentary/live)
 * - class: 类型筛选 (喜剧/爱情/恐怖/动作 等)
 * - area: 地区筛选 (中国/大陆/香港/美国 等)
 * - year: 年份筛选 (2024/2023/2022 等)
 * - lang: 语言筛选 (中文/粤语/英语 等)
 * - letter: 字母筛选 (A/B/C 等)
 * - by: 排序方式 (time=最新/hits=最热/score=评分)
 * - page: 页码
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getFilteredList,
  type NetflixGCSearchResult,
} from '@/lib/scrapers/netflixgc';

/** 频道类型映射 */
const CHANNEL_TYPE_MAP: Record<string, string> = {
  movie: '1',
  tv: '2',
  comic: '3',
  variety: '23',
  documentary: '24',
  live: '57',
};

/**
 * 搜索响应
 */
interface SearchResponse {
  success: boolean;
  type: string;
  page: number;
  total: number;
  results: NetflixGCSearchResult[];
  error?: string;
}

/**
 * GET /api/netflixgc/search?type=movie&page=1
 */
export async function GET(request: NextRequest): Promise<NextResponse<SearchResponse>> {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'movie';
  const page = parseInt(searchParams.get('page') || '1');

  // 获取筛选参数
  const classFilter = searchParams.get('class') || '';
  const areaFilter = searchParams.get('area') || '';
  const yearFilter = searchParams.get('year') || '';
  const langFilter = searchParams.get('lang') || '';
  const letterFilter = searchParams.get('letter') || '';
  const sortBy = searchParams.get('by') || 'time';

  try {
    let results: NetflixGCSearchResult[];

    // 始终使用带排序的 API，确保排序参数被正确传递
    results = await getFilteredList({
      type: CHANNEL_TYPE_MAP[type] || '1',
      class: classFilter,
      area: areaFilter,
      year: yearFilter,
      lang: langFilter,
      letter: letterFilter,
      by: sortBy,
      page,
    });

    return NextResponse.json({
      success: true,
      type,
      page,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('NetflixGC 搜索失败:', error);

    return NextResponse.json(
      {
        success: false,
        type,
        page,
        total: 0,
        results: [],
        error: error instanceof Error ? error.message : '搜索失败',
      },
      { status: 500 }
    );
  }
}
