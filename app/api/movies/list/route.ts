/**
 * 电影列表API
 *
 * 支持筛选：
 * - type: movie / documentary / other（other表示非电影非纪录片的内容）
 * - genre: 类型
 * - region: 地区
 * - language: 语言
 * - yearMin / yearMax: 年份范围
 * - firstLetter: 首字母
 * - sort: 排序方式（rating / year / title / heat）
 * - page: 页码（从1开始）
 * - limit: 每页数量
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // 获取筛选参数
    const type = searchParams.get("type") || "movie";
    const genre = searchParams.get("genre");
    const region = searchParams.get("region");
    const language = searchParams.get("language");
    const yearMin = searchParams.get("yearMin");
    const yearMax = searchParams.get("yearMax");
    const firstLetter = searchParams.get("firstLetter");
    const sort = searchParams.get("sort") || "rating";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    // 计算分页偏移量
    const offset = (page - 1) * limit;

    // 构建查询
    let query = supabase
      .from("movies")
      .select("id, title, poster_url, rating, year, genre, type, region, language, heat")
      .eq("is_published", true);

    // "other"类型需要排除电影和纪录片，其他类型直接等值匹配
    if (type === "other") {
      // 排除电影和纪录片，显示动漫、连续剧、综艺、儿童等内容
      query = query.not("type", "in", "(movie,documentary)");
    } else {
      query = query.eq("type", type);
    }

    // 应用筛选条件
    if (genre) {
      // genre 是数组类型，使用 contains 操作符匹配
      query = query.contains("genre", [genre]);
    }

    if (region) {
      // region 可能是字符串或数组，使用 ilike 兼容
      query = query.ilike("region", `%${region}%`);
    }

    if (language) {
      // language 可能是字符串或数组，使用 ilike 兼容
      query = query.ilike("language", `%${language}%`);
    }

    if (yearMin) {
      query = query.gte("year", parseInt(yearMin, 10));
    }

    if (yearMax) {
      query = query.lte("year", parseInt(yearMax, 10));
    }

    if (firstLetter) {
      if (firstLetter === "#") {
        // 数字开头
        query = query.or("title.like.0%,title.like.1%,title.like.2%,title.like.3%,title.like.4%,title.like.5%,title.like.6%,title.like.7%,title.like.8%,title.like.9%");
      } else {
        query = query.ilike("title", `${firstLetter}%`);
      }
    }

    // 应用排序
    switch (sort) {
      case "year":
        query = query.order("year", { ascending: false });
        break;
      case "title":
        query = query.order("title", { ascending: true });
        break;
      case "heat":
        query = query.order("heat", { ascending: false });
        break;
      case "rating":
      default:
        query = query.order("rating", { ascending: false });
        break;
    }

    // 分页：限制数量并设置偏移量
    query = query.range(offset, offset + limit - 1);

    // 执行查询
    const { data: movies, error } = await query;

    if (error) {
      console.error("查询电影列表失败:", error);
      return NextResponse.json(
        { error: "查询失败", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ movies: movies || [] });
  } catch (error) {
    console.error("获取电影列表失败:", error);
    return NextResponse.json(
      { error: "获取电影列表失败" },
      { status: 500 }
    );
  }
}
