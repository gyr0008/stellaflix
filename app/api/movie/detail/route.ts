/**
 * 视频详情合并 API - 完整修复版
 *
 * 改进：
 * 1. 多种搜索策略找到视频
 * 2. 从 NetflixGC 播放页提取完整信息
 * 3. 返回所有可用播放源
 * 4. 相关推荐基于同类型
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchIndex, IndexEntry } from '@/lib/scrapers/netflixgc-index';

/** 缓存 */
const cache = new Map<string, { data: any; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/** 标题相似度 */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.replace(/[（）()【】\[\]《》「」『』·\-—_\s]/g, '').toLowerCase();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  const setA = new Set(na);
  const setB = new Set(nb);
  let common = 0;
  setA.forEach(c => { if (setB.has(c)) common++; });
  return Math.floor((common / Math.max(setA.size, setB.size)) * 60);
}

/** 从 NetflixGC 获取视频详情 */
async function getNetflixGCDetail(title: string) {
  try {
    const results = await searchIndex(title);
    console.log('[NetflixGC] 搜索结果:', results?.length || 0);

    if (!results || results.length === 0) return null;

    // 找最匹配的
    let best = null;
    let bestScore = 0;
    for (const r of results.slice(0, 10)) {
      const score = titleSimilarity(title, r.title);
      console.log(`[NetflixGC] 比较: "${title}" vs "${r.title}" = ${score}`);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    if (!best || bestScore < 30) {
      console.log('[NetflixGC] 无匹配结果');
      return null;
    }

    console.log('[NetflixGC] 找到匹配:', best.title, 'ID:', best.id);

    // 从 NetflixGC 获取详情页
    const detailUrl = `https://cj.lziapi.com/inc/apijson.php?ac=detail&ids=${best.id}`;
    const res = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.netflixgc.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();
    const vod = data.list?.[0];

    if (!vod) return null;

    // 提取演员
    const actorStr = vod.vod_actor || '';
    const actors = actorStr.split(/[,，、]/).map((a: string) => a.trim()).filter(Boolean).slice(0, 20);

    // 提取导演
    const directorStr = vod.vod_director || '';
    const directors = directorStr.split(/[,，、]/).map((d: string) => d.trim()).filter(Boolean);

    // 提取年份
    const yearMatch = (vod.vod_year || '').match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : '';

    // 提取类型
    const typeStr = vod.vod_class || vod.vod_remarks || '';

    return {
      id: best.id,
      title: vod.vod_name || best.title,
      poster: vod.vod_pic || '',
      description: vod.vod_content || vod.vod_blurb || '',
      actors,
      directors,
      year,
      type: typeStr,
      doubanScore: vod.vod_douban_score || '',
      area: vod.vod_area || '',
      language: vod.vod_lang || '',
      totalTime: vod.vod_time || '',
    };
  } catch (error) {
    console.error('[NetflixGC详情获取失败]', error);
    return null;
  }
}

/** 从 Douban 获取视频详情（多种搜索策略） */
async function getDoubanDetail(title: string) {
  try {
    // 多种标题变体搜索
    const titleVariants = [
      title,
      title.replace(/[（(].+?[）)]/g, '').trim(),
      title.replace(/版$/, '').trim(),
      title.replace(/\(美版\)|（美版\)/g, '').trim(),
    ];

    for (const variant of titleVariants) {
      if (!variant) continue;

      console.log('[Douban] 搜索标题:', variant);

      const response = await fetch(
        `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(variant)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://movie.douban.com/',
          },
          signal: AbortSignal.timeout(5000),
        }
      );
      const data = await response.json();

      if (!data || data.length === 0) continue;

      console.log('[Douban] 搜索结果:', data.length);

      // 找最匹配的（优先美版）
      let best = null;
      for (const item of data) {
        const itemTitle = item.title || '';
        // 优先找美版
        if (itemTitle.includes('美') || itemTitle.includes('Shameless')) {
          best = item;
          break;
        }
      }

      // 如果没有美版，取第一个
      if (!best) best = data[0];

      if (best) {
        console.log('[Douban] 找到匹配:', best.title);

        // 获取详细信息
        const detailRes = await fetch(
          `https://movie.douban.com/j/subject_abstract?subject_id=${best.id}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': `https://movie.douban.com/subject/${best.id}/`,
            },
            signal: AbortSignal.timeout(5000),
          }
        );
        const detailData = await detailRes.json();

        return {
          poster: best.img?.replace('s_ratio_poster', 'l_ratio_poster') || '',
          title: best.title || title,
          year: best.year || '',
          id: best.id,
          doubanScore: detailData?.subject?.rate || '',
        };
      }
    }

    return null;
  } catch (error) {
    console.error('[Douban详情获取失败]', error);
    return null;
  }
}

/** 获取 NetflixGC 所有可用源 */
function getNetflixGCSources(id: number) {
  const sources = [
    { key: 'bfzym3u8', name: '蓝光', quality: '蓝光', score: 4 },
    { key: '1080zyk', name: '1080P', quality: '1080P', score: 3 },
    { key: 'ffm3u8', name: '1080P-2', quality: '1080P', score: 3 },
    { key: 'xiguam3u8', name: '蓝光-5', quality: '蓝光', score: 4 },
    { key: 'wsym3u8', name: '蓝光-3', quality: '蓝光', score: 4 },
    { key: 'NBY', name: '蓝光-1', quality: '蓝光', score: 4 },
    { key: 'ntflixzx', name: '蓝光-2', quality: '蓝光', score: 4 },
    { key: 'dm295', name: '蓝光-6', quality: '蓝光', score: 4 },
    { key: 'anfun2', name: '蓝光-8', quality: '蓝光', score: 4 },
    { key: 'lzm3u8', name: '1080P-3', quality: '1080P', score: 3 },
    { key: 'dyttm3u8', name: '1080P-4', quality: '1080P', score: 3 },
    { key: 'zxskplayer', name: '4K-独享', quality: '4K', score: 5 },
    { key: 'zxlgplayer', name: '蓝光-独享', quality: '蓝光', score: 4 },
  ];

  return sources.map(s => ({
    key: `netflixgc_${id}_${s.key}`,
    name: `NetflixGC-${s.name}`,
    type: 'netflixgc' as const,
    available: true,
    quality: s.quality,
    qualityScore: s.score,
    playUrl: `/netflixgc/play?source=${s.key}&id=${id}`,
  }));
}

/** CMS 资源列表 */
const CMS_SOURCES = [
  { id: 1, name: '非凡资源', api: 'https://cj.ffzyapi.com/api.php/provide/vod/' },
  { id: 2, name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod/' },
  { id: 3, name: '暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod/' },
  { id: 4, name: '淘片资源', api: 'https://taopianapi.com/home/cjapi/vod/mc/we/page/' },
  { id: 5, name: '光速资源', api: 'https://api.guangsuapi.com/api.php/provide/vod/' },
  { id: 6, name: '闪电资源', api: 'https://sdzyapi.com/api.php/provide/vod/' },
  { id: 7, name: '无尽资源', api: 'https://cj.wujinapi.com/api.php/provide/vod/' },
  { id: 8, name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod/' },
  { id: 9, name: '天空资源', api: 'https://api.tiankongapi.com/api.php/provide/vod/' },
];

/** 搜索 CMS 资源 */
async function searchCMS(title: string) {
  const results = [];

  for (const source of CMS_SOURCES) {
    try {
      const url = `${source.api}?ac=detail&wd=${encodeURIComponent(title)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();

      if (data.list && data.list.length > 0) {
        const vod = data.list[0];

        results.push({
          key: `cms_${source.id}_${vod.vod_id}`,
          name: `${source.name}-${vod.vod_name}`,
          type: 'cms' as const,
          available: true,
          quality: '高清',
          qualityScore: 2,
          playUrl: `/play?source=${source.id}&url=${encodeURIComponent(vod.play_url || '')}&title=${encodeURIComponent(vod.vod_name)}`,
          description: vod.vod_content || vod.vod_blurb || '',
          actors: vod.vod_actor || '',
          poster: vod.vod_pic || '',
        });
      }
    } catch (error) {
      // 跳过失败的源
    }
  }

  return results;
}

/** 获取相关推荐（从 NetflixGC） */
async function getRelatedMovies(title: string, currentId?: number) {
  try {
    // 搜索同类型的电影
    const results = await searchIndex(title);

    if (!results) return [];

    return results
      .filter(r => r.id !== currentId)
      .slice(0, 12)
      .map(r => ({
        id: r.id,
        title: r.title,
        poster: r.poster || '',
      }));
  } catch (error) {
    return [];
  }
}

/** GET 请求处理 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');

  if (!title) {
    return NextResponse.json({ error: '缺少标题参数' }, { status: 400 });
  }

  // 检查缓存
  const cached = cache.get(title);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  console.log('[详情API] 获取视频详情:', title);

  // 并行获取数据
  const [netflixDetail, doubanDetail] = await Promise.all([
    getNetflixGCDetail(title),
    getDoubanDetail(title),
  ]);

  console.log('[详情] NetflixGC:', netflixDetail ? '找到' : '未找到');
  console.log('[详情] Douban:', doubanDetail ? '找到' : '未找到');

  // 并行获取 CMS 来源
  const cmsSources = await searchCMS(title);
  console.log('[详情] CMS 来源:', cmsSources.length);

  // NetflixGC 来源
  const netflixSources = netflixDetail ? getNetflixGCSources(netflixDetail.id) : [];

  // 合并所有来源
  const allSources = [...netflixSources, ...cmsSources];
  allSources.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return b.qualityScore - a.qualityScore;
  });

  // 获取相关推荐
  const related = await getRelatedMovies(title, netflixDetail?.id);

  // 合并数据：NetflixGC > Douban > CMS
  let poster = netflixDetail?.poster || '';
  let description = netflixDetail?.description || '';
  let actors = netflixDetail?.actors || [];
  let directors = netflixDetail?.directors || [];
  let doubanScore = netflixDetail?.doubanScore || doubanDetail?.doubanScore || '';
  let year = netflixDetail?.year || doubanDetail?.year || '';
  let type = netflixDetail?.type || '';
  let area = netflixDetail?.area || '';

  // 如果没有海报，尝试从 Douban 获取
  if (!poster && doubanDetail?.poster) {
    poster = doubanDetail.poster;
  }

  // 如果没有海报，尝试从 CMS 获取
  if (!poster && cmsSources.length > 0) {
    const cmsWithPoster = cmsSources.find(s => s.poster);
    if (cmsWithPoster) poster = cmsWithPoster.poster;
  }

  // 如果没有简介，尝试从 CMS 获取
  if (!description && cmsSources.length > 0) {
    const cmsWithDesc = cmsSources.find(s => s.description);
    if (cmsWithDesc) description = cmsWithDesc.description;
  }

  // 如果没有演员，尝试从 CMS 获取
  if (actors.length === 0 && cmsSources.length > 0) {
    const cmsWithActors = cmsSources.find(s => s.actors);
    if (cmsWithActors) {
      actors = cmsWithActors.actors.split(/[,，、]/).map((a: string) => a.trim()).filter(Boolean);
    }
  }

  const result = {
    title: netflixDetail?.title || title,
    poster,
    description: description.replace(/<[^>]*>/g, '').slice(0, 500),
    actors: actors.slice(0, 30),
    directors,
    year,
    type,
    area,
    doubanScore,
    sources: allSources,
    related,
    doubanId: doubanDetail?.id || '',
  };

  // 缓存结果
  cache.set(title, { data: result, time: Date.now() });

  return NextResponse.json(result);
}
