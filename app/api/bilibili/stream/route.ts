/**
 * B站视频流 API
 * 根据bvid获取视频播放地址
 * 优先使用DASH格式（无水印）
 */

import { NextRequest, NextResponse } from "next/server";

/** B站视频信息响应 */
interface VideoInfoResponse {
  code: number;
  data: {
    bvid: string;
    title: string;
    desc: string;
    pic: string;
    owner: { name: string };
    stat: { view: number; danmaku: number };
    pages: Array<{ cid: number; part: string; duration: number }>;
  };
}

/** B站播放地址响应 */
interface PlayUrlResponse {
  code: number;
  data: {
    quality: number;
    format: string;
    accept_quality: number[];
    accept_description: string[];
    dash?: {
      video: Array<{
        id: number;
        baseUrl: string;
        mimeType: string;
        width: number;
        height: number;
        bandwidth: number;
        codecid: number;
      }>;
      audio: Array<{
        id: number;
        baseUrl: string;
        mimeType: string;
        bandwidth: number;
      }>;
    };
    durl?: Array<{ url: string; size: number; length: number }>;
  };
}

/**
 * 获取视频信息
 */
async function getVideoInfo(bvid: string): Promise<VideoInfoResponse> {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://www.bilibili.com",
    },
    signal: AbortSignal.timeout(10000),
  });
  return response.json();
}

/**
 * 获取MP4格式播放地址（fnval=0，单文件，API直出无水印）
 * 无水印原因：B站水印是播放器叠加的，API直接返回的原始流不含水印
 * @param bvid 视频BV号
 * @param cid 分P的cid
 * @param cookie 登录cookie（可选，有则可获取更高画质）
 */
async function getDashPlayUrl(bvid: string, cid: number, cookie?: string): Promise<PlayUrlResponse> {
  // fnval=0 返回MP4/FLV整文件格式（音视频已合并）
  // qn=116 请求1080P+，登录后可获取，未登录会自动降级
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=116&fnval=0&fourk=1`;
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": `https://www.bilibili.com/video/${bvid}`,
  };
  if (cookie) {
    headers.Cookie = cookie;
  }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  return response.json();
}

/**
 * 获取MP4格式播放地址（备用）
 */
async function getMp4PlayUrl(bvid: string, cid: number): Promise<PlayUrlResponse> {
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=0`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": `https://www.bilibili.com/video/${bvid}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  return response.json();
}

/**
 * 代理视频流（解决B站Referer限制）
 */
async function proxyStream(videoUrl: string, referer: string, range?: string) {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": referer,
  };

  if (range) {
    headers["Range"] = range;
  }

  const response = await fetch(videoUrl, { headers });

  const responseHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");
  const contentRange = response.headers.get("content-range");

  if (contentType) responseHeaders.set("Content-Type", contentType);
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Access-Control-Allow-Origin", "*");

  return new NextResponse(response.body, {
    status: range ? 206 : response.status,
    headers: responseHeaders,
  });
}

/**
 * GET /api/bilibili/stream?bvid=xxx
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bvid = searchParams.get("bvid");
  const action = searchParams.get("action") || "info";

  // 代理视频流
  if (action === "proxy") {
    const url = searchParams.get("url");
    const referer = searchParams.get("referer") || "https://www.bilibili.com";
    const range = request.headers.get("range");
    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }
    return proxyStream(url, referer, range || undefined);
  }

  if (!bvid) {
    return NextResponse.json({ error: "Missing bvid parameter" }, { status: 400 });
  }

  try {
    const info = await getVideoInfo(bvid);
    if (info.code !== 0) {
      return NextResponse.json({ success: false, error: "无法获取视频信息" });
    }

    const cid = info.data.pages[0]?.cid;
    if (!cid) {
      return NextResponse.json({ success: false, error: "视频没有可用分P" });
    }

    // 仅获取信息
    if (action === "info") {
      return NextResponse.json({
        success: true,
        bvid: info.data.bvid,
        title: info.data.title,
        desc: info.data.desc,
        pic: info.data.pic,
        author: info.data.owner.name,
        view: info.data.stat.view,
        danmaku: info.data.stat.danmaku,
        pages: info.data.pages.map((p) => ({
          cid: p.cid,
          name: p.part,
          duration: p.duration,
        })),
      });
    }

    // 获取MP4格式（fnval=0，单文件，无水印）
    // 从请求头获取登录cookie（如果有）
    const loginCookie = request.headers.get("x-bilibili-cookie") || "";
    const playResult = await getDashPlayUrl(bvid, cid, loginCookie);

    if (playResult.code === 0 && playResult.data.durl && playResult.data.durl.length > 0) {
      const durl = playResult.data.durl[0];
      const proxyUrl = `/api/bilibili/stream?action=proxy&url=${encodeURIComponent(durl.url)}&referer=${encodeURIComponent(`https://www.bilibili.com/video/${bvid}`)}`;

      return NextResponse.json({
        success: true,
        type: "mp4",
        quality: playResult.data.quality,
        format: playResult.data.format,
        url: durl.url,
        proxyUrl,
        size: durl.size,
        duration: durl.length,
        width: 0,
        height: 0,
        acceptQuality: playResult.data.accept_quality,
        acceptDescription: playResult.data.accept_description,
      });
    }

    return NextResponse.json({
      success: false,
      error: "未获取到播放地址",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error).substring(0, 200),
    });
  }
}
