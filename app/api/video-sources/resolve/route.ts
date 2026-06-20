import { NextRequest, NextResponse } from "next/server";

/**
 * 视频源 URL 解析 API
 * 解析视频页面 URL，提取真实播放地址
 */

/**
 * POST /api/video-sources/resolve
 * 解析视频 URL
 * @param url - 视频页面 URL
 * @param source - 视频源标识（可选）
 */
export async function POST(request: NextRequest) {
  const { url, source } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  console.log(`[Resolve] 解析视频 URL: ${url} (来源: ${source || "未知"})`);

  try {
    // 如果是直接视频链接，直接返回
    if (isDirectVideoUrl(url)) {
      console.log("[Resolve] 直接视频链接，无需解析");
      return NextResponse.json({
        url: url,
        type: "direct",
        source: source || "unknown",
      });
    }

    // 尝试从页面提取视频 URL
    const videoUrl = await extractVideoUrl(url);

    if (videoUrl) {
      console.log("[Resolve] 成功提取视频 URL:", videoUrl);
      return NextResponse.json({
        url: videoUrl,
        type: "extracted",
        source: source || "unknown",
      });
    }

    console.log("[Resolve] 无法提取视频 URL");
    return NextResponse.json(
      {
        error: "无法提取视频地址。请尝试使用直接视频链接（.mp4/.m3u8）。",
        url: url,
      },
      { status: 422 }
    );
  } catch (err) {
    console.error("[Resolve] 解析失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "解析失败" },
      { status: 500 }
    );
  }
}

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|m3u8|webm|mkv|avi)(\?|$)/i.test(url);
}

async function extractVideoUrl(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Common patterns for video URLs in HTML
    const patterns = [
      // .mp4 or .m3u8 in src/data-url attributes
      /(?:src|data-url|data-src|data-video-url|file|url)\s*[:=]\s*["']([^"']*\.(?:mp4|m3u8|webm)[^"']*?)["']/gi,
      // source tag src
      /<source[^>]+src\s*=\s*["']([^"']*\.(?:mp4|m3u8|webm)[^"']*?)["']/gi,
      // JSON with videoUrl
      /"(?:video_?url|play_?url|stream_?url|file|url)"\s*:\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*?)"/gi,
      // player.src
      /player\.src\s*\(\s*["']([^"']*\.(?:mp4|m3u8|webm)[^"']*?)["']/gi,
    ];

    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const videoUrl = match[1];
        if (videoUrl && (videoUrl.startsWith("http://") || videoUrl.startsWith("https://"))) {
          return videoUrl;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
