/**
 * 视频解析 API
 * 解析视频播放地址
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playUrl = searchParams.get('url');
  const source = searchParams.get('source') || '暴风影视';

  if (!playUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // 检查是否是 m3u8 格式
    if (playUrl.includes('.m3u8')) {
      return NextResponse.json({
        success: true,
        type: 'hls',
        url: playUrl,
        source,
      });
    }

    // 检查是否是 mp4 格式
    if (playUrl.includes('.mp4')) {
      return NextResponse.json({
        success: true,
        type: 'mp4',
        url: playUrl,
        source,
      });
    }

    // 其他格式，尝试作为直链
    return NextResponse.json({
      success: true,
      type: 'direct',
      url: playUrl,
      source,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    });
  }
}
