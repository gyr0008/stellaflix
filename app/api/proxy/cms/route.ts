/**
 * CMS 视频源代理 API
 * 用途：代理请求 CMS 视频源，解决 CORS 问题
 */

import { NextRequest, NextResponse } from "next/server";

// 允许的源域名（已测试可用）
const ALLOWED_DOMAINS = [
  'bfzyapi.com',      // 暴风影视
  'lziapi.com',       // 量子资源
  'ffzyapi.com',      // 非凡资源
  'guangsuapi.com',   // 光速资源
  'hongniuzy2.com',   // 红牛资源
  'lovedan.net',      // 恋单资源
  'rycjapi.com',      // 瑞诚资源
  '360zy.com',        // 360资源
  'jyzyapi.com',      // 佳影资源
  'gzys.cyou',
  'nby.icu',
  'nsys.app',
  'jpys.me',
  'co4k.com',
  'yynb.me',
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  try {
    const url = new URL(targetUrl);

    // 检查域名是否允许
    const isAllowed = ALLOWED_DOMAINS.some(domain =>
      url.hostname.includes(domain)
    );

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Domain not allowed' },
        { status: 403 }
      );
    }

    // 代理请求
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
