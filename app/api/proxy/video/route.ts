// 视频代理 API
// 用于绕过 CORS 限制，代理视频请求
// 对于 m3u8 文件，会修改内部 URL 为代理 URL

import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/proxy/video?url=视频URL
 * 代理视频请求，添加 CORS 头
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  console.log(`[Proxy] 代理请求: ${url}`);

  try {
    // 获取视频内容
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": new URL(url).origin,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[Proxy] 请求失败: ${response.status}`);
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status}` },
        { status: response.status }
      );
    }

    // 获取内容类型
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const isM3u8 = url.includes('.m3u8') || contentType.includes('mpegurl');

    // 获取响应体
    const body = await response.arrayBuffer();

    // 如果是 m3u8 文件，修改内部 URL 为代理 URL
    if (isM3u8) {
      const text = new TextDecoder().decode(body);
      const modifiedText = modifyM3u8Urls(text, url);
      const modifiedBody = new TextEncoder().encode(modifiedText);

      console.log(`[Proxy] m3u8 已修改，原始大小: ${body.byteLength}，修改后: ${modifiedBody.byteLength}`);

      return new NextResponse(modifiedBody, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Range",
          "Cache-Control": "public, max-age=10",
        },
      });
    }

    console.log(`[Proxy] 成功，内容类型: ${contentType}，大小: ${body.byteLength}`);

    // 返回带有 CORS 头的响应
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Proxy] 代理失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "代理请求失败" },
      { status: 500 }
    );
  }
}

/**
 * 修改 m3u8 文件中的 URL 为代理 URL
 * @param content - m3u8 文件内容
 * @param baseUrl - 原始 m3u8 URL
 * @returns 修改后的内容
 */
function modifyM3u8Urls(content: string, baseUrl: string): string {
  const lines = content.split('\n');
  const baseUrlObj = new URL(baseUrl);

  return lines.map(line => {
    const trimmed = line.trim();

    // 跳过空行和注释（但保留 #EXT 标签）
    if (!trimmed || (!trimmed.startsWith('#') && trimmed.length === 0)) {
      return line;
    }

    // 如果是注释但不是 URL，直接返回
    if (trimmed.startsWith('#') && !trimmed.includes('.ts') && !trimmed.includes('.m3u8')) {
      return line;
    }

    // 如果是 URL 行（非 # 开头）
    if (!trimmed.startsWith('#')) {
      let absoluteUrl: string;

      // 处理相对路径
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        absoluteUrl = trimmed;
      } else if (trimmed.startsWith('//')) {
        absoluteUrl = `https:${trimmed}`;
      } else if (trimmed.startsWith('/')) {
        absoluteUrl = `${baseUrlObj.origin}${trimmed}`;
      } else {
        // 相对路径
        const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/') + 1);
        absoluteUrl = `${baseUrlObj.origin}${basePath}${trimmed}`;
      }

      // 返回代理 URL
      return `/api/proxy/video?url=${encodeURIComponent(absoluteUrl)}`;
    }

    return line;
  }).join('\n');
}

/**
 * OPTIONS /api/proxy/video
 * 处理预检请求
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Access-Control-Max-Age": "86400",
    },
  });
}
