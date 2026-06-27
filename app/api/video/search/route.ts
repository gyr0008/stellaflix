/**
 * 视频搜索 API
 *
 * GET /api/video/search?wd=关键词&source=源名称
 *
 * 使用多个 CMS 视频源搜索视频
 * 支持指定单个源，或依次尝试所有源
 */

import { NextRequest, NextResponse } from "next/server";
import { getEnabledSources, getSourceByName, getSearchUrl, type CmsSource } from "@/lib/cms-sources";

/**
 * 搜索单个 CMS 源
 *
 * @param source 源配置
 * @param keyword 搜索关键词
 * @returns 搜索结果
 */
async function searchSource(source: CmsSource, keyword: string) {
  const url = getSearchUrl(source, keyword);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(10000), // 10秒超时
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 1 || !data.list) {
    throw new Error('No results');
  }

  // 格式化结果
  const results = data.list.map((item: any) => ({
    id: item.vod_id,
    name: item.vod_name,
    year: item.vod_year,
    area: item.vod_area,
    type: item.type_name,
    poster: item.vod_pic,
    description: item.vod_remarks || '',
    playUrl: item.vod_play_url,
    playFrom: item.vod_play_from,
  }));

  return {
    success: true,
    source: source.name,
    total: results.length,
    results,
  };
}

/**
 * GET /api/video/search?wd=关键词&source=源名称
 *
 * 主处理函数
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('wd');
  const sourceName = searchParams.get('source');

  // 参数验证
  if (!keyword) {
    return NextResponse.json(
      { error: 'Missing wd parameter' },
      { status: 400 }
    );
  }

  // 指定单个源
  if (sourceName) {
    const source = getSourceByName(sourceName);
    if (!source) {
      return NextResponse.json(
        { error: `未知的源: ${sourceName}` },
        { status: 400 }
      );
    }

    try {
      const result = await searchSource(source, keyword);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({
        success: false,
        source: source.name,
        error: String(error).substring(0, 100),
      });
    }
  }

  // 依次尝试所有源（第一个成功的即返回）
  const sources = getEnabledSources();

  for (const source of sources) {
    try {
      const result = await searchSource(source, keyword);
      if (result.success && result.results && result.results.length > 0) {
        return NextResponse.json(result);
      }
    } catch (error) {
      // 继续尝试下一个源
      continue;
    }
  }

  // 所有源都失败
  return NextResponse.json({
    success: false,
    error: '所有视频源都搜索失败',
  });
}
