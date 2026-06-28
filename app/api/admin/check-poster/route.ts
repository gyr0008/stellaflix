/**
 * 检查封面图片的API
 * 用于调试无封面问题
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // 获取所有视频的封面信息
    const { data, error } = await supabase
      .from('movies')
      .select('id, title, poster_url')
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message });
    }

    // 分析封面情况
    const analysis = {
      total: data?.length || 0,
      empty: [] as any[],        // poster_url 为空
      invalid: [] as any[],      // poster_url 无效（不是http开头）
      valid: [] as any[],        // poster_url 有效
      suspicious: [] as any[],   // poster_url 看起来可疑（比如很短、或者包含null等）
    };

    for (const movie of data || []) {
      const url = movie.poster_url;

      if (!url || url.trim() === '' || url === 'null' || url === 'undefined') {
        analysis.empty.push({ title: movie.title, poster_url: url });
      } else if (!url.startsWith('http')) {
        analysis.invalid.push({ title: movie.title, poster_url: url });
      } else if (url.length < 20 || url.includes('null') || url.includes('undefined')) {
        analysis.suspicious.push({ title: movie.title, poster_url: url });
      } else {
        analysis.valid.push({ title: movie.title, poster_url: url });
      }
    }

    return NextResponse.json({
      summary: {
        total: analysis.total,
        empty: analysis.empty.length,
        invalid: analysis.invalid.length,
        suspicious: analysis.suspicious.length,
        valid: analysis.valid.length,
      },
      samples: {
        empty: analysis.empty.slice(0, 5),
        invalid: analysis.invalid.slice(0, 5),
        suspicious: analysis.suspicious.slice(0, 5),
        valid: analysis.valid.slice(0, 3),
      },
    });

  } catch (error) {
    return NextResponse.json({ error: String(error) });
  }
}
