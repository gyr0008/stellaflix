// 获取视频源详情 API
// 根据视频源和视频 ID 获取详细信息（包括剧集列表）

import { NextRequest, NextResponse } from "next/server";
import { createParser } from "@/lib/video-sources/parser-factory";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/video-sources/detail?source=source_code&id=video_id
 * 获取视频详情（包括剧集列表）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceCode = searchParams.get("source");
    const videoId = searchParams.get("id");

    // 参数验证
    if (!sourceCode) {
      return NextResponse.json(
        { error: "视频源代码不能为空" },
        { status: 400 }
      );
    }

    if (!videoId) {
      return NextResponse.json(
        { error: "视频 ID 不能为空" },
        { status: 400 }
      );
    }

    console.log(`[Detail] 获取视频详情: 源=${sourceCode}, ID=${videoId}`);

    // 从数据库获取视频源配置
    const supabase = await createClient();
    const { data: config, error: configError } = await supabase
      .from("video_source_configs")
      .select("*")
      .eq("code", sourceCode)
      .eq("enabled", true)
      .single();

    if (configError || !config) {
      console.error("[Detail] 视频源配置不存在或已禁用:", configError);
      return NextResponse.json(
        { error: "视频源不存在或已禁用" },
        { status: 404 }
      );
    }

    // 创建解析器并获取详情
    const parser = createParser(config);
    const detail = await parser.getDetail(videoId);

    console.log(`[Detail] 获取成功: ${detail.title}, ${detail.episodes?.length || 0} 集`);

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    console.error("[Detail] 获取视频详情失败:", error);
    return NextResponse.json(
      {
        error: "获取视频详情失败",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}
