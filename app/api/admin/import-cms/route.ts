/**
 * 批量导入CMS电影API
 *
 * 从CMS视频源抓取电影数据并保存到数据库
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// CMS视频源配置
const CMS_SOURCES = [
  { name: "暴风影视", api: "https://bfzyapi.com/api.php/provide/vod/" },
  { name: "量子资源", api: "https://cj.lziapi.com/api.php/provide/vod/" },
  { name: "非凡资源", api: "https://cj.ffzyapi.com/api.php/provide/vod/" },
];

// 电影类型映射
const GENRE_MAP: { [key: string]: string } = {
  "剧情": "剧情",
  "喜剧": "喜剧",
  "动作": "动作",
  "爱情": "爱情",
  "科幻": "科幻",
  "动画": "动画",
  "悬疑": "悬疑",
  "惊悚": "惊悚",
  "恐怖": "恐怖",
  "犯罪": "犯罪",
  "纪录片": "纪录片",
  "战争": "战争",
  "奇幻": "奇幻",
  "冒险": "冒险",
  "传记": "传记",
  "历史": "历史",
  "音乐": "音乐",
  "家庭": "家庭",
  "儿童": "儿童",
  "武侠": "武侠",
  "古装": "古装",
};

export async function POST(request: NextRequest) {
  return GET(request);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const type = searchParams.get("type") || "movie"; // movie / documentary

    const supabase = await createClient();

    // 从CMS获取电影列表
    const source = CMS_SOURCES[2]; // 使用非凡资源
    const response = await fetch(
      `${source.api}?ac=detail&pg=${page}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await response.json();

    if (!data.list || data.list.length === 0) {
      return NextResponse.json({ error: "没有获取到数据" }, { status: 404 });
    }

    // 处理电影数据
    const movies = data.list.map((vod: any) => {
      // 解析播放地址
      let playUrl = "";
      if (vod.vod_play_url) {
        const urls = vod.vod_play_url.split("$$$");
        if (urls.length > 0) {
          const firstUrl = urls[0];
          const urlParts = firstUrl.split("$");
          if (urlParts.length > 1) {
            playUrl = urlParts[1];
          }
        }
      }

      // 处理类型
      const genres = vod.vod_class
        ? vod.vod_class.split(",").slice(0, 3).map((g: string) => GENRE_MAP[g] || g)
        : [];

      return {
        title: vod.vod_name || "未知",
        poster_url: vod.vod_pic || "",
        backdrop_url: vod.vod_pic || "",
        rating: 0,
        rating_count: 0,
        year: parseInt(vod.vod_year) || new Date().getFullYear(),
        genre: genres,
        description: vod.vod_content || vod.vod_blurb || "",
        type: type,
        region: vod.vod_area || "",
        language: vod.vod_lang || "",
        director: vod.vod_director || "",
        cast_members: vod.vod_actor ? vod.vod_actor.split(",").slice(0, 5) : [],
        is_published: true,
        heat: Math.floor(Math.random() * 100) + 50,
      };
    });

    // 保存到数据库
    let imported = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const movie of movies) {
      // 检查是否已存在
      const { data: existing } = await supabase
        .from("movies")
        .select("id")
        .eq("title", movie.title)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("movies").insert(movie);
      if (error) {
        errors.push(`${movie.title}: ${error.message}`);
      } else {
        imported++;
      }
    }

    return NextResponse.json({
      success: true,
      source: source.name,
      total: data.list.length,
      imported,
      skipped,
      errors: errors.slice(0, 5),
      page,
    });
  } catch (error) {
    console.error("导入失败:", error);
    return NextResponse.json(
      { error: "导入失败", details: (error as Error).message },
      { status: 500 }
    );
  }
}
