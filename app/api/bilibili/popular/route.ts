/**
 * B站高质量视频推荐 API
 *
 * 用途: 提供B站高质量视频推荐接口
 * 依赖:
 *   - NextRequest/NextResponse: Next.js API 路由
 * 架构:
 *   - 排行榜 API: 获取B站官方排行榜视频
 *   - 热门 API: 获取B站热门推荐视频
 *   - 质量评分: 综合播放量、弹幕、点赞等计算
 *   - 去重逻辑: 自动排除重复视频
 *   - 排除列表: 支持排除已播放视频
 */

import { NextRequest, NextResponse } from "next/server";

// ============================================
// 类型定义
// ============================================

/** B站视频类型 */
interface BilibiliVideo {
  bvid: string;
  title: string;
  description: string;
  duration: string;
  pic: string;
  author: string;
  play: number;
  danmaku: number;
  pubdate: number;
  score?: number;
}

// ============================================
// 工具函数
// ============================================

/**
 * 随机打乱数组（Fisher-Yates 算法）
 *
 * 做什么: 将数组元素随机排序
 * 参数:
 *   - array: 原始数组
 * 返回值: 打乱后的新数组（不修改原数组）
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 生成不重复的随机页码数组
 *
 * 做什么: 生成指定数量的不重复随机页码
 * 参数:
 *   - count: 需要的页码数量
 *   - max: 最大页码值
 * 返回值: number[] - 不重复的随机页码数组
 */
function getRandomPages(count: number, max: number): number[] {
  const pages = new Set<number>();
  while (pages.size < count && pages.size < max) {
    pages.add(Math.floor(Math.random() * max) + 1);
  }
  return Array.from(pages);
}

/**
 * 格式化时长（秒转 mm:ss）
 *
 * 做什么: 将秒数格式化为 mm:ss 格式
 * 参数:
 *   - seconds: 视频时长（秒）
 * 返回值: string - 格式化后的时长字符串
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 计算视频质量评分
 *
 * 做什么: 根据多项指标计算视频质量分
 * 参数:
 *   - stat: 视频统计数据对象
 * 返回值: number - 质量评分（数值越高越好）
 *
 * 评分公式: 播放×0.3 + 弹幕×2 + 点赞×5 + 投币×10 + 收藏×8 + 分享×3
 */
function calculateScore(stat: any): number {
  const view = stat.view || 0;
  const danmaku = stat.danmaku || 0;
  const like = stat.like || 0;
  const coin = stat.coin || 0;
  const favorite = stat.favorite || 0;
  const share = stat.share || 0;

  return (
    view * 0.3 +
    danmaku * 2 +
    like * 5 +
    coin * 10 +
    favorite * 8 +
    share * 3
  );
}

// ============================================
// API 数据获取函数
// ============================================

/**
 * 获取排行榜视频
 *
 * 做什么: 从B站官方排行榜 API 获取高质量视频
 * 参数: 无
 * 返回值: BilibiliVideo[] - 排行榜视频列表（最多30个）
 */
async function getRankingVideos(): Promise<BilibiliVideo[]> {
  try {
    const response = await fetch(
      "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.bilibili.com",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await response.json();

    if (data.code !== 0 || !data.data?.list) {
      return [];
    }

    return data.data.list.slice(0, 30).map((item: any) => ({
      bvid: item.bvid,
      title: item.title,
      description: item.desc || "",
      duration: formatDuration(item.duration),
      pic: item.pic?.startsWith("//") ? `https:${item.pic}` : item.pic,
      author: item.owner?.name || "",
      play: item.stat?.view || 0,
      danmaku: item.stat?.danmaku || 0,
      pubdate: item.pubdate || 0,
      score: calculateScore(item.stat),
    }));
  } catch (error) {
    console.error("获取排行榜失败:", error);
    return [];
  }
}

/**
 * 获取热门视频
 *
 * 做什么: 从B站热门 API 获取推荐视频
 * 参数:
 *   - page: 页码（默认1）
 * 返回值: BilibiliVideo[] - 热门视频列表（每页最多20个）
 */
async function getPopularVideos(page: number = 1): Promise<BilibiliVideo[]> {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/popular?ps=20&pn=${page}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.bilibili.com",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await response.json();

    if (data.code !== 0 || !data.data?.list) {
      return [];
    }

    return data.data.list
      .filter((item: any) => !item.is_ogv)
      .slice(0, 20)
      .map((item: any) => ({
        bvid: item.bvid,
        title: item.title,
        description: item.desc || "",
        duration: formatDuration(item.duration),
        pic: item.pic?.startsWith("//") ? `https:${item.pic}` : item.pic,
        author: item.owner?.name || "",
        play: item.stat?.view || 0,
        danmaku: item.stat?.danmaku || 0,
        pubdate: item.pubdate || 0,
        score: calculateScore(item.stat),
      }));
  } catch (error) {
    console.error("获取热门失败:", error);
    return [];
  }
}

// ============================================
// API 路由处理
// ============================================

/**
 * GET 请求处理
 *
 * 做什么: 根据参数返回推荐视频列表
 * 参数:
 *   - type: all(默认)/ranking/popular - 推荐类型
 *   - page: 页码（默认1）
 *   - refresh: 时间戳（用于避免缓存）
 *   - exclude: 已看视频 bvid 列表（逗号分隔）
 * 返回值: JSON 响应，包含 success、videos 等字段
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  const page = parseInt(searchParams.get("page") || "1");
  const refresh = searchParams.get("refresh") || Date.now().toString();
  const exclude = searchParams.get("exclude") || "";
  const excludeSet = new Set(exclude.split(",").filter(Boolean));

  try {
    let videos: BilibiliVideo[] = [];

    switch (type) {
      case "ranking":
        // 仅排行榜（随机打乱）
        const rankingOnly = await getRankingVideos();
        videos = shuffleArray(rankingOnly);
        break;

      case "popular":
        // 仅热门（随机页码）
        const randomPage = Math.floor(Math.random() * 20) + 1;
        videos = await getPopularVideos(randomPage);
        break;

      case "all":
      default:
        // 综合推荐：排行榜 + 多页热门
        const hotPages = getRandomPages(12, 20);
        const promises = [
          getRankingVideos(),
          ...hotPages.map(p => getPopularVideos(p)),
        ];
        const results = await Promise.all(promises);

        // 去重合并
        const seen = new Set<string>();
        for (const videoList of results) {
          for (const v of videoList) {
            if (!seen.has(v.bvid)) {
              seen.add(v.bvid);
              videos.push(v);
            }
          }
        }

        // 排除已看过的视频
        if (excludeSet.size > 0) {
          videos = videos.filter((v) => !excludeSet.has(v.bvid));
        }

        // 随机打乱并取前60个
        videos = shuffleArray(videos).slice(0, 60);
        break;
    }

    return NextResponse.json({
      success: true,
      source: "bilibili_ranking",
      total: videos.length,
      page,
      videos,
      excludedCount: excludeSet.size,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "获取推荐失败",
    });
  }
}
