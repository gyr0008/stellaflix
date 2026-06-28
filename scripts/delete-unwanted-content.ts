/**
 * 删除不需要的内容
 * 韩国剧、日本剧、电影解说等
 *
 * 使用方法：
 * npx tsx scripts/delete-unwanted-content.ts          # 预览
 * npx tsx scripts/delete-unwanted-content.ts --delete  # 执行删除
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// 不需要的内容特征
const UNWANTED_TITLE_PATTERNS = [
  /电影解说|影片解说|解说版|【解说】|解说：/,
  /韩国剧|韩剧/,
  /日本剧|日剧/,
  /短剧|微短剧|竖屏剧/,
];

// 不需要的地区
const UNWANTED_REGIONS = ["韩国", "日本"];

// 韩国经典高分电影（保留）- 豆瓣评分8.5以上
const KOREAN经典MOVIES = [
  "寄生虫", "燃烧", "釜山行", "熔炉", "辩护人", "素媛",
  "杀人回忆", "汉江怪物", "老男孩", "亲切的金子",
  "密阳", "诗", "薄荷糖", "春夏秋冬又一春",
];

function isUnwanted(m: any): boolean {
  // 电影解说
  if (UNWANTED_TITLE_PATTERNS[0].test(m.title)) return true;

  // 韩国剧/日剧（标题）
  if (UNWANTED_TITLE_PATTERNS[1].test(m.title) || UNWANTED_TITLE_PATTERNS[2].test(m.title)) return true;

  // 短剧
  if (UNWANTED_TITLE_PATTERNS[3].test(m.title)) return true;

  // 韩国/日本地区
  if (UNWANTED_REGIONS.includes(m.region)) {
    // 韩国电影保留经典高分
    if (m.region === "韩国" && m.type === "movie") {
      const isClassic = KOREAN经典MOVIES.some(name => m.title.includes(name));
      if (isClassic) return false; // 保留经典
    }
    return true; // 其他删除
  }

  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldDelete = args.includes("--delete");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log("\n🔍 扫描不需要的内容...\n");

  // 获取所有数据
  const { data: allMovies, error } = await supabase
    .from("movies")
    .select("id, title, type, region, year")
    .limit(10000);

  if (error) {
    console.error("查询错误:", error);
    return;
  }

  console.log(`📊 总记录数: ${allMovies?.length || 0}\n`);

  // 找出不需要的内容
  const toDelete = allMovies?.filter(m => isUnwanted(m)) || [];

  console.log(`🗑️  需要删除: ${toDelete.length} 条\n`);

  if (toDelete.length === 0) {
    console.log("   ✅ 没有需要删除的内容\n");
    return;
  }

  // 按地区分组显示
  const byRegion: { [key: string]: any[] } = {};
  toDelete.forEach(m => {
    const region = m.region || "未知";
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(m);
  });

  Object.entries(byRegion).forEach(([region, items]) => {
    console.log(`   ${region}: ${items.length} 条`);
    items.slice(0, 5).forEach(m => {
      console.log(`      - ${m.title} (${m.year}, ${m.type})`);
    });
    if (items.length > 5) {
      console.log(`      ... 还有 ${items.length - 5} 条`);
    }
  });

  console.log("\n" + "─".repeat(50));

  if (shouldDelete) {
    console.log("\n⚠️  开始删除...\n");

    let deleted = 0;
    let failed = 0;

    for (const m of toDelete) {
      const { error } = await supabase
        .from("movies")
        .delete()
        .eq("id", m.id);

      if (error) {
        console.log(`   ❌ 删除失败: ${m.title} - ${error.message}`);
        failed++;
      } else {
        console.log(`   ✅ 已删除: ${m.title}`);
        deleted++;
      }
    }

    console.log(`\n📊 删除完成: ${deleted} 成功, ${failed} 失败\n`);
  } else {
    console.log("\n📋 预览模式 - 如需实际删除，请运行:");
    console.log("   npx tsx scripts/delete-unwanted-content.ts --delete\n");
  }
}

main().catch(console.error);
