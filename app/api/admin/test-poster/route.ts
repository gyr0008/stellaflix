/**
 * 测试封面图片是否可访问的API
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function testImageUrl(url: string): Promise<{ status: number; ok: boolean }> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, ok: response.ok };
  } catch (error) {
    return { status: 0, ok: false };
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // 获取一些视频的封面
    const { data, error } = await supabase
      .from('movies')
      .select('id, title, poster_url')
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message });
    }

    // 测试每个图片URL
    const results = [];
    let brokenCount = 0;

    for (const movie of data || []) {
      const testResult = await testImageUrl(movie.poster_url);
      const isBroken = !testResult.ok;

      if (isBroken) brokenCount++;

      results.push({
        title: movie.title,
        poster_url: movie.poster_url,
        status: testResult.status,
        accessible: testResult.ok,
      });
    }

    return NextResponse.json({
      total: results.length,
      broken: brokenCount,
      accessible: results.length - brokenCount,
      details: results,
    });

  } catch (error) {
    return NextResponse.json({ error: String(error) });
  }
}
