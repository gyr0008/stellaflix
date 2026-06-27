/**
 * 4K 内容测试 API
 *
 * GET /api/test-4k
 *
 * 测试所有 CMS 源的 4K/蓝光内容可用性
 * 注意：Vercel 环境限制，单次请求超时 10 秒（免费版）
 */

import { NextResponse } from 'next/server';
import { CMS_SOURCES } from '@/lib/video-sources-list';

/** 4K/蓝光关键词 */
const HD_KEYWORDS = ['4K', '4k', '蓝光', 'BluRay', 'HDR', '2160P', '2160p', 'UHD', '杜比', 'Dolby'];

/** 单个源的测试结果 */
interface SourceTestResult {
  name: string;
  api: string;
  status: 'ok' | 'error' | 'timeout';
  totalResults: number;
  hdResults: number;
  hdPercentage: string;
  sampleHdTitles: string[];
  error?: string;
  responseTime: number;
}

/**
 * 检测标题是否包含 4K/蓝光关键词
 */
function isHD(title: string): boolean {
  return HD_KEYWORDS.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()));
}

/**
 * 测试单个 CMS 源
 */
async function testSource(source: typeof CMS_SOURCES[0]): Promise<SourceTestResult> {
  const startTime = Date.now();
  const result: SourceTestResult = {
    name: source.name,
    api: source.api,
    status: 'ok',
    totalResults: 0,
    hdResults: 0,
    hdPercentage: '0%',
    sampleHdTitles: [],
    responseTime: 0,
  };

  try {
    // 搜索热门内容（用 "电影" 关键词）
    const searchUrl = `${source.api}?ac=detail&wd=${encodeURIComponent('电影')}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8秒超时

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'StellaFlix/1.0',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 1 || !data.list) {
      throw new Error('Invalid response format');
    }

    const videos = data.list;
    result.totalResults = videos.length;

    // 筛选 4K/蓝光内容
    const hdVideos = videos.filter((v: any) => isHD(v.vod_name));
    result.hdResults = hdVideos.length;
    result.hdPercentage = result.totalResults > 0
      ? `${((result.hdResults / result.totalResults) * 100).toFixed(1)}%`
      : '0%';

    // 取前5个高清标题作为样本
    result.sampleHdTitles = hdVideos.slice(0, 5).map((v: any) => v.vod_name);

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      result.status = 'timeout';
      result.error = '请求超时（8秒）';
    } else {
      result.status = 'error';
      result.error = error instanceof Error ? error.message : '未知错误';
    }
  }

  result.responseTime = Date.now() - startTime;
  return result;
}

/**
 * GET /api/test-4k
 * 并发测试所有 CMS 源（Vercel 免费版限制：10秒内完成）
 */
export async function GET() {
  const startTime = Date.now();

  // 并发测试所有源
  const results = await Promise.all(
    CMS_SOURCES.map(source => testSource(source))
  );

  // 统计摘要
  const summary = {
    totalSources: results.length,
    availableSources: results.filter(r => r.status === 'ok').length,
    sourcesWithHD: results.filter(r => r.hdResults > 0).length,
    totalHDContent: results.reduce((sum, r) => sum + r.hdResults, 0),
    bestSource: results
      .filter(r => r.status === 'ok')
      .sort((a, b) => b.hdResults - a.hdResults)[0]?.name || '无',
  };

  return NextResponse.json({
    success: true,
    summary,
    results,
    timestamp: new Date().toISOString(),
    note: '部分源可能不稳定，建议多次测试',
  });
}
