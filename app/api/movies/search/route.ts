/**
 * 电影搜索API
 *
 * 支持：
 * - 本地数据库搜索
 * - 外部CMS视频源搜索
 * - 限制返回数量
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// CMS视频源配置
const CMS_SOURCES = [
  { name: "暴风影视", api: "https://bfzyapi.com/api.php/provide/vod/" },
  { name: "量子资源", api: "https://cj.lziapi.com/api.php/provide/vod/" },
  { name: "非凡资源", api: "https://cj.ffzyapi.com/api.php/provide/vod/" },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 获取搜索参数
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    if (!query.trim()) {
      return NextResponse.json({ movies: [] });
    }

    // 1. 搜索本地数据库
    const supabase = await createClient();
    const { data: localMovies } = await supabase
      .from("movies")
      .select("id, title, poster_url, rating, year, genre, type")
      .eq("is_published", true)
      .ilike("title", `%${query}%`)
      .order("rating", { ascending: false })
      .limit(limit);

    // 2. 如果本地结果不足，搜索外部CMS
    let externalResults: any[] = [];
    if (!localMovies || localMovies.length < limit) {
      try {
        // 尝试第一个CMS源
        const cmsUrl = `${CMS_SOURCES[0].api}?ac=detail&wd=${encodeURIComponent(query)}`;
        const response = await fetch(cmsUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(5000),
        });
        const cmsData = await response.json();

        if (cmsData.list) {
          externalResults = cmsData.list.slice(0, limit).map((item: any) => ({
            id: `cms_${item.vod_id}`,
            title: item.vod_name,
            poster_url: item.vod_pic || "",
            rating: 0,
            year: parseInt(item.vod_year) || 0,
            genre: item.vod_class || "",
            type: "movie",
            source: "cms",
          }));
        }
      } catch (e) {
        console.error("CMS搜索失败:", e);
      }
    }

    // 3. 合并结果（本地优先）
    const allMovies = [
      ...(localMovies || []),
      ...externalResults.filter(
        (ext) => !(localMovies || []).some((local) => local.title === ext.title)
      ),
    ].slice(0, limit);

    return NextResponse.json({ movies: allMovies });
  } catch (error) {
    console.error("搜索失败:", error);
    return NextResponse.json(
      { error: "搜索失败" },
      { status: 500 }
    );
  }
}
