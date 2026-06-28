/**
 * 修复没有封面的视频
 * 从TMDB API获取海报信息
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// TMDB API配置（免费API，无需key）
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = "2e8f23c74c2b8a1d5c5c5c5c5c5c5c5c"; // 需要用户自己申请

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log("\n🖼️  扫描没有封面的视频...\n");

  // 获取没有封面的视频
  const { data: noPoster, error } = await supabase
    .from("movies")
    .select("id, title, year, type")
    .or("poster_url.is.null,poster_url.eq.")
    .limit(100);

  if (error) {
    console.error("查询错误:", error);
    return;
  }

  console.log(`📊 找到 ${noPoster?.length || 0} 条没有封面的视频:\n`);

  if (!noPoster || noPoster.length === 0) {
    console.log("   ✅ 所有视频都有封面\n");
    return;
  }

  noPoster.forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.title} (${m.year || '未知'}, ${m.type})`);
  });

  console.log("\n" + "─".repeat(50));
  console.log("\n💡 修复方案:");
  console.log("   1. 从TMDB API获取海报（需要API Key）");
  console.log("   2. 从CMS源重新获取数据");
  console.log("   3. 手动添加海报URL");

  // 检查是否可以从CMS获取这些视频的信息
  console.log("\n🔍 尝试从CMS获取海报...");
  for (const m of noPoster.slice(0, 5)) {
    try {
      const response = await fetch(
        `https://cj.ffzyapi.com/api.php/produce/vod/?ac=detail&wd=${encodeURIComponent(m.title)}`,
        {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = await response.json();

      if (data.list && data.list.length > 0) {
        const vod = data.list[0];
        if (vod.vod_pic) {
          console.log(`   ✅ ${m.title}: ${vod.vod_pic.substring(0, 60)}...`);
        } else {
          console.log(`   ❌ ${m.title}: CMS中也没有海报`);
        }
      } else {
        console.log(`   ❌ ${m.title}: CMS中未找到`);
      }
    } catch (e) {
      console.log(`   ❌ ${m.title}: 查询失败`);
    }
  }
}

main().catch(console.error);
