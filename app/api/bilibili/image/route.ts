/**
 * B站图片代理 API
 * 用途：代理B站CDN图片，解决封面图片加载问题
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    // 确保URL以https开头
    const fullUrl = imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl;

    // 验证是B站CDN域名
    const urlObj = new URL(fullUrl);
    const allowedHosts = ["hdslb.com", "bilibili.com", "bbkf.com.cn"];
    const isAllowed = allowedHosts.some(
      (host) => urlObj.hostname === host || urlObj.hostname.endsWith(`.${host}`)
    );

    if (!isAllowed) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }

    // 代理请求图片
    const response = await fetch(fullUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com",
        Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status}` },
        { status: response.status }
      );
    }

    // 获取图片数据
    const imageBuffer = await response.arrayBuffer();

    // 返回图片，设置缓存和CORS头
    const headers = new Headers();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", imageBuffer.byteLength.toString());
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set(
      "Cache-Control",
      "public, max-age=86400, s-maxage=86400"
    );

    return new NextResponse(imageBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error).substring(0, 200) },
      { status: 500 }
    );
  }
}
