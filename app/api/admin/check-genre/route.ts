/**
 * 检查 genre 字段格式的API
 * 用于调试筛选问题
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // 获取几条数据来检查 genre 字段格式
    const { data, error } = await supabase
      .from('movies')
      .select('id, title, genre')
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message });
    }

    // 分析 genre 字段类型
    const analysis = data?.map(movie => ({
      title: movie.title,
      genre: movie.genre,
      genreType: typeof movie.genre,
      isArray: Array.isArray(movie.genre),
    }));

    return NextResponse.json({
      total: data?.length || 0,
      samples: analysis,
    });

  } catch (error) {
    return NextResponse.json({ error: String(error) });
  }
}
