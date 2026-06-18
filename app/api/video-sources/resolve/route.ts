import { NextRequest, NextResponse } from "next/server";

// 解析视频源 URL，提取真实播放地址
export async function POST(request: NextRequest) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  try {
    // If it's already a direct video URL, return it
    if (isDirectVideoUrl(url)) {
      return NextResponse.json({ video_url: url, type: "direct" });
    }

    // Try to extract video URL from the page
    const videoUrl = await extractVideoUrl(url);

    if (videoUrl) {
      return NextResponse.json({ video_url: videoUrl, type: "extracted" });
    }

    return NextResponse.json(
      { error: "Could not extract video URL. Try using a direct .mp4/.m3u8 link." },
      { status: 422 }
    );
  } catch (err) {
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
