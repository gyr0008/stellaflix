/**
 * 图片代理 API
 *
 * 解决跨域和防盗链问题
 * 用于代理豆瓣、猫眼等图片
 */

import { NextRequest, NextResponse } from 'next/server';

/** 图片缓存 */
const cache = new Map<string, { data: ArrayBuffer; time: number; contentType: string }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

/** 允许的图片域名 */
const ALLOWED_DOMAINS = [
  'movie.douban.com',
  'img1.doubanio.com',
  'img2.doubanio.com',
  'img3.doubanio.com',
  'img9.doubanio.com',
  'img.doubanio.com',
  'p0.meituan.net',
  'p1.meituan.net',
  'img.moedog.org',
  'ims.99meiju.cn',  // 添加 CMS 图片域名
  'img.99meiju.cn',
];

/** GET 请求处理 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  }

  try {
    // 解码 URL
    const decodedUrl = decodeURIComponent(url);

    // 验证域名
    const urlObj = new URL(decodedUrl);
    const isAllowed = ALLOWED_DOMAINS.some(domain => urlObj.hostname.includes(domain));

    if (!isAllowed) {
      return NextResponse.json({ error: '不允许的域名' }, { status: 403 });
    }

    // 检查缓存
    const cached = cache.get(decodedUrl);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 获取图片
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://movie.douban.com/',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: '图片获取失败' }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const data = await response.arrayBuffer();

    // 缓存图片
    cache.set(decodedUrl, { data, time: Date.now(), contentType });

    // 返回图片
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[图片代理失败]', error);
    return NextResponse.json({ error: '图片代理失败' }, { status: 500 });
  }
}
