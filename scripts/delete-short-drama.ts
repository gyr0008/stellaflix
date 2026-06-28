/**
 * 删除数据库中的短剧
 *
 * 使用方法：
 * npx tsx scripts/delete-short-drama.ts          # 预览要删除的内容
 * npx tsx scripts/delete-short-drama.ts --delete  # 实际删除
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// 短剧标题关键词
const SHORT_DRAMA_TITLE_KEYWORDS = [
  // 女频短剧
  /无赖/, /女帝/, /牛马/, /霸总/, /总裁.*妻/, /豪门.*千金/,
  /替嫁/, /契约.*婚姻/, /离婚.*逆袭/, /重生.*复仇/,
  /逆袭/, /废柴/, /下山/,
  // 男频短剧
  /下山.*高手/, /退婚.*逆袭/, /赘婿.*逆袭/, /龙王/,
  // 通用短剧特征
  /短剧/, /微短剧/, /竖屏剧/,
];

function isShortDrama(title: string): boolean {
  return SHORT_DRAMA_TITLE_KEYWORDS.some(kw => kw.test(title));
}

async function main() {
  const args = process.argv.slice(2);
  const shouldDelete = args.includes("--delete");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log("\n🔍 扫描短剧内容...\n");

  // 获取所有数据
  const { data: allMovies, error } = await supabase
    .from("movies")
    .select("id, title, type, year")
    .limit(10000);

  if (error) {
    console.error("查询错误:", error);
    return;
  }

  console.log(`📊 总记录数: ${allMovies?.length || 0}\n`);

  // 找出短剧
  const shortDramas = allMovies?.filter(m => {
    // 标题匹配短剧关键词
    if (isShortDrama(m.title)) return true;
    // 没有封面的视频（大概率是短剧）
    return false;
  }) || [];

  // 获取没有封面的视频
  const { data: noPoster } = await supabase
    .from("movies")
    .select("id, title, type, year")
    .or("poster_url.is.null,poster_url.eq.")
    .limit(100);

  // 合并没有封面的视频到删除列表
  const allToDelete: { id: any; title: any; type: any; year: any }[] = [...shortDramas];
  const addedIds = new Set(shortDramas.map(m => m.id));

  noPoster?.forEach(m => {
    if (!addedIds.has(m.id)) {
      allToDelete.push({ id: m.id, title: m.title, type: m.type || null, year: m.year });
      addedIds.add(m.id);
    }
  });

  console.log(`🎬 找到 ${allToDelete.length} 条需要删除的内容:\n`);
  console.log(`   - 标题匹配短剧关键词: ${shortDramas.length} 条`);
  console.log(`   - 没有封面的视频: ${noPoster?.length || 0} 条\n`);

  if (allToDelete.length === 0) {
    console.log("   ✅ 没有发现需要删除的内容\n");
    return;
  }

  // 列出所有需要删除的内容
  allToDelete.slice(0, 30).forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.title} (${m.year || '未知'})`);
  });

  if (allToDelete.length > 30) {
    console.log(`   ... 还有 ${allToDelete.length - 30} 条`);
  }

  console.log("\n" + "─".repeat(50));

  if (shouldDelete) {
    console.log("\n⚠️  开始删除...\n");

    let deleted = 0;
    let failed = 0;

    for (const m of allToDelete) {
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
    console.log("   npx tsx scripts/delete-short-drama.ts --delete\n");
  }
}

main().catch(console.error);
