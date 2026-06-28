/**
 * 保存单部电影到数据库
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 将 genre 字段转换为数组格式
 * CMS 返回的是字符串（如 "喜剧,动作,韩剧"），数据库期望数组
 */
function normalizeGenre(genre: any): string[] {
  if (Array.isArray(genre)) {
    return genre;
  }
  if (typeof genre === 'string' && genre.trim()) {
    return genre.split(',').map(g => g.trim()).filter(Boolean);
  }
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const movie = await request.json();

    // 检查是否已存在（通过标题去重）
    const { data: existing } = await supabase
      .from('movies')
      .select('id')
      .eq('title', movie.title)
      .limit(1);

    if (existing && existing.length > 0) {
      // 已存在，跳过
      return NextResponse.json({ success: true, action: 'skipped' });
    }

    // 插入新数据
    const { data, error } = await supabase
      .from('movies')
      .insert({
        title: movie.title,
        poster_url: movie.poster_url,
        rating: movie.rating || 0,
        year: movie.year,
        genre: normalizeGenre(movie.genre),
        type: movie.type,
        region: movie.region,
        language: movie.language,
        description: movie.description,
        heat: movie.heat || 0,
        is_published: true,
      })
      .select();

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, action: 'inserted', data });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    });
  }
}
