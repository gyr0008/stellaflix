/**
 * 数据类型修复脚本
 *
 * 根据标题和genre自动修正内容类型：
 * - 动画剧集 → anime（标题包含"第X季"、"第X集"、"S01"等）
 * - 动画电影 → movie（标题包含"剧场版"、"电影版"等）
 * - 综艺/真人秀 → variety
 * - 儿童 → kids
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// 动画剧集关键词
const ANIME_SERIES_KEYWORDS = [
  /第[\d一二三四五六七八九十]+季/,
  /第[\d一二三四五六七八九十]+集/,
  /S\d+/i,
  /EP?\d+/i,
  /season\s*\d+/i,
  /episode/i,
  /篇$/,
  /篇[上中下]/,
  /特别篇/,
  /总集篇/,
  /第[\d]+话/,
];

// 动画电影关键词（保留为movie）
const ANIME_MOVIE_KEYWORDS = [
  /剧场版/,
  /电影版/,
  /大电影/,
  /XX/,
];

// 综艺/真人秀关键词
const VARIETY_KEYWORDS = [
  /综艺/,
  /真人秀/,
  /脱口秀/,
  /访谈/,
  /show/i,
  /秀$/,
];

// 儿童关键词
const KIDS_KEYWORDS = [
  /儿童/,
  /宝宝/,
  /小猪佩奇/,
  /汪汪队/,
  /超级飞侠/,
  /乐高/,
  /LEGO/i,
];

// 判断是否为动画剧集
function isAnimeSeries(title: string): boolean {
  return ANIME_SERIES_KEYWORDS.some(pattern => pattern.test(title));
}

// 判断是否为动画电影（应该保留为movie）
function isAnimeMovie(title: string, genre: string[]): boolean {
  // 如果标题包含电影相关关键词
  if (ANIME_MOVIE_KEYWORDS.some(pattern => pattern.test(title))) {
    return true;
  }
  // 如果genre只有"动画"且没有其他剧集相关标记
  return false;
}

// 判断是否为综艺
function isVariety(title: string, genre: string[]): boolean {
  const genreStr = genre.join(",");
  return (
    VARIETY_KEYWORDS.some(pattern => pattern.test(title)) ||
    VARIETY_KEYWORDS.some(pattern => pattern.test(genreStr))
  );
}

// 判断是否为儿童内容
function isKids(title: string, genre: string[]): boolean {
  const genreStr = genre.join(",");
  return (
    KIDS_KEYWORDS.some(pattern => pattern.test(title)) ||
    KIDS_KEYWORDS.some(pattern => pattern.test(genreStr)) ||
    genreStr.includes("儿童")
  );
}

// 主判断逻辑
function detectContentType(title: string, genre: string[], currentType: string): string {
  // 只处理当前类型为movie且genre包含动画的内容
  if (currentType === "movie" && genre.some(g => g.includes("动画"))) {
    // 如果是动画电影，保留为movie
    if (isAnimeMovie(title, genre)) {
      return "movie";
    }
    // 如果是动画剧集，改为anime
    if (isAnimeSeries(title)) {
      return "anime";
    }
    // 默认保留为movie（动画电影）
  }

  // 处理综艺/真人秀
  if (currentType === "movie" && isVariety(title, genre)) {
    return "variety";
  }

  // 处理儿童内容
  if (currentType === "movie" && isKids(title, genre)) {
    return "kids";
  }

  return currentType;
}

async function main() {
  console.log("\n🔧 开始修复数据类型...\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let offset = 0;
  const limit = 1000;
  let totalUpdated = 0;
  let totalChecked = 0;

  while (true) {
    // 获取数据
    const { data: movies, error } = await supabase
      .from("movies")
      .select("id, title, genre, type")
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("查询失败:", error);
      break;
    }

    if (!movies || movies.length === 0) {
      break;
    }

    // 检查每条数据
    for (const movie of movies) {
      totalChecked++;
      const newType = detectContentType(movie.title, movie.genre || [], movie.type);

      // 如果类型需要更新
      if (newType !== movie.type) {
        const { error: updateError } = await supabase
          .from("movies")
          .update({ type: newType })
          .eq("id", movie.id);

        if (updateError) {
          console.error(`更新失败 [${movie.title}]:`, updateError.message);
        } else {
          totalUpdated++;
          console.log(`✅ ${movie.title}: ${movie.type} → ${newType}`);
        }
      }
    }

    console.log(`📊 已检查 ${totalChecked} 条，已更新 ${totalUpdated} 条`);

    // 如果返回的数据少于limit，说明已经到底了
    if (movies.length < limit) {
      break;
    }

    offset += limit;
  }

  console.log(`\n✨ 修复完成！共检查 ${totalChecked} 条，更新 ${totalUpdated} 条\n`);
}

main().catch(console.error);
