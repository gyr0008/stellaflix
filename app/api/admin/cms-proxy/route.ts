/**
 * CMS代理API
 * 通过后端代理获取CMS数据，避免CORS问题
 */

import { NextRequest, NextResponse } from "next/server";

// CMS源配置（全部9个源）
const CMS_SOURCES = [
  { name: '非凡资源', api: 'http://cj.ffzyapi.com/api.php/provide/vod' },
  { name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod' },
  { name: '暴风影视', api: 'https://bfzyapi.com/api.php/provide/vod' },
  { name: '光速资源', api: 'https://api.guangsuapi.com/api.php/provide/vod' },
  { name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod' },
  { name: '恋单资源', api: 'https://www.lovedan.net/api.php/provide/vod' },
  { name: '瑞诚资源', api: 'https://cj.rycjapi.com/api.php/provide/vod' },
  { name: '360资源', api: 'https://360zy.com/api.php/provide/vod' },
  { name: '闪电资源', api: 'https://sdzyapi.com/api.php/provide/vod' },
];

/**
 * GET /api/admin/cms-proxy?source=0&action=list&page=1
 * GET /api/admin/cms-proxy?source=0&action=detail&id=123
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sourceIndex = parseInt(searchParams.get('source') || '0');
  const action = searchParams.get('action') || 'list';
  const page = searchParams.get('page') || '1';
  const id = searchParams.get('id');

  const source = CMS_SOURCES[sourceIndex];
  if (!source) {
    return NextResponse.json({ error: '无效的数据源' }, { status: 400 });
  }

  try {
    let url = '';

    if (action === 'list') {
      url = `${source.api}?ac=list&pg=${page}&pagesize=20`;
    } else if (action === 'detail' && id) {
      url = `${source.api}?ac=detail&ids=${id}`;
    } else {
      return NextResponse.json({ error: '无效的参数' }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'CMS请求失败' }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
