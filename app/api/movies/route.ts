import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

/**
 * 不良内容关键词（与 sync-cms 保持一致）
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

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { success } = await rateLimit(`movies:${ip}`, 30, 60);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createClient();
  const { searchParams } = request.nextUrl;

  const genre = searchParams.get("genre");
  const search = searchParams.get("search");
  const contentType = searchParams.get("type"); // movie 或 documentary
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;
  // 排序方式: hot(热播), top(高分), classic(经典), random(随机)
  const sort = searchParams.get("sort") || "hot";

  let query = supabase
    .from("movies")
    .select("id, title, poster_url, backdrop_url, rating, year, genre, is_premium, description, type", { count: "exact" })
    .eq("is_published", true)
    .range(offset, offset + limit - 1);

  // 根据排序方式设置排序
  switch (sort) {
    case "top":
      // 高分榜：按评分降序，只显示8.0分以上
      query = query.order("rating", { ascending: false }).gte("rating", 8.0);
      break;
    case "classic":
      // 经典榜：按年份升序（老电影）
      query = query.order("year", { ascending: true });
      break;
    case "random":
      // 随机：不指定排序，由数据库随机
      query = query.order("id", { ascending: false });
      break;
    case "hot":
    default:
      // 热播榜：按创建时间降序（最新）
      query = query.order("created_at", { ascending: false });
      break;
  }

  // 按类型筛选（电影/纪录片）
  if (contentType) {
    query = query.eq("type", contentType);
  }

  if (genre) {
    query = query.contains("genre", [genre]);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 过滤不良内容
  let movies = (data || []).filter(m => !isUnwanted(m.title, m.genre));

  // 如果是随机排序，打乱结果
  if (sort === "random" && movies.length > 0) {
    movies = movies.sort(() => Math.random() - 0.5);
  }

  return NextResponse.json({
    movies,
    total: movies.length,
    page,
    totalPages: Math.ceil((movies.length || 0) / limit),
  });
}
