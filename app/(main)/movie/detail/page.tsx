/**
 * 视频详情页 - NetflixGC 风格（优化版）
 *
 * 布局：
 * 1. 顶部：返回按钮
 * 2. 海报（左）+ 标题/信息/按钮（右），按钮与海报底部对齐
 * 3. 简介区域
 * 4. 演员网格（竖列排行）
 * 5. 资源列表
 * 6. 相关推荐
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  Play,
  Share2,
  Star,
  Film,
  Loader2,
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  Check,
} from "lucide-react";
import { GlowButton, FollowingGlow, GlowCard } from "@/components/ui/glow-effects";

/** 视频源类型 */
interface VideoSource {
  key: string;
  name: string;
  type: "netflixgc" | "cms";
  available: boolean;
  quality: string;
  qualityScore: number;
  id: string | number;
  playUrl?: string;
}

/** 演员类型 */
interface Actor {
  name: string;
  avatar?: string;
}

/** 相关作品 */
interface RelatedMovie {
  title: string;
  poster?: string;
  year?: string;
  rating?: number;
  id?: number;
}

/** 视频详情 */
interface MovieDetail {
  success: boolean;
  title: string;
  year?: string;
  poster?: string;
  description?: string;
  actors?: string[];
  directors?: string[];
  genres?: string[];
  rating?: number;
  doubanScore?: string;
  sources: VideoSource[];
  related?: RelatedMovie[];
}

/** 画质颜色配置 */
const qualityConfig: Record<string, { bg: string; text: string }> = {
  "4K": { bg: "bg-purple-600", text: "text-purple-100" },
  蓝光: { bg: "bg-blue-600", text: "text-blue-100" },
  "1080P": { bg: "bg-green-600", text: "text-green-100" },
  "720P": { bg: "bg-yellow-600", text: "text-yellow-100" },
  高清: { bg: "bg-orange-600", text: "text-orange-100" },
  标清: { bg: "bg-gray-600", text: "text-gray-100" },
};

/** 内容组件 */
function MovieDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const title = searchParams.get("title") || "";
  const year = searchParams.get("year") || undefined;

  const [detail, setDetail] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [copied, setCopied] = useState(false);

  /** 返回上一页 */
  const goBack = useCallback(() => {
    // 检查是否有上一页可以返回
    if (window.history.length > 1) {
      router.back();
    } else {
      // 如果没有上一页，根据当前页面判断应该返回到哪里
      if (pathname.includes('/search')) {
        router.push('/search');
      } else if (pathname.includes('/netflixgc')) {
        router.push('/netflixgc');
      } else {
        router.push('/');
      }
    }
  }, [router, pathname]);

  /** 代理图片 URL */
  const getProxiedImage = useCallback((url: string) => {
    if (!url) return '';
    // 如果是豆瓣图片，使用代理
    if (url.includes('doubanio.com') || url.includes('douban.com')) {
      return `/api/proxy/image?url=${encodeURIComponent(url)}`;
    }
    return url;
  }, []);

  /** 加载详情 */
  const loadDetail = useCallback(async () => {
    if (!title) {
      setError("缺少视频标题");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ title });
      if (year) params.set("year", year);

      const response = await fetch(`/api/movie/detail?${params}`);
      const data = await response.json();

      if (data.success) {
        setDetail(data);
        if (data.sources?.length > 0) {
          const bestSource = data.sources.find((s: VideoSource) => s.available) || data.sources[0];
          setSelectedSource(bestSource);
        }
      } else {
        setError(data.error || "获取详情失败");
      }
    } catch (err) {
      setError("网络请求失败");
    } finally {
      setLoading(false);
    }
  }, [title, year]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  /** 获取播放链接 */
  const getPlayLink = (source: VideoSource): string => {
    if (source.type === "netflixgc") {
      return `/netflixgc/play?id=${source.id}&title=${encodeURIComponent(detail?.title || "")}`;
    }
    if (source.playUrl) {
      return `/play?source=0&url=${encodeURIComponent(source.playUrl)}`;
    }
    return "#";
  };

  /** 切换收藏 */
  const toggleFavorite = () => setIsFavorite(!isFavorite);

  /** 复制链接 */
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** 获取画质样式 */
  const getQualityStyle = (quality: string) => {
    return qualityConfig[quality] || qualityConfig["标清"];
  };

  /** 按来源分组 */
  const groupSources = () => {
    if (!detail?.sources) return { netflixgc: [], cms: [] };
    return {
      netflixgc: detail.sources.filter((s) => s.type === "netflixgc"),
      cms: detail.sources.filter((s) => s.type === "cms"),
    };
  };

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  // 错误
  if (error || !detail) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">加载失败</h1>
          <p className="text-gray-400 mb-4">{error || "未找到视频信息"}</p>
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
            返回上一页
          </button>
        </div>
      </div>
    );
  }

  const { netflixgc, cms } = groupSources();

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* 背景模糊海报 */}
      <div className="fixed inset-0 z-0">
        {detail.poster ? (
          <img
            src={getProxiedImage(detail.poster)}
            alt=""
            className="w-full h-full object-cover blur-2xl opacity-15 scale-110"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
        )}
        <div className="absolute inset-0 bg-[#0a0a0f]/60" />
      </div>

      {/* 主要内容 */}
      <div className="relative z-10">
        {/* 顶部导航 - 只有返回 */}
        <div className="sticky top-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <button
              onClick={goBack}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition w-fit"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>返回</span>
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* 主要信息：海报（左）+ 信息/按钮（右） */}
          <div className="flex flex-col md:flex-row gap-8 mb-8">
            {/* 左侧海报 */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <div className="w-48 md:w-56 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10">
                {detail.poster ? (
                  <img
                    src={getProxiedImage(detail.poster)}
                    alt={detail.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder-poster.png";
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <Film className="w-16 h-16 text-gray-600" />
                  </div>
                )}
              </div>
            </div>

            {/* 右侧信息 - 与海报底部对齐 */}
            <div className="flex-1 min-w-0 flex flex-col justify-end">
              {/* 标题 */}
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                {detail.title}
              </h1>

              {/* 标签 */}
              <div className="flex flex-wrap gap-2 mb-4">
                {detail.year && (
                  <span className="px-3 py-1 bg-white/20 text-white text-sm rounded">
                    {detail.year}
                  </span>
                )}
                {detail.genres?.slice(0, 3).map((g) => (
                  <span key={g} className="px-3 py-1 bg-white/10 text-gray-300 text-sm rounded">
                    {g}
                  </span>
                ))}
              </div>

              {/* 评分 */}
              {detail.doubanScore && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-green-500 font-bold">豆瓣</span>
                  <span className="text-xl font-bold text-green-500">{detail.doubanScore}</span>
                </div>
              )}

              {/* 导演/演员 */}
              {detail.directors && detail.directors.length > 0 && (
                <p className="text-gray-400 text-sm mb-1">
                  <span className="text-red-400">导演：</span>
                  {detail.directors.join("、")}
                </p>
              )}
              {detail.actors && detail.actors.length > 0 && (
                <p className="text-gray-400 text-sm mb-4">
                  <span className="text-red-400">主演：</span>
                  {detail.actors.slice(0, 5).join("、")}
                  {detail.actors.length > 5 && "..."}
                </p>
              )}

              {/* 播放/收藏/分享 按钮行 - 与海报底部对齐 */}
              <div className="flex items-center gap-3">
                {selectedSource && (
                  <FollowingGlow glowColor="#e50914" glowSize={150} className="rounded-lg">
                    <Link
                      href={getPlayLink(selectedSource)}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition shadow-lg shadow-red-600/30"
                      scroll={false}
                    >
                      <Play className="w-5 h-5" fill="currentColor" />
                      播放
                      {selectedSource.quality !== "未知" && (
                        <span className="text-sm opacity-80">· {selectedSource.quality}</span>
                      )}
                    </Link>
                  </FollowingGlow>
                )}
                <GlowButton
                  variant={isFavorite ? "red" : "default"}
                  onClick={toggleFavorite}
                >
                  {isFavorite ? <BookmarkCheck className="w-5 h-5" fill="currentColor" /> : <Bookmark className="w-5 h-5" />}
                </GlowButton>
                <GlowButton variant="default" onClick={copyLink}>
                  {copied ? <Check className="w-5 h-5 text-green-400" /> : <Share2 className="w-5 h-5" />}
                </GlowButton>
              </div>
            </div>
          </div>

          {/* 简介 */}
          {detail.description && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-3">简介</h2>
              <p className="text-gray-300 leading-relaxed">
                {detail.description}
              </p>
            </div>
          )}

          {/* 演员 - 网格竖列排行 */}
          {detail.actors && detail.actors.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4">演员</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                {detail.actors.slice(0, 16).map((actor, index) => (
                  <div key={index} className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center border-2 border-white/20 shadow-lg overflow-hidden">
                      <span className="text-lg font-bold text-gray-300">
                        {actor.charAt(0)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 text-center w-full truncate">
                      {actor}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 资源列表 */}
          {detail.sources.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">
                  资源列表
                  <span className="text-gray-500 text-sm font-normal ml-2">
                    ({detail.sources.length} 个可用源)
                  </span>
                </h2>
              </div>

              {/* NetflixGC 来源 */}
              {netflixgc.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-gray-400 text-sm mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    NetflixGC 来源 ({netflixgc.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {netflixgc.map((source) => {
                      const style = getQualityStyle(source.quality);
                      return (
                        <Link
                          key={source.key}
                          href={getPlayLink(source)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition ${
                            selectedSource?.key === source.key
                              ? `${style.bg} text-white ring-2 ring-white/30`
                              : `${style.bg}/80 ${style.text} hover:opacity-90`
                          }`}
                          onClick={() => setSelectedSource(source)}
                          scroll={false}
                        >
                          <span className="text-xs opacity-80">●</span>
                          {source.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CMS 来源 */}
              {cms.length > 0 && (
                <div>
                  <h3 className="text-gray-400 text-sm mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    其他来源 ({cms.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {cms.map((source) => {
                      const style = getQualityStyle(source.quality);
                      return (
                        <Link
                          key={source.key}
                          href={getPlayLink(source)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition ${
                            selectedSource?.key === source.key
                              ? `${style.bg} text-white ring-2 ring-white/30`
                              : `${style.bg}/80 ${style.text} hover:opacity-90`
                          }`}
                          onClick={() => setSelectedSource(source)}
                          scroll={false}
                        >
                          <span className="text-xs opacity-80">●</span>
                          {source.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 相关推荐 */}
          {detail.related && detail.related.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4">相关推荐</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {detail.related.map((item, index) => (
                  <FollowingGlow
                    key={index}
                    className="rounded-lg"
                    glowColor="#e50914"
                    glowSize={150}
                  >
                    <Link
                      href={`/movie/detail?title=${encodeURIComponent(item.title)}`}
                      className="group block"
                      scroll={false}
                    >
                      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 shadow-lg group-hover:shadow-xl transition-shadow">
                        {item.poster ? (
                          <img
                            src={getProxiedImage(item.poster)}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/placeholder-poster.png";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-8 h-8 text-gray-600" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 mt-2 truncate group-hover:text-red-400 transition-colors">
                        {item.title}
                      </p>
                    </Link>
                  </FollowingGlow>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 主页面组件 */
export default function MovieDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
        </div>
      }
    >
      <MovieDetailContent />
    </Suspense>
  );
}
