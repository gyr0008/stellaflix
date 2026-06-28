/**
 * CMS同步API
 *
 * 功能：
 * - 从多个CMS源获取视频数据
 * - 同步到Supabase数据库
 * - 支持电影、纪录片、其他类型
 * - 过滤短剧/微短剧内容
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// CMS视频源配置（全部9个源）
const CMS_SOURCES = [
  { name: '非凡资源', api: 'http://cj.ffzyapi.com/api.php/provide/vod', type: 'movie' },
  { name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod', type: 'documentary' },
  { name: '暴风影视', api: 'https://bfzyapi.com/api.php/provide/vod', type: 'other' },
  { name: '光速资源', api: 'https://api.guangsuapi.com/api.php/provide/vod', type: 'movie' },
  { name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod', type: 'movie' },
  { name: '恋单资源', api: 'https://www.lovedan.net/api.php/provide/vod', type: 'documentary' },
  { name: '瑞诚资源', api: 'https://cj.rycjapi.com/api.php/provide/vod', type: 'other' },
  { name: '360资源', api: 'https://360zy.com/api.php/provide/vod', type: 'movie' },
  { name: '闪电资源', api: 'https://sdzyapi.com/api.php/provide/vod', type: 'documentary' },
];

/**
 * 短剧/微短剧过滤器
 * 包含短剧类型的关键词和标题特征
 */
const SHORT_DRAMA_KEYWORDS = [
  // 类型关键词
  '短剧', '微短剧', '竖屏剧', '网络短剧', '迷你剧',
  // 标题特征 - 爽文/穿越/甜宠
  '穿成', '重生', '逆袭', '甜恋', '甜宠', '爽文',
  '首富', '豪门', '总裁', '契约', '替嫁', '闪婚',
  '离婚', '出轨', '复仇', '打脸', '开挂', '系统',
  '穿越', '穿越重生', '穿越古代', '穿越现代',
  // 其他短剧常见特征
  '全集', '完结', '连载', '更新至',
];

/**
 * 不良内容/低质量内容过滤器
 * 用户要求过滤的特定类型视频
 */
const UNWANTED_CONTENT_KEYWORDS = [
  // 球类/体育
  '斯诺克', '篮球', '足球', 'CBA', '英超', '中超', '西甲', '德甲', '法甲',
  'NBA', '乒乓球', '羽毛球', '排球', '网球', 'F1', '赛车', '世预赛',
  // 瑜伽/健身类
  '瑜伽裤',
  // cosplay
  'cosplay', 'Cosplay', 'COSPLAY',
  // 港姐相关
  '唯美港姐',
  // 伦理类
  '伦理',
  // 同性题材
  '同性',
  // 短视频合集
  '短大全',
];

/**
 * 检查视频是否为不良内容/低质量内容
 * @param title 视频标题
 * @param genre 视频类型
 * @returns 是否应该过滤
 */
function isUnwantedContent(title: string, genre: any): boolean {
  const titleStr = String(title || '').toLowerCase();

  let genreStr = '';
  if (Array.isArray(genre)) {
    genreStr = genre.join(',').toLowerCase();
  } else if (genre && typeof genre === 'string') {
    genreStr = genre.toLowerCase();
  }

  const combined = `${titleStr} ${genreStr}`;

  for (const keyword of UNWANTED_CONTENT_KEYWORDS) {
    if (combined.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * 检查视频是否为短剧/微短剧
 * @param title 视频标题
 * @param genre 视频类型（可能是字符串、数组或空值）
 * @returns 是否为短剧
 */
function isShortDrama(title: string, genre: any): boolean {
  // 安全处理标题
  const titleStr = String(title || '').toLowerCase();

  // 安全处理 genre（可能是字符串、数组、null、undefined）
  let genreStr = '';
  if (Array.isArray(genre)) {
    genreStr = genre.join(',').toLowerCase();
  } else if (genre && typeof genre === 'string') {
    genreStr = genre.toLowerCase();
  }

  // 检查标题是否包含短剧关键词
  for (const keyword of SHORT_DRAMA_KEYWORDS) {
    if (titleStr.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  // 检查类型是否包含短剧
  if (genreStr.includes('短剧') || genreStr.includes('微短剧')) {
    return true;
  }

  return false;
}

/**
 * 检查视频是否有有效的封面图片
 * @param posterUrl 封面URL
 * @returns 是否有有效封面
 */
function hasValidPoster(posterUrl: any): boolean {
  // 检查是否为空、null、undefined
  if (!posterUrl) return false;

  // 检查是否为空字符串
  if (typeof posterUrl === 'string' && posterUrl.trim() === '') return false;

  // 检查是否为无效值
  if (posterUrl === 'null' || posterUrl === 'undefined') return false;

  // 检查URL格式是否有效
  if (typeof posterUrl === 'string' && !posterUrl.startsWith('http')) return false;

  return true;
}

/**
 * 从CMS获取视频列表
 */
async function fetchCmsList(api: string, page: number = 1, limit: number = 50): Promise<any[]> {
  try {
    const url = `${api}?ac=list&pg=${page}&pagesize=${limit}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (data.code !== 1 || !data.list) return [];

    return data.list;
  } catch (error) {
    return [];
  }
}

/**
 * 获取视频详情
 */
async function fetchCmsDetail(api: string, id: number): Promise<any | null> {
  try {
    const url = `${api}?ac=detail&ids=${id}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.code !== 1 || !data.list || data.list.length === 0) return null;

    return data.list[0];
  } catch (error) {
    return null;
  }
}

/**
 * 处理CMS数据为数据库格式
 */
function formatMovieData(vod: any, sourceType: string) {
  // 解析类型
  const genreMap: Record<string, string> = {
    '动作': '动作', '喜剧': '喜剧', '爱情': '爱情', '科幻': '科幻',
    '恐怖': '恐怖', '剧情': '剧情', '战争': '战争', '动画': '动画',
    '犯罪': '犯罪', '悬疑': '悬疑', '奇幻': '奇幻', '冒险': '冒险',
    '家庭': '家庭', '历史': '历史', '传记': '传记', '纪录片': '纪录片',
  };

  // 返回数组格式，而不是字符串
  const genres = (vod.vod_class || '').split(',').map((g: string) => genreMap[g.trim()] || g.trim()).filter(Boolean);
  const region = vod.vod_area || '其它';
  const language = vod.vod_lang || '其它';
  const year = parseInt(vod.vod_year) || 2024;

  return {
    title: vod.vod_name || '未知',
    poster_url: vod.vod_pic || '',
    rating: 0,
    year: year,
    genre: genres,  // 直接返回数组
    type: sourceType,
    region: region,
    language: language,
    description: (vod.vod_content || vod.vod_blurb || '').replace(/<[^>]*>/g, '').substring(0, 500),
    heat: vod.vod_hits || 0,
  };
}

/**
 * POST /api/admin/sync-cms
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { action, sourceIndex, page = 1, limit = 20 } = body;

    // 清除数据
    if (action === 'clear') {
      const { error } = await supabase
        .from('movies')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        return NextResponse.json({ success: false, error: error.message });
      }

      return NextResponse.json({
        success: true,
        message: '已清除所有数据',
      });
    }

    // 删除短剧/微短剧
    if (action === 'deleteShortDrama') {
      const { data: allMovies, error: fetchError } = await supabase
        .from('movies')
        .select('id, title, genre');

      if (fetchError) {
        return NextResponse.json({ success: false, error: fetchError.message });
      }

      // 找出短剧/微短剧
      const shortDramaIds = (allMovies || [])
        .filter(movie => isShortDrama(movie.title, movie.genre || ''))
        .map(movie => movie.id);

      if (shortDramaIds.length === 0) {
        return NextResponse.json({
          success: true,
          message: '没有找到短剧/微短剧',
          deleted: 0,
        });
      }

      // 删除短剧
      const { error: deleteError } = await supabase
        .from('movies')
        .delete()
        .in('id', shortDramaIds);

      if (deleteError) {
        return NextResponse.json({ success: false, error: deleteError.message });
      }

      return NextResponse.json({
        success: true,
        message: `已删除 ${shortDramaIds.length} 个短剧/微短剧`,
        deleted: shortDramaIds.length,
      });
    }

    // 删除没有封面的视频
    if (action === 'deleteNoPoster') {
      const { data: allMovies, error: fetchError } = await supabase
        .from('movies')
        .select('id, title, poster_url');

      if (fetchError) {
        return NextResponse.json({ success: false, error: fetchError.message });
      }

      // 找出没有封面的视频
      const noPosterIds = (allMovies || [])
        .filter(movie => !movie.poster_url || movie.poster_url.trim() === '' || movie.poster_url === 'null' || movie.poster_url === 'undefined')
        .map(movie => movie.id);

      if (noPosterIds.length === 0) {
        return NextResponse.json({
          success: true,
          message: '所有视频都有封面',
          deleted: 0,
        });
      }

      // 删除没有封面的视频
      const { error: deleteError } = await supabase
        .from('movies')
        .delete()
        .in('id', noPosterIds);

      if (deleteError) {
        return NextResponse.json({ success: false, error: deleteError.message });
      }

      return NextResponse.json({
        success: true,
        message: `已删除 ${noPosterIds.length} 个没有封面的视频`,
        deleted: noPosterIds.length,
      });
    }

    // 删除封面无法访问的视频（403/404等）- 全量检测
    if (action === 'deleteBrokenPoster') {
      let totalDeleted = 0;
      let batchCount = 0;
      const maxBatches = 100; // 最多处理100批，每批100个，共10000个视频

      while (batchCount < maxBatches) {
        // 每次获取一批未处理的视频
        const { data: batchMovies, error: fetchError } = await supabase
          .from('movies')
          .select('id, title, poster_url')
          .not('poster_url', 'is', null)
          .range(batchCount * 100, (batchCount + 1) * 100 - 1);

        if (fetchError) {
          return NextResponse.json({ success: false, error: fetchError.message });
        }

        if (!batchMovies || batchMovies.length === 0) {
          break; // 没有更多数据
        }

        const failedIds: string[] = [];

        // 并发检测这批视频的封面
        const checkPromises = batchMovies.map(async (movie) => {
          try {
            const response = await fetch(movie.poster_url, {
              method: 'HEAD',
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(3000),
            });
            if (!response.ok) {
              failedIds.push(movie.id);
            }
          } catch {
            failedIds.push(movie.id);
          }
        });

        await Promise.all(checkPromises);

        // 批量删除这批中失效的视频
        if (failedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('movies')
            .delete()
            .in('id', failedIds);

          if (!deleteError) {
            totalDeleted += failedIds.length;
          }
        }

        batchCount++;

        // 如果这批数据不满100条，说明已经是最后一批了
        if (batchMovies.length < 100) {
          break;
        }
      }

      return NextResponse.json({
        success: true,
        message: totalDeleted > 0
          ? `已删除 ${totalDeleted} 个封面无法访问的视频`
          : '所有封面都可以正常访问',
        deleted: totalDeleted,
        batchesProcessed: batchCount,
      });
    }

    // ==================== 新增：按关键词删除视频 ====================

    /**
     * 删除包含指定关键词的视频
     * 支持标题和类型匹配
     */
    if (action === 'deleteByKeywords') {
      const keywords = (body as any).keywords || [];
      if (!keywords.length) {
        return NextResponse.json({ success: false, error: '请提供要删除的关键词列表' });
      }

      let totalDeleted = 0;
      const deletedByKeyword: Record<string, number> = {};

      // 对每个关键词执行删除
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();

        // 查找标题包含关键词的视频
        const { data: byTitle, error: titleError } = await supabase
          .from('movies')
          .select('id')
          .ilike('title', `%${keyword}%`);

        // 查找类型包含关键词的视频
        const { data: byGenre, error: genreError } = await supabase
          .from('movies')
          .select('id')
          .contains('genre', [keyword]);

        // 合并ID（去重）
        const idsToDelete = new Set<string>();
        if (byTitle) byTitle.forEach(m => idsToDelete.add(m.id));
        if (byGenre) byGenre.forEach(m => idsToDelete.add(m.id));

        if (idsToDelete.size > 0) {
          const { error: deleteError } = await supabase
            .from('movies')
            .delete()
            .in('id', Array.from(idsToDelete));

          if (!deleteError) {
            totalDeleted += idsToDelete.size;
            deletedByKeyword[keyword] = idsToDelete.size;
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `已删除 ${totalDeleted} 个视频`,
        deleted: totalDeleted,
        deletedByKeyword,
        keywords,
      });
    }

    // ==================== 新增：删除低评分视频 ====================

    /**
     * 删除评分低于指定阈值的视频
     */
    if (action === 'deleteLowRating') {
      const minRating = (body as any).minRating || 6.0;

      // 查找评分低于阈值的视频（排除评分为0的，可能是未评分）
      const { data: lowRated, error: fetchError } = await supabase
        .from('movies')
        .select('id, title, rating')
        .gt('rating', 0)  // 排除未评分
        .lt('rating', minRating);

      if (fetchError) {
        return NextResponse.json({ success: false, error: fetchError.message });
      }

      if (!lowRated || lowRated.length === 0) {
        return NextResponse.json({
          success: true,
          message: `没有评分低于 ${minRating} 的视频`,
          deleted: 0,
        });
      }

      const idsToDelete = lowRated.map(m => m.id);

      const { error: deleteError } = await supabase
        .from('movies')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        return NextResponse.json({ success: false, error: deleteError.message });
      }

      return NextResponse.json({
        success: true,
        message: `已删除 ${idsToDelete.length} 个评分低于 ${minRating} 的视频`,
        deleted: idsToDelete.length,
        minRating,
        samples: lowRated.slice(0, 5).map(m => `${m.title} (${m.rating}分)`),
      });
    }

    // 同步单个CMS源（带过滤）
    if (action === 'sync') {
      const source = CMS_SOURCES[sourceIndex || 0];
      if (!source) {
        return NextResponse.json({ success: false, error: '无效的数据源' });
      }

      const list = await fetchCmsList(source.api, page, limit);
      if (list.length === 0) {
        return NextResponse.json({
          success: false,
          error: '无法从CMS获取数据',
        });
      }

      const movies = [];
      let filteredCount = 0;
      let filteredNoPoster = 0;
      let filteredUnwanted = 0;
      let filteredLowRating = 0;

      for (const item of list.slice(0, 15)) {
        const detail = await fetchCmsDetail(source.api, item.vod_id);
        if (detail) {
          const movieData = formatMovieData(detail, source.type);

          // 过滤短剧/微短剧
          if (isShortDrama(movieData.title, movieData.genre)) {
            filteredCount++;
            continue;
          }

          // 过滤不良内容/低质量内容
          if (isUnwantedContent(movieData.title, movieData.genre)) {
            filteredUnwanted++;
            continue;
          }

          // 过滤低评分视频（评分>0且<6.0的不导入）
          if (movieData.rating > 0 && movieData.rating < 6.0) {
            filteredLowRating++;
            continue;
          }

          // 过滤没有封面的视频
          if (!hasValidPoster(movieData.poster_url)) {
            filteredNoPoster++;
            continue;
          }

          movies.push(movieData);
        }
      }

      const { data, error } = await supabase
        .from('movies')
        .insert(movies)
        .select();

      if (error) {
        return NextResponse.json({ success: false, error: error.message });
      }

      return NextResponse.json({
        success: true,
        source: source.name,
        total: movies.length,
        filtered: filteredCount,
        filteredUnwanted,
        filteredLowRating,
        filteredNoPoster: filteredNoPoster,
        data,
      });
    }

    // 一键同步所有源（带过滤）
    if (action === 'syncAll') {
      let totalMovies = 0;
      let totalFiltered = 0;
      let totalFilteredNoPoster = 0;
      let totalFilteredUnwanted = 0;
      let totalFilteredLowRating = 0;
      const results = [];

      for (let i = 0; i < CMS_SOURCES.length; i++) {
        const source = CMS_SOURCES[i];
        let sourceTotal = 0;
        let sourceFiltered = 0;
        let sourceFilteredNoPoster = 0;
        let sourceFilteredUnwanted = 0;
        let sourceFilteredLowRating = 0;

        for (let p = 1; p <= 3; p++) {
          const list = await fetchCmsList(source.api, p, 20);
          if (list.length === 0) break;

          const movies = [];
          for (const item of list.slice(0, 15)) {
            const detail = await fetchCmsDetail(source.api, item.vod_id);
            if (detail) {
              const movieData = formatMovieData(detail, source.type);

              // 过滤短剧/微短剧
              if (isShortDrama(movieData.title, movieData.genre)) {
                sourceFiltered++;
                continue;
              }

              // 过滤不良内容/低质量内容
              if (isUnwantedContent(movieData.title, movieData.genre)) {
                sourceFilteredUnwanted++;
                continue;
              }

              // 过滤低评分视频（评分>0且<6.0的不导入）
              if (movieData.rating > 0 && movieData.rating < 6.0) {
                sourceFilteredLowRating++;
                continue;
              }

              // 过滤没有封面的视频
              if (!hasValidPoster(movieData.poster_url)) {
                sourceFilteredNoPoster++;
                continue;
              }

              movies.push(movieData);
            }
          }

          if (movies.length > 0) {
            await supabase.from('movies').insert(movies);
            sourceTotal += movies.length;
          }
        }

        totalMovies += sourceTotal;
        totalFiltered += sourceFiltered;
        totalFilteredNoPoster += sourceFilteredNoPoster;
        totalFilteredUnwanted += sourceFilteredUnwanted;
        totalFilteredLowRating += sourceFilteredLowRating;
        results.push({
          source: source.name,
          count: sourceTotal,
          filtered: sourceFiltered,
          filteredUnwanted: sourceFilteredUnwanted,
          filteredLowRating: sourceFilteredLowRating,
          filteredNoPoster: sourceFilteredNoPoster
        });
      }

      return NextResponse.json({
        success: true,
        message: `同步完成，已导入 ${totalMovies} 个视频`,
        total: totalMovies,
        filtered: totalFiltered,
        filteredUnwanted: totalFilteredUnwanted,
        filteredLowRating: totalFilteredLowRating,
        filteredNoPoster: totalFilteredNoPoster,
        details: results,
      });
    }

    // 一键清理所有无效视频（短剧 + 无封面 + 封面失效）
    if (action === 'cleanupAll') {
      let totalShortDrama = 0;
      let totalNoPoster = 0;
      let totalBrokenPoster = 0;

      // 1. 删除短剧/微短剧
      const { data: allMovies1 } = await supabase
        .from('movies')
        .select('id, title, genre');

      const shortDramaIds = (allMovies1 || [])
        .filter(movie => isShortDrama(movie.title, movie.genre || ''))
        .map(movie => movie.id);

      if (shortDramaIds.length > 0) {
        await supabase.from('movies').delete().in('id', shortDramaIds);
        totalShortDrama = shortDramaIds.length;
      }

      // 2. 删除无封面视频
      const { data: allMovies2 } = await supabase
        .from('movies')
        .select('id, poster_url');

      const noPosterIds = (allMovies2 || [])
        .filter(movie => !movie.poster_url || movie.poster_url.trim() === '' || movie.poster_url === 'null' || movie.poster_url === 'undefined')
        .map(movie => movie.id);

      if (noPosterIds.length > 0) {
        await supabase.from('movies').delete().in('id', noPosterIds);
        totalNoPoster = noPosterIds.length;
      }

      // 3. 删除封面失效的视频（分批处理）
      let batchCount = 0;
      const maxBatches = 100;

      while (batchCount < maxBatches) {
        const { data: batchMovies } = await supabase
          .from('movies')
          .select('id, poster_url')
          .not('poster_url', 'is', null)
          .range(batchCount * 100, (batchCount + 1) * 100 - 1);

        if (!batchMovies || batchMovies.length === 0) break;

        const failedIds: string[] = [];
        const checkPromises = batchMovies.map(async (movie) => {
          try {
            const response = await fetch(movie.poster_url, {
              method: 'HEAD',
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(3000),
            });
            if (!response.ok) failedIds.push(movie.id);
          } catch {
            failedIds.push(movie.id);
          }
        });

        await Promise.all(checkPromises);

        if (failedIds.length > 0) {
          await supabase.from('movies').delete().in('id', failedIds);
          totalBrokenPoster += failedIds.length;
        }

        batchCount++;
        if (batchMovies.length < 100) break;
      }

      const total = totalShortDrama + totalNoPoster + totalBrokenPoster;

      return NextResponse.json({
        success: true,
        message: `清理完成！共删除 ${total} 个无效视频`,
        details: {
          shortDrama: totalShortDrama,
          noPoster: totalNoPoster,
          brokenPoster: totalBrokenPoster,
        },
        deleted: total,
      });
    }

    return NextResponse.json({ success: false, error: '无效的操作' });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    });
  }
}

/**
 * GET /api/admin/sync-cms
 */
export async function GET() {
  return NextResponse.json({
    sources: CMS_SOURCES.map((s, i) => ({
      index: i,
      name: s.name,
      type: s.type,
    })),
    actions: ['clear', 'sync', 'syncAll', 'deleteShortDrama'],
    filterInfo: {
      description: '短剧/微短剧过滤器已启用',
      keywords: SHORT_DRAMA_KEYWORDS,
    },
  });
}
