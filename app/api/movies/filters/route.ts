/**
 * 电影筛选选项API
 *
 * 提供筛选条件选项：
 * - 类型（genre）
 * - 地区（region）
 * - 年份范围
 * - 语言（language）
 * - 按首字母索引
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // 获取所有distinct的genre（类型）
    const { data: genres } = await supabase
      .from("movies")
      .select("genre")
      .eq("is_published", true)
      .not("genre", "is", null);

    // 获取所有distinct的region（地区）
    const { data: regions } = await supabase
      .from("movies")
      .select("region")
      .eq("is_published", true)
      .not("region", "is", null);

    // 获取所有distinct的language（语言）
    const { data: languages } = await supabase
      .from("movies")
      .select("language")
      .eq("is_published", true)
      .not("language", "is", null);

    // 获取年份范围
    const { data: yearRange } = await supabase
      .from("movies")
      .select("year")
      .eq("is_published", true)
      .not("year", "is", null)
      .order("year", { ascending: true });

    // 获取所有distinct的首字母（只获取title字段）
    const { data: titles, error: titleError } = await supabase
      .from("movies")
      .select("title")
      .eq("is_published", true)
      .limit(1000);

    // 处理genre（可能是数组或逗号分隔字符串）
    const genreSet = new Set<string>();
    genres?.forEach((item) => {
      if (item.genre) {
        // 如果是数组
        if (Array.isArray(item.genre)) {
          item.genre.forEach((g: string) => {
            const trimmed = g.trim();
            if (trimmed) genreSet.add(trimmed);
          });
        } else {
          // 如果是字符串（逗号分隔）
          item.genre.split(/[,，、]/).forEach((g: string) => {
            const trimmed = g.trim();
            if (trimmed) genreSet.add(trimmed);
          });
        }
      }
    });

    // 处理region
    const regionSet = new Set<string>();
    regions?.forEach((item) => {
      if (item.region) {
        item.region.split(/[,，、]/).forEach((r: string) => {
          const trimmed = r.trim();
          if (trimmed) regionSet.add(trimmed);
        });
      }
    });

    // 处理language
    const languageSet = new Set<string>();
    languages?.forEach((item) => {
      if (item.language) {
        item.language.split(/[,，、]/).forEach((l: string) => {
          const trimmed = l.trim();
          if (trimmed) languageSet.add(trimmed);
        });
      }
    });

    // 处理年份范围
    const years = yearRange?.map((item) => item.year).filter(Boolean) || [];
    const minYear = years.length > 0 ? Math.min(...years) : 1900;
    const maxYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear();

    // 处理首字母索引（支持中文拼音首字母）
    const firstLetterSet = new Set<string>();
    titles?.forEach((item) => {
      if (item.title) {
        const firstChar = item.title.charAt(0).toUpperCase();
        if (/[A-Z]/.test(firstChar)) {
          firstLetterSet.add(firstChar);
        } else if (/[0-9]/.test(firstChar)) {
          firstLetterSet.add("#");
        } else {
          // 中文字符添加到"中文"分类
          firstLetterSet.add("中");
        }
      }
    });

    // 按字母顺序排序
    const sortedGenres = Array.from(genreSet).sort();
    const sortedRegions = Array.from(regionSet).sort();
    const sortedLanguages = Array.from(languageSet).sort();
    const sortedLetters = Array.from(firstLetterSet).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });

    return NextResponse.json({
      genres: sortedGenres,
      regions: sortedRegions,
      languages: sortedLanguages,
      yearRange: { min: minYear, max: maxYear },
      firstLetters: sortedLetters,
    });
  } catch (error) {
    console.error("获取筛选选项失败:", error);
    return NextResponse.json(
      { error: "获取筛选选项失败" },
      { status: 500 }
    );
  }
}
