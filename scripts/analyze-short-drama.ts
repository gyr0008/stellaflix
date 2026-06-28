/**
 * 分析微短剧并创建删除脚本
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// 微短剧标题关键词（更精确的匹配）
const SHORT_DRAMA_TITLE_PATTERNS = [
  // 女频短剧
  /无赖/, /女帝/, /牛马/, /霸总/, /总裁.*妻/, /豪门.*千金/,
  /替嫁/, /契约.*婚姻/, /离婚.*逆袭/, /重生.*复仇/,
  // 男频短剧
  /下山.*高手/, /退婚.*逆袭/, /赘婿.*逆袭/, /龙王/,
  // 通用短剧特征
  /短剧/, /微短剧/, /竖屏剧/,
];

// 短剧常见类型关键词
const SHORT_DRAMA_GENRE_KEYWORDS = ["短剧", "微短剧", "竖屏"];

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 获取所有数据
  const { data: allMovies, error } = await supabase
    .from("movies")
    .select("id, title, type, duration, genre")
    .limit(10000);

  if (error) {
    console.error("查询错误:", error);
    return;
  }

  console.log(`\n📊 总记录数: ${allMovies?.length || 0}\n`);

  // 1. 检查duration字段的分布
  const withDuration = allMovies?.filter(m => m.duration && m.duration > 0) || [];
  const withoutDuration = allMovies?.filter(m => !m.duration || m.duration === 0) || [];

  console.log(`⏱️  有duration的: ${withDuration.length} 条`);
  console.log(`⏱️  无duration的: ${withoutDuration.length} 条`);

  if (withDuration.length > 0) {
    const durations = withDuration.map(m => m.duration);
    const minDur = Math.min(...durations);
    const maxDur = Math.max(...durations);
    const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length;
    console.log(`   时长范围: ${minDur} - ${maxDur} 秒`);
    console.log(`   平均时长: ${avgDur.toFixed(0)} 秒`);

    // 统计不同时长区间的数量
    const short = withDuration.filter(m => m.duration <= 300); // 5分钟以内
    const medium = withDuration.filter(m => m.duration > 300 && m.duration <= 3600); // 5-60分钟
    const long = withDuration.filter(m => m.duration > 3600); // 60分钟以上

    console.log(`   5分钟以内: ${short.length} 条`);
    console.log(`   5-60分钟: ${medium.length} 条`);
    console.log(`   60分钟以上: ${long.length} 条`);

    // 列出5分钟以内的视频
    if (short.length > 0) {
      console.log(`\n🎬 5分钟以内的视频 (${short.length}条):`);
      short.slice(0, 20).forEach(m => {
        console.log(`   - ${m.title} (${m.duration}秒, ${m.type})`);
      });
    }
  }

  // 2. 检查标题匹配的
  const titleMatches = allMovies?.filter(m =>
    SHORT_DRAMA_TITLE_PATTERNS.some(kw => kw.test(m.title))
  ) || [];

  console.log(`\n📝 标题匹配短剧关键词的: ${titleMatches.length} 条`);
  if (titleMatches.length > 0) {
    titleMatches.forEach(m => {
      console.log(`   - ${m.title} (${m.type})`);
    });
  }

  // 3. 检查genre包含短剧的
  const genreMatches = allMovies?.filter(m =>
    m.genre && m.genre.some((g: string) => SHORT_DRAMA_GENRE_KEYWORDS.includes(g))
  ) || [];

  console.log(`\n🏷️  类型包含短剧的: ${genreMatches.length} 条`);
  if (genreMatches.length > 0) {
    genreMatches.slice(0, 10).forEach(m => {
      console.log(`   - ${m.title} (${m.genre.join(", ")})`);
    });
  }
}

main().catch(console.error);
