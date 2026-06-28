/**
 * 检查不需要的内容类型
 * 韩国剧、日本剧、电影解说等
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// 不需要的内容特征
const UNWANTED_PATTERNS = {
  // 电影解说
  movieCommentary: /电影解说|影片解说|解说版|【解说】|解说：/,
  // 韩国剧（非电影）
  koreanDrama: /韩国剧|韩剧|韩剧更新/,
  // 日本剧
  japaneseDrama: /日本剧|日剧/,
  // 短剧（已处理）
  shortDrama: /短剧|微短剧|竖屏剧/,
};

// 不需要的地区
const UNWANTED_REGIONS = ["韩国", "日本"];

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log("\n🔍 扫描不需要的内容...\n");

  // 获取所有数据
  const { data: allMovies, error } = await supabase
    .from("movies")
    .select("id, title, type, region, genre, year")
    .limit(10000);

  if (error) {
    console.error("查询错误:", error);
    return;
  }

  console.log(`📊 总记录数: ${allMovies?.length || 0}\n`);

  // 检查各类不需要的内容
  const results: { [key: string]: any[] } = {
    movieCommentary: [],
    koreanDrama: [],
    japaneseDrama: [],
    koreanRegion: [],
    japaneseRegion: [],
  };

  allMovies?.forEach(m => {
    // 电影解说
    if (UNWANTED_PATTERNS.movieCommentary.test(m.title)) {
      results.movieCommentary.push(m);
    }

    // 韩国剧（标题）
    if (UNWANTED_PATTERNS.koreanDrama.test(m.title)) {
      results.koreanDrama.push(m);
    }

    // 日本剧（标题）
    if (UNWANTED_PATTERNS.japaneseDrama.test(m.title)) {
      results.japaneseDrama.push(m);
    }

    // 韩国地区
    if (m.region === "韩国") {
      results.koreanRegion.push(m);
    }

    // 日本地区
    if (m.region === "日本") {
      results.japaneseRegion.push(m);
    }
  });

  // 输出结果
  console.log("📋 电影解说:", results.movieCommentary.length, "条");
  results.movieCommentary.slice(0, 5).forEach(m => {
    console.log(`   - ${m.title}`);
  });

  console.log("\n📋 韩国剧（标题）:", results.koreanDrama.length, "条");
  results.koreanDrama.slice(0, 5).forEach(m => {
    console.log(`   - ${m.title}`);
  });

  console.log("\n📋 日本剧（标题）:", results.japaneseDrama.length, "条");
  results.japaneseDrama.slice(0, 5).forEach(m => {
    console.log(`   - ${m.title}`);
  });

  console.log("\n📋 韩国地区:", results.koreanRegion.length, "条");
  results.koreanRegion.slice(0, 10).forEach(m => {
    console.log(`   - ${m.title} (${m.year}, ${m.type})`);
  });

  console.log("\n📋 日本地区:", results.japaneseRegion.length, "条");
  results.japaneseRegion.slice(0, 10).forEach(m => {
    console.log(`   - ${m.title} (${m.year}, ${m.type})`);
  });

  // 统计需要删除的总数
  const toDelete = new Set<string>();
  Object.values(results).forEach(items => {
    items.forEach(m => toDelete.add(m.id));
  });

  console.log("\n" + "─".repeat(50));
  console.log(`\n🗑️  需要删除的总数: ${toDelete.size} 条`);
}

main().catch(console.error);
