/**
 * 检查微短剧/网络短剧
 * 这类视频特征：
 * 1. 时长很短（1-5分钟）
 * 2. 标题通常有特定风格
 * 3. 可能在CMS中有特定类型标记
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// 微短剧标题关键词
const SHORT_DRAMA_TITLE_KEYWORDS = [
  // 夸张的标题风格
  /无赖/, /女帝/, /牛马/, /重生/, /穿越/, /逆袭/,
  /霸总/, /总裁/, /豪门/, /千金/, /乞丐/, /下山/,
  /退婚/, /离婚/, /闪婚/, /替嫁/, /契约/,
  // 剧集相关
  /短剧/, /微短剧/, /竖屏剧/,
];

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 获取所有数据（包括可能没有的duration字段）
  const { data: allMovies, error } = await supabase
    .from("movies")
    .select("id, title, type, poster_url, year, genre, description")
    .limit(10000);

  if (error) {
    console.error("查询错误:", error);
    return;
  }

  console.log(`\n📊 总记录数: ${allMovies?.length || 0}\n`);

  // 检查是否有duration字段
  const { data: sampleWithDuration } = await supabase
    .from("movies")
    .select("*")
    .limit(1);

  console.log("📋 表字段:", Object.keys(sampleWithDuration?.[0] || {}).join(", "));

  // 检查标题匹配的
  const titleMatches = allMovies?.filter(m =>
    SHORT_DRAMA_TITLE_KEYWORDS.some(kw => kw.test(m.title))
  ) || [];

  console.log(`\n🎬 标题匹配微短剧关键词的: ${titleMatches.length} 条`);
  if (titleMatches.length > 0) {
    console.log("   示例:");
    titleMatches.slice(0, 20).forEach(m => {
      console.log(`   - ${m.title} (${m.type})`);
    });
  }

  // 从CMS API检查一下短剧的特征
  console.log("\n🔍 从CMS API检查短剧特征...");
  try {
    const response = await fetch("https://cj.ffzyapi.com/api.php/provide/vod/?ac=detail&pg=1", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();

    if (data.list && data.list.length > 0) {
      console.log("   CMS数据字段:", Object.keys(data.list[0]).join(", "));
      // 检查是否有短剧类型
      const shortDramas = data.list.filter((v: any) =>
        v.vod_class?.includes("短剧") || v.vod_class?.includes("微剧")
      );
      console.log(`   第1页中短剧类型: ${shortDramas.length} 条`);
    }
  } catch (e) {
    console.log("   无法访问CMS API");
  }
}

main().catch(console.error);
