/**
 * m3u8 代理 API - 广告过滤
 *
 * GET /api/netflixgc/m3u8-proxy?url=原始m3u8地址
 *
 * 功能：
 * 1. 代理 m3u8 播放列表
 * 2. 自动识别并移除广告段
 * 3. 返回净化后的播放列表
 */

import { NextRequest, NextResponse } from 'next/server';

/** 广告段特征识别 */
const AD_SEGMENT_PATTERNS = [
  // 文件名特征
  /\/ad[\-_.]/i,
  /\/promo[\-_.]/i,
  /\/commercial[\-_.]/i,
  /\/sponsor[\-_.]/i,
  /\/preroll[\-_.]/i,
  /\/midroll[\-_.]/i,
  /\/postroll[\-_.]/i,
  /\/advert/i,
  // URL 参数特征
  /\?.*ad=true/i,
  /\?.*type=ad/i,
  // 时长特征（广告段通常 15-30 秒）
  // 这个需要结合 EXTINF 判断
];

/** 检查是否是广告段 */
function isAdSegment(uri: string): boolean {
  return AD_SEGMENT_PATTERNS.some(pattern => pattern.test(uri));
}

/** 分析 m3u8 内容，移除广告段 */
function filterM3u8(content: string, enableFilter: boolean): string {
  if (!enableFilter) return content;

  const lines = content.split('\n');
  const filteredLines: string[] = [];
  let adSegmentsRemoved = 0;
  let totalDurationRemoved = 0;

  // 主播放列表（多码率）
  if (content.includes('#EXT-X-STREAM-INF')) {
    // 主播放列表不包含广告段，直接返回
    return content;
  }

  // 媒体播放列表
  let i = 0;
  let skipNextSegment = false;

  while (i < lines.length) {
    const line = lines[i].trim();

    // 检查 EXTINF 行
    if (line.startsWith('#EXTINF:')) {
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;

      // 下一行应该是 URI
      const nextLine = (lines[i + 1] || '').trim();

      // 检查是否是广告段
      if (nextLine && !nextLine.startsWith('#') && isAdSegment(nextLine)) {
        console.log(`[广告过滤] 移除广告段: ${nextLine}, 时长: ${duration}s`);
        adSegmentsRemoved++;
        totalDurationRemoved += duration;
        // 跳过 EXTINF 和 URI 行
        i += 2;
        continue;
      }

      // 检查异常短的段（可能是广告片段）
      // 有些广告是多个 0.5-2 秒的小段组成
      if (duration > 0 && duration < 1 && nextLine && !nextLine.startsWith('#')) {
        // 检查连续的短段
        let shortSegmentCount = 0;
        let j = i;
        while (j < lines.length) {
          const shortLine = lines[j].trim();
          if (shortLine.startsWith('#EXTINF:')) {
            const shortDuration = parseFloat(shortLine.match(/#EXTINF:([\d.]+)/)?.[1] || '0');
            if (shortDuration < 2) {
              shortSegmentCount++;
              j += 2; // 跳过 EXTINF 和 URI
            } else {
              break;
            }
          } else {
            break;
          }
        }

        // 如果连续有 3+ 个短段，可能是广告
        if (shortSegmentCount >= 3) {
          console.log(`[广告过滤] 检测到疑似广告段落 (${shortSegmentCount} 个短段)`);
          // 跳过这些短段
          i = j;
          adSegmentsRemoved++;
          continue;
        }
      }
    }

    // 非广告段，保留
    filteredLines.push(lines[i]);
    i++;
  }

  if (adSegmentsRemoved > 0) {
    console.log(`[广告过滤] 共移除 ${adSegmentsRemoved} 个广告段，节省 ${totalDurationRemoved.toFixed(1)}s`);
  }

  return filteredLines.join('\n');
}

/**
 * GET /api/netflixgc/m3u8-proxy?url=xxx&filter=true
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const m3u8Url = searchParams.get('url');
  const enableFilter = searchParams.get('filter') !== 'false'; // 默认启用过滤

  if (!m3u8Url) {
    return NextResponse.json(
      { error: '请提供 m3u8 地址 (url 参数)' },
      { status: 400 }
    );
  }

  try {
    // 获取原始 m3u8 内容
    const response = await fetch(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.netflixgc.org/',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`获取 m3u8 失败: ${response.status}`);
    }

    const content = await response.text();

    // 过滤广告
    const filteredContent = filterM3u8(content, enableFilter);

    // 返回净化后的 m3u8
    return new NextResponse(filteredContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        // 添加自定义头，显示过滤信息
        'X-Ad-Filtered': enableFilter.toString(),
      },
    });
  } catch (error) {
    console.error('[m3u8 代理] 错误:', error);
    return NextResponse.json(
      {
        error: '代理请求失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
