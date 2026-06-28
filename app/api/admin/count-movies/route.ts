/**
 * 统计视频数量的API
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // 统计所有视频数量
    const { count: total, error } = await supabase
      .from('movies')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({ error: error.message });
    }

    // 按类型统计
    const { data: byType } = await supabase
      .from('movies')
      .select('type')
      .limit(10000);

    const typeStats: Record<string, number> = {};
    (byType || []).forEach(item => {
      typeStats[item.type] = (typeStats[item.type] || 0) + 1;
    });

    return NextResponse.json({
      total: total || 0,
      byType: typeStats,
    });

  } catch (error) {
    return NextResponse.json({ error: String(error) });
  }
}
