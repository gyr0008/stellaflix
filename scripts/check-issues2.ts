/**
 * 深入检查问题数据
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 获取所有数据
  const { data: allMovies } = await supabase
    .from("movies")
    .select("id, title, type, poster_url, year, genre")
    .limit(10000);

  if (!allMovies) {
    console.log("无法获取数据");
    return;
  }

  console.log(`\n📊 总记录数: ${allMovies.length}\n`);

  // 1. 检查标题中包含分集信息的（可能是剧集）
  const episodeKeywords = [
    /第[\d一二三四五六七八九十百千]+[集部季]/,
    /S\d+/i, /EP?\d+/i,
    /全[\d]+集/,
    /[\d]+集全/,
    /完结/,
    /连载/,
    /更新至[\d]+集/,
  ];

  const withEpisodes = allMovies.filter(m =>
    episodeKeywords.some(kw => kw.test(m.title))
  );

  console.log(`🎬 标题包含集数信息的: ${withEpisodes.length} 条`);
  console.log("   示例:");
  withEpisodes.slice(0, 15).forEach(m => {
    console.log(`   - ${m.title} (${m.type})`);
  });

  // 2. 检查没有封面的视频详情
  const noPoster = allMovies.filter(m => !m.poster_url || m.poster_url === "");
  console.log(`\n🖼️  没有封面的视频: ${noPoster.length} 条`);
  noPoster.forEach(m => {
    console.log(`   - ${m.title} (${m.type})`);
  });

  // 3. 检查可能的短剧（标题中包含"剧"、"系列"等）
  const dramaKeywords = [
    /短剧/, /微剧/, /网剧/,
    /系列/, /篇$/, /篇$/,
  ];

  const possibleDramas = allMovies.filter(m =>
    dramaKeywords.some(kw => kw.test(m.title))
  );

  console.log(`\n🎭 可能的剧集内容: ${possibleDramas.length} 条`);
  possibleDramas.slice(0, 10).forEach(m => {
    console.log(`   - ${m.title} (${m.type})`);
  });

  // 4. 按类型分组显示
  console.log("\n📊 各类型标题示例:");
  const byType: Record<string, any[]> = {};
  allMovies.forEach(m => {
    if (!byType[m.type]) byType[m.type] = [];
    byType[m.type].push(m);
  });

  Object.entries(byType).forEach(([type, movies]) => {
    console.log(`\n   ${type} (${movies.length}条):`);
    movies.slice(0, 3).forEach(m => {
      console.log(`   - ${m.title}`);
    });
  });
}

main().catch(console.error);
