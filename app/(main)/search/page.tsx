/**
 * 搜索结果页面（增强版）
 *
 * 功能：
 * - 使用混合搜索API（CMS + 豆瓣）
 * - 显示豆瓣海报和评分
 * - 点击跳转到播放页面
 * - 3D 倾斜发光效果
 */

"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Star, ExternalLink, Film, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import { parseVideoUrls } from "@/lib/video-utils";
import { cleanDescription } from "@/lib/html-utils";
import { getCache, setCache, generateSearchKey } from "@/lib/search-cache";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import TiltCard from "@/components/ui/TiltCard";

/**
 * 搜索结果类型
 */
interface MovieResult {
  id: string;
  title: string;
  year: string;
  type: string;
  poster: string;
  rating: number;
  description: string;
  actors: string[];
  directors: string[];
  playUrl: string;
  playFrom: string;
  sourceName: string;
  fromDouban: boolean;
  fromCms: boolean;
  fromNetflixGC: boolean;
}

/**
 * 搜索统计
 */
interface SearchStats {
  total: number;
  fromDouban: number;
  fromCms: number;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  // 启用滚动位置保持
  useScrollRestoration(`search_${query}`);

  // 搜索结果
  const [results, setResults] = useState<MovieResult[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);

  // 加载状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 用于跟踪当前查询
  const currentQueryRef = useRef(query);

  // 搜索
  useEffect(() => {
    if (query) {
      currentQueryRef.current = query;
      fetchSearchResults(query);
    }
  }, [query]);

  /**
   * 获取混合搜索结果（带缓存）
   */
  const fetchSearchResults = async (searchQuery: string) => {
    // 先检查缓存
    const cacheKey = generateSearchKey(searchQuery);
    const cached = getCache<{ results: MovieResult[]; stats: SearchStats }>(cacheKey);

    if (cached) {
      console.log('[搜索缓存] 命中缓存:', searchQuery);
      setResults(cached.results);
      setStats(cached.stats);
      setLoading(false);
      return;
    }

    console.log('[搜索缓存] 未命中，发起请求:', searchQuery);
    setLoading(true);
    setError(null);

    try {
      // 使用混合搜索API
      const response = await fetch(
        `/api/movie/search?wd=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();

      // 确保这是当前查询的结果（避免竞态条件）
      if (currentQueryRef.current !== searchQuery) {
        console.log('[搜索缓存] 查询已过期，丢弃结果');
        return;
      }

      if (data.success) {
        const searchResults = data.results || [];
        const searchStats = data.stats || null;

        setResults(searchResults);
        setStats(searchStats);

        // 缓存结果
        setCache(cacheKey, { results: searchResults, stats: searchStats });
        console.log('[搜索缓存] 已缓存结果:', searchQuery);
      } else {
        setError(data.error || '搜索失败');
      }
    } catch (err) {
      console.error("搜索失败:", err);
      setError("网络请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 获取播放链接
   * 使用统一的视频URL解析工具
   */
  const getPlayLink = (movie: MovieResult): string => {
    if (!movie.playUrl) return '#';

    try {
      const sources = parseVideoUrls(movie.playUrl, movie.sourceName);
      return sources[0]?.url || '#';
    } catch (e) {
      return '#';
    }
  };

  return (
    <div className="min-h-screen bg-[#181818]">
      <Header />

      <div className="pt-24 pb-16 max-w-[1400px] mx-auto px-4 md:px-12">
        {/* 搜索标题 */}
        <div className="flex items-center gap-3 mb-8">
          <Search className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-white">
            搜索结果：{query}
          </h1>
          {stats && (
            <span className="text-gray-500">
              （{stats.total} 个结果，{stats.fromDouban} 个来自豆瓣）
            </span>
          )}
        </div>

        {/* 搜索结果 */}
        {loading ? (
          <div className="flex flex-col justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-gray-400">正在搜索 CMS 和豆瓣数据...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-red-400 text-lg mb-2">{error}</p>
            <button
              onClick={() => fetchSearchResults(query)}
              className="text-blue-400 hover:text-blue-300"
            >
              重新搜索
            </button>
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {results.map((movie, index) => (
              <TiltCard
                key={movie.id}
                enableTilt={true}
                behindGlowEnabled={true}
                behindGlowColor="rgba(229, 9, 20, 0.5)"
                behindGlowSize="60%"
                innerGradient="linear-gradient(145deg, rgba(229, 9, 20, 0.1) 0%, rgba(0, 0, 0, 0.95) 100%)"
                maxWidth="100%"
                aspectRatio="0.667"
                className="group"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="w-full h-full"
                >
                  {/* 海报 - 点击进入详情页 */}
                  <Link href={`/movie/detail?title=${encodeURIComponent(movie.title)}${movie.year ? `&year=${movie.year}` : ''}`} scroll={false}>
                    <div className="relative w-full h-full">
                      {movie.poster ? (
                        <img
                          src={`/api/proxy/image?url=${encodeURIComponent(movie.poster)}`}
                          alt={movie.title}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          onError={(e) => {
                            // 图片加载失败时尝试直接加载
                            const img = e.target as HTMLImageElement;
                            if (!img.src.includes(movie.poster)) {
                              img.src = movie.poster;
                            } else {
                              img.style.display = 'none';
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                          <Film className="w-12 h-12 text-gray-600" />
                        </div>
                      )}

                      {/* 播放按钮覆盖层 */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                          <div className="w-0 h-0 border-l-[20px] border-l-black border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ml-1" />
                        </div>
                      </div>

                      {/* 豆瓣标签 */}
                      {movie.fromDouban && (
                        <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded z-10">
                          豆瓣
                        </div>
                      )}

                      {/* NetflixGC标签 */}
                      {movie.fromNetflixGC && (
                        <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded z-10">
                          NetflixGC
                        </div>
                      )}

                      {/* 底部渐变 */}
                      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/60 to-transparent" />
                    </div>
                  </Link>

                  {/* 底部信息 */}
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="text-white font-medium text-base truncate mb-1">
                      {movie.title}
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm">{movie.year}</span>
                      {movie.rating > 0 && (
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
                          <span className="text-yellow-400 text-sm font-medium">
                            {movie.rating.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <Search className="w-16 h-16 text-gray-600 mb-4" />
            <p className="text-gray-500 text-lg mb-2">未找到相关内容</p>
            <p className="text-gray-600 text-sm">
              请尝试其他关键词搜索
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 搜索页面（带 Suspense）
 */
export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
