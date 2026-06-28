import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// CMS视频源配置
const CMS_API = "https://bfzyapi.com/api.php/provide/vod/";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 如果是CMS电影ID（格式：cms_xxx）
  if (id.startsWith("cms_")) {
    const cmsId = id.replace("cms_", "");
    try {
      const response = await fetch(
        `${CMS_API}?ac=detail&ids=${cmsId}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(5000),
        }
      );
      const data = await response.json();

      if (data.list && data.list.length > 0) {
        const vod = data.list[0];
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

        return NextResponse.json({
          id: id,
          title: vod.vod_name || "未知",
          poster_url: vod.vod_pic || "",
          backdrop_url: vod.vod_pic || "",
          rating: 0,
          rating_count: 0,
          year: parseInt(vod.vod_year) || 0,
          genre: vod.vod_class ? vod.vod_class.split(",") : [],
          description: vod.vod_content || vod.vod_blurb || "",
          type: "movie",
          country: vod.vod_area || "",
          director: vod.vod_director || "",
          cast_members: vod.vod_actor ? vod.vod_actor.split(",").slice(0, 5) : [],
          playUrl: playUrl,
          source: "cms",
        });
      }
    } catch (e) {
      console.error("获取CMS电影失败:", e);
    }

    return NextResponse.json({ error: "Movie not found" }, { status: 404 });
  }

  // 本地数据库查询
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("movies")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Movie not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
