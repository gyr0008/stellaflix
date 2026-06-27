/**
 * 搜索结果页面（增强版）
 *
 * 功能：
 * - 使用混合搜索API（CMS + 豆瓣）
 * - 显示豆瓣海报和评分
 * - 点击跳转到播放页面
 */

"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Star, ExternalLink, Film } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import { parseVideoUrls } from "@/lib/video-utils";

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
}

/**
 * 搜索统计
 */
interface SearchStats {
  total: number;
  fromDouban: number;
  fromCms: number;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  // 搜索结果
  const [results, setResults] = useState<MovieResult[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);

  // 加载状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 搜索
  useEffect(() => {
    if (query) {
      fetchSearchResults(query);
    }
  }, [query]);

  /**
   * 获取混合搜索结果
   */
  const fetchSearchResults = async (searchQuery: string) => {
    setLoading(true);
    setError(null);

    try {
      // 使用混合搜索API
      const response = await fetch(
        `/api/movie/search?wd=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();

      if (data.success) {
        setResults(data.results || []);
        setStats(data.stats || null);
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
              <motion.div
                key={movie.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
              >
                {/* 海报 */}
                <Link href={`/play?source=0&url=${encodeURIComponent(getPlayLink(movie))}`}>
                  <div className="relative aspect-[2/3] w-full group cursor-pointer">
                    {movie.poster ? (
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        onError={(e) => {
                          // 图片加载失败时显示占位符
                          (e.target as HTMLImageElement).style.display = 'none';
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
                      <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
                        豆瓣
                      </div>
                    )}
                  </div>
                </Link>

                {/* 信息 */}
                <div className="p-4">
                  <h3 className="text-white font-medium text-base truncate mb-1">
                    {movie.title}
                  </h3>

                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-gray-500 text-sm">{movie.year}</span>
                    {movie.rating > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
                        <span className="text-yellow-400 text-sm font-medium">
                          {movie.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                    <span className="text-gray-600 text-xs">{movie.type}</span>
                  </div>

                  {/* 简介 */}
                  {movie.description && (
                    <p className="text-gray-400 text-xs line-clamp-2 mb-3">
                      {movie.description}
                    </p>
                  )}

                  {/* 演员 */}
                  {movie.actors.length > 0 && (
                    <p className="text-gray-500 text-xs mb-3">
                      主演：{movie.actors.slice(0, 3).join('、')}
                    </p>
                  )}

                  {/* 播放按钮 */}
                  <Link
                    href={`/play?source=0&url=${encodeURIComponent(getPlayLink(movie))}`}
                    className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-4 rounded transition-colors"
                  >
                    <span>立即播放</span>
                    <ExternalLink className="w-4 h-4" />
                  </Link>

                  {/* 数据来源 */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <span>来源：{movie.sourceName}</span>
                    {movie.fromDouban && <span>• 信息：豆瓣</span>}
                  </div>
                </div>
              </motion.div>
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
