/**
 * 检查数据库中的问题数据
 * 1. 短剧数量
 * 2. 没有封面的视频数量
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// 短剧关键词
const SHORT_DRAMA_KEYWORDS = [
  /短剧/i, /微短剧/i, /短片/i,
  /第[\d一二三四五六七八九十]+集/, /全[\d]+集/,
  /上集/, /下集/, /大结局/,
];

function isShortDrama(title: string): boolean {
  return SHORT_DRAMA_KEYWORDS.some(kw => kw.test(title));
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. 统计所有视频
  const { count: totalCount } = await supabase
    .from("movies")
    .select("*", { count: "exact", head: true });

  console.log(`\n📊 数据库总记录数: ${totalCount}\n`);

  // 2. 按类型统计
  const { data: typeStats } = await supabase
    .from("movies")
    .select("type")
    .limit(10000);

  const typeCount: Record<string, number> = {};
  typeStats?.forEach((m: any) => {
    typeCount[m.type] = (typeCount[m.type] || 0) + 1;
  });
  console.log("📈 类型分布:");
  Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  // 3. 检查没有封面的视频
  const { data: noPoster } = await supabase
    .from("movies")
    .select("id, title, poster_url, type")
    .or("poster_url.is.null,poster_url.eq.")
    .limit(100);

  console.log(`\n🖼️  没有封面的视频: ${noPoster?.length || 0} 条`);
  if (noPoster && noPoster.length > 0) {
    console.log("   示例:");
    noPoster.slice(0, 5).forEach((m: any) => {
      console.log(`   - ${m.title} (${m.type})`);
    });
  }

  // 4. 检查短剧
  const { data: allTitles } = await supabase
    .from("movies")
    .select("id, title, type")
    .limit(10000);

  const shortDramas = allTitles?.filter((m: any) => isShortDrama(m.title)) || [];
  console.log(`\n🎬 疑似短剧: ${shortDramas.length} 条`);
  if (shortDramas.length > 0) {
    console.log("   示例:");
    shortDramas.slice(0, 10).forEach((m: any) => {
      console.log(`   - ${m.title} (${m.type})`);
    });
  }

  // 5. 检查海报URL格式（可能有些是无效的）
  const { data: sampleData } = await supabase
    .from("movies")
    .select("title, poster_url")
    .limit(20);

  console.log("\n📋 海报URL示例:");
  sampleData?.slice(0, 5).forEach((m: any) => {
    console.log(`   ${m.title}: ${m.poster_url?.substring(0, 60)}...`);
  });
}

main().catch(console.error);
