/**
 * 首页精选电影 API
 *
 * 提供首页展示的电影列表，支持24小时轮换
 * 每个分区（电影高分、电影热播、纪录片高分、纪录片热播）独立轮换
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * 不良内容关键词（过滤用）
 */
const UNWANTED_KEYWORDS = [
  // 球类/体育
  '斯诺克', '篮球', '足球', 'CBA', '英超', '中超', '西甲', '德甲', '法甲',
  'NBA', '乒乓球', '羽毛球', '排球', '网球', 'F1', '赛车', '世预赛',
  // 其他不良内容
  '瑜伽裤', 'cosplay', '唯美港姐', '伦理', '同性', '短大全', '短剧'
];

/**
 * 检查视频是否包含不良关键词
 */
function isUnwanted(title: string, genre: any): boolean {
  const titleStr = String(title || '').toLowerCase();
  let genreStr = '';
  if (Array.isArray(genre)) {
    genreStr = genre.join(',').toLowerCase();
  } else if (genre && typeof genre === 'string') {
    genreStr = genre.toLowerCase();
  }
  const combined = `${titleStr} ${genreStr}`;
  return UNWANTED_KEYWORDS.some(k => combined.includes(k.toLowerCase()));
}

/**
 * 生成基于时间的种子（24小时轮换）
 * 每24小时返回相同的种子，确保当天内容一致
 */
function getDailySeed(): number {
  const now = new Date();
  // 使用日期作为种子：年*10000 + 月*100 + 日
  const dateSeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return dateSeed;
}

/**
 * 基于种子的伪随机数生成器
 * 确保相同种子产生相同的随机序列
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * 使用 Fisher-Yates 洗牌算法，基于种子打乱数组
 */
function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const random = seededRandom(seed);

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = request.nextUrl;

    // 分区类型：movie_high（电影高分）、movie_hot（电影热播）、doc_high（纪录片高分）、doc_hot（纪录片热播）
    const section = searchParams.get("section") || "movie_hot";
    const limit = parseInt(searchParams.get("limit") || "10");

    // 获取每日种子
    const dailySeed = getDailySeed();

    // 确定查询参数
    let type: string;
    let isHighQuality: boolean;

    switch (section) {
      case "movie_high":
        type = "movie";
        isHighQuality = true;
        break;
      case "movie_hot":
        type = "movie";
        isHighQuality = false;
        break;
      case "doc_high":
        type = "documentary";
        isHighQuality = true;
        break;
      case "doc_hot":
        type = "documentary";
        isHighQuality = false;
        break;
      default:
        type = "movie";
        isHighQuality = false;
    }

    // 查询电影
    let query = supabase
      .from("movies")
      .select("id, title, poster_url, backdrop_url, rating, year, genre, description, type")
      .eq("is_published", true)
      .eq("type", type);

    // 高分榜只显示8.0分以上
    if (isHighQuality) {
      query = query.gte("rating", 8.0);
    }

    // 获取足够多的数据用于随机选择
    const { data: allMovies, error } = await query
      .order("rating", { ascending: false })
      .limit(100);

    if (error) {
      console.error("查询电影失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!allMovies || allMovies.length === 0) {
      return NextResponse.json({ movies: [], section, date: getDailySeed() });
    }

    // 过滤不良内容
    const filteredMovies = allMovies.filter(m => !isUnwanted(m.title, m.genre));

    // 使用每日种子打乱并取指定数量
    const shuffled = seededShuffle(filteredMovies, dailySeed + section.charCodeAt(0));
    const selected = shuffled.slice(0, Math.min(limit, shuffled.length));

    return NextResponse.json({
      movies: selected,
      section,
      date: dailySeed,
      total: filteredMovies.length,
    });
  } catch (error) {
    console.error("首页精选 API 错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
