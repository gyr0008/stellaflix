// 视频代理 API
// 用于绕过 CORS 限制，代理视频请求

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

    // 获取响应体
    const body = await response.arrayBuffer();

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
