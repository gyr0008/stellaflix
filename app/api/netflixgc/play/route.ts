/**
 * NetflixGC 播放解析 API
 *
 * GET /api/netflixgc/play?id=视频ID&source=bfzym3u8&episode=1
 *
 * 获取视频的真实 m3u8 播放地址
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPlayUrl,
  getAvailableSources,
  getPlaySources,
  buildPlayUrl,
  buildDetailUrl,
  type PlaySource,
} from '@/lib/scrapers/netflixgc';

/**
 * 播放响应
 */
interface PlayResponse {
  success: boolean;
  id: number;
  m3u8Url: string;
  sourceKey: string;
  sourceName: string;
  availableSources: PlaySource[];
  playPageUrl: string;
  detailUrl: string;
  error?: string;
}

/**
 * GET /api/netflixgc/play?id=118539&source=bfzym3u8&episode=1
 */
export async function GET(request: NextRequest): Promise<NextResponse<PlayResponse>> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const sourceKey = searchParams.get('source') || 'bfzym3u8';
  const episodeIndex = parseInt(searchParams.get('episode') || '1');

  // 参数验证
  if (!id) {
    return NextResponse.json(
      {
        success: false,
        id: 0,
        m3u8Url: '',
        sourceKey: '',
        sourceName: '',
        availableSources: [],
        playPageUrl: '',
        detailUrl: '',
        error: '请提供视频 ID (id 参数)',
      },
      { status: 400 }
    );
  }

  try {
    const videoId = parseInt(id);

    // 获取可用源列表
    const availableSources = await getAvailableSources(videoId, episodeIndex);

    // 获取指定源的信息
    const source = getPlaySources().find(s => s.key === sourceKey) || {
      key: sourceKey,
      name: sourceKey,
      quality: '未知' as const,
      parseUrl: '',
    };

    // 获取真实的 m3u8 地址
    const m3u8Url = await getPlayUrl(videoId, 1, episodeIndex);

    const playPageUrl = buildPlayUrl(videoId, 1, episodeIndex);
    const detailUrl = buildDetailUrl(videoId);

    return NextResponse.json({
      success: true,
      id: videoId,
      m3u8Url,
      sourceKey: source.key,
      sourceName: source.name,
      availableSources,
      playPageUrl,
      detailUrl,
    });
  } catch (error) {
    console.error('NetflixGC 播放解析失败:', error);

    return NextResponse.json(
      {
        success: false,
        id: parseInt(id || '0'),
        m3u8Url: '',
        sourceKey: '',
        sourceName: '',
        availableSources: [],
        playPageUrl: '',
        detailUrl: '',
        error: error instanceof Error ? error.message : '播放解析失败',
      },
      { status: 500 }
    );
  }
}
