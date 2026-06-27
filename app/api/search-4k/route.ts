/**
 * 4K 内容搜索 API
 *
 * GET /api/search-4k?query=电影名
 *
 * 在所有 CMS 源中搜索指定电影的 4K/蓝光版本
 */

import { NextRequest, NextResponse } from 'next/server';
import { CMS_SOURCES } from '@/lib/video-sources-list';

/** 4K/蓝光关键词 */
const HD_KEYWORDS = ['4K', '4k', '蓝光', 'BluRay', 'HDR', '2160P', '2160p', 'UHD', '杜比', 'Dolby'];

/** 搜索结果 */
interface SearchResult {
  source: string;
  vod_id: number;
  vod_name: string;
  vod_pic: string;
  vod_year: string;
  vod_area: string;
  isHD: boolean;
  hdType: string[];  // 匹配的高清类型
  vod_play_from: string;
  vod_play_url: string;
}

/**
 * 检测标题中的高清类型
 */
function getHDType(title: string): string[] {
  return HD_KEYWORDS.filter(keyword =>
    title.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * 搜索单个源
 */
async function searchSource(
  source: typeof CMS_SOURCES[0],
  query: string
): Promise<SearchResult[]> {
  try {
    const searchUrl = `${source.api}?ac=detail&wd=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'StellaFlix/1.0' },
    });

    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();

    if (data.code !== 1 || !data.list) return [];

    // 过滤出包含搜索关键词的结果
    return data.list
      .filter((v: any) => {
        const name = v.vod_name.toLowerCase();
        return name.includes(query.toLowerCase());
      })
      .map((v: any) => {
        const hdType = getHDType(v.vod_name);
        return {
          source: source.name,
          vod_id: v.vod_id,
          vod_name: v.vod_name,
          vod_pic: v.vod_pic,
          vod_year: v.vod_year,
          vod_area: v.vod_area,
          isHD: hdType.length > 0,
          hdType,
          vod_play_from: v.vod_play_from,
          vod_play_url: v.vod_play_url,
        };
      });
  } catch {
    return [];
  }
}

/**
 * GET /api/search-4k?query=流浪地球
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query?.trim()) {
    return NextResponse.json(
      { success: false, error: '请提供搜索关键词 query' },
      { status: 400 }
    );
  }

  // 并发搜索所有源
  const allResults = await Promise.all(
    CMS_SOURCES.map(source => searchSource(source, query))
  );

  // 扁平化并分类
  const flatResults = allResults.flat();
  const hdResults = flatResults.filter(r => r.isHD);
  const normalResults = flatResults.filter(r => !r.isHD);

  return NextResponse.json({
    success: true,
    query,
    summary: {
      total: flatResults.length,
      hd: hdResults.length,
      normal: normalResults.length,
      sourcesChecked: CMS_SOURCES.length,
    },
    hdResults,    // 4K/蓝光版本（优先展示）
    normalResults, // 普通版本
  });
}
