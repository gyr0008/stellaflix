// 根据电影名称搜索视频源 API
// 支持多源并发搜索，返回所有可用播放源

import { NextRequest, NextResponse } from "next/server";
import { aggregator } from "@/lib/video-sources/aggregator";

// 强制动态渲染
export const dynamic = "force-dynamic";

// 缓存时间（秒）
const CACHE_TTL = 5 * 60;

// 简单内存缓存
const searchCache = new Map<string, { data: unknown; timestamp: number }>();

/**
 * GET /api/video-sources/search-by-movie?title=功夫&year=2004
 * 根据电影名称搜索视频源，自动去重并排序
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title");
    const year = searchParams.get("year");
    const sources = searchParams.get("sources"); // 可选：指定源，逗号分隔

    // 参数验证
    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { error: "电影标题不能为空" },
        { status: 400 }
      );
    }

    // 构建缓存 key
    const cacheKey = `${title}-${year || ""}-${sources || ""}`;

    // 检查缓存
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
      return NextResponse.json(cached.data);
    }

    // 搜索关键词处理：去掉年份等干扰信息
    const searchQuery = title
      .replace(/\(\d{4}\)/g, "") // 去掉 (2004)
      .replace(/\[\d{4}\]/g, "") // 去掉 [2004]
      .replace(/第.季/g, "") // 去掉 第X季
      .trim();

    console.log(`[Search] 搜索视频源: "${searchQuery}" (原: "${title}", 年份: ${year})`);

    // 聚合搜索
    const response = await aggregator.search({
      query: searchQuery,
      sources: sources ? sources.split(",") : undefined,
      limit: 20,
    });

    // 按年份进一步筛选和排序（如果提供了年份）
    let results = response.data;
    if (year) {
      const targetYear = parseInt(year);
      results = results.map((item) => ({
        ...item,
        // 如果年份匹配，提高优先级
        relevanceScore:
          item.year === targetYear ? 100 : item.year ? Math.abs(item.year - targetYear) < 3 ? 50 : 0 : 25,
      }));
    }

    // 按相关度和年份排序
    results.sort((a, b) => {
      const scoreA = (a as Record<string, unknown>).relevanceScore as number || 0;
      const scoreB = (b as Record<string, unknown>).relevanceScore as number || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return ((b as Record<string, unknown>).year as number || 0) - ((a as Record<string, unknown>).year as number || 0);
    });

    const responseData = {
      success: true,
      query: title,
      data: results,
      total: results.length,
      sources_used: response.sources_used,
      errors: response.errors,
    };

    // 存入缓存
    searchCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    // 清理过期缓存
    if (searchCache.size > 100) {
      const oldestKey = Array.from(searchCache.keys())[0];
      searchCache.delete(oldestKey);
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[Search] 搜索视频源失败:", error);
    return NextResponse.json(
      {
        error: "搜索视频源失败",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}
