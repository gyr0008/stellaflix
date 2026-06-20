"use client";

/**
 * 自动刮削管理页面
 *
 * 支持搜索电影、预览元数据、一键保存到数据库
 */

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import {
  Search,
  Film,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  RefreshCw,
  Settings,
  ExternalLink,
  Star,
  Calendar,
  Clock,
  Users,
} from "lucide-react";

/** 搜索结果类型 */
interface SearchResult {
  id: number;
  title: string;
  original_title?: string;
  year?: number;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  popularity?: number;
}

/** 电影元数据类型 */
interface MovieMetadata {
  title: string;
  original_title?: string;
  tagline?: string;
  description?: string;
  overview?: string;
  year?: number;
  release_date?: string;
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
  rating?: number;
  rating_count?: number;
  director?: Array<{ id: number; name: string }>;
  cast?: Array<{ id: number; name: string; character: string }>;
  poster_path?: string;
  backdrop_path?: string;
  trailer_url?: string;
}

export default function ScraperManagePage() {
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("");
  const [searchYear, setSearchYear] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // 详情状态
  const [selectedMovie, setSelectedMovie] = useState<MovieMetadata | null>(
    null
  );
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 保存状态
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // 配置状态
  const [config, setConfig] = useState<any>(null);

  // 加载配置
  useEffect(() => {
    fetch("/api/scraper/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConfig(data.data);
        }
      })
      .catch(console.error);
  }, []);

  // 搜索电影
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setResult(null);
    setSelectedMovie(null);

    try {
      const params = new URLSearchParams({
        query: searchQuery,
      });
      if (searchYear) {
        params.append("year", searchYear);
      }

      const res = await fetch(`/api/scraper/search?${params}`);
      const data = await res.json();

      if (data.success) {
        setSearchResults(data.data);
      } else {
        setResult({ success: false, message: data.error || "搜索失败" });
      }
    } catch (error) {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setSearching(false);
    }
  };

  // 获取电影详情
  const handleGetDetail = async (tmdbId: number) => {
    setLoadingDetail(true);
    setResult(null);

    try {
      const res = await fetch(`/api/scraper/detail?id=${tmdbId}`);
      const data = await res.json();

      if (data.success) {
        setSelectedMovie(data.data);
      } else {
        setResult({ success: false, message: data.error || "获取详情失败" });
      }
    } catch (error) {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setLoadingDetail(false);
    }
  };

  // 格式化图片 URL
  const formatImageUrl = (
    path: string | null | undefined,
    size: string = "w500"
  ): string => {
    if (!path) return "/placeholder-movie.jpg";
    return `https://image.tmdb.org/t/p/${size}${path}`;
  };

  // 格式化时长
  const formatRuntime = (minutes?: number): string => {
    if (!minutes) return "未知";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}小时${mins}分钟`;
    }
    return `${mins}分钟`;
  };

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        {/* 标题 */}
        <div className="flex items-center gap-3 mb-8">
          <Film className="w-8 h-8 text-red-600" />
          <h1 className="text-3xl font-bold text-white">自动刮削</h1>
        </div>

        {/* 配置状态提示 */}
        {config && !config.config.tmdb.configured && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-3 text-yellow-400">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">TMDB API Key 未配置</p>
                <p className="text-sm mt-1">
                  请在 Vercel 环境变量中设置{" "}
                  <code className="bg-gray-800 px-2 py-0.5 rounded">
                    TMDB_API_KEY
                  </code>
                </p>
                <a
                  href="https://developer.themoviedb.org/docs/getting-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline mt-1 inline-flex items-center gap-1"
                >
                  获取 API Key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 结果提示 */}
        {result && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              result.success
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {result.message}
          </div>
        )}

        {/* 搜索区域 */}
        <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Search className="w-5 h-5" />
            搜索电影
          </h2>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                placeholder="输入电影名称，如：功夫、阿凡达、泰坦尼克号"
              />
            </div>
            <div className="w-full sm:w-32">
              <input
                type="number"
                value={searchYear}
                onChange={(e) => setSearchYear(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                placeholder="年份（可选）"
                min="1900"
                max="2030"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              {searching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              搜索
            </button>
          </div>
        </div>

        {/* 搜索结果 */}
        {searchResults.length > 0 && (
          <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              搜索结果（共 {searchResults.length} 条）
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((movie) => (
                <div
                  key={movie.id}
                  className="bg-gray-800/50 rounded-lg overflow-hidden cursor-pointer hover:bg-gray-800 transition"
                  onClick={() => handleGetDetail(movie.id)}
                >
                  <div className="flex">
                    <img
                      src={formatImageUrl(movie.poster_path, "w200")}
                      alt={movie.title}
                      className="w-20 h-28 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "/placeholder-movie.jpg";
                      }}
                    />
                    <div className="flex-1 p-3">
                      <h3 className="text-white font-medium line-clamp-2">
                        {movie.title}
                      </h3>
                      {movie.original_title &&
                        movie.original_title !== movie.title && (
                          <p className="text-gray-500 text-sm line-clamp-1">
                            {movie.original_title}
                          </p>
                        )}
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                        {movie.year && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {movie.year}
                          </span>
                        )}
                        {movie.popularity && (
                          <span className="text-yellow-500">
                            ★ {movie.popularity.toFixed(0)}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs mt-2 line-clamp-2">
                        {movie.overview || "暂无简介"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 电影详情预览 */}
        {selectedMovie && (
          <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 overflow-hidden mb-6">
            {/* 背景图 */}
            <div className="relative h-64 sm:h-80">
              <img
                src={formatImageUrl(selectedMovie.backdrop_path, "w1280")}
                alt={selectedMovie.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            </div>

            {/* 内容 */}
            <div className="p-6 -mt-32 relative">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* 海报 */}
                <div className="flex-shrink-0">
                  <img
                    src={formatImageUrl(selectedMovie.poster_path, "w500")}
                    alt={selectedMovie.title}
                    className="w-40 sm:w-48 rounded-lg shadow-xl"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "/placeholder-movie.jpg";
                    }}
                  />
                </div>

                {/* 信息 */}
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-white">
                    {selectedMovie.title}
                  </h2>
                  {selectedMovie.original_title &&
                    selectedMovie.original_title !== selectedMovie.title && (
                      <p className="text-gray-400 mt-1">
                        {selectedMovie.original_title}
                      </p>
                    )}

                  {selectedMovie.tagline && (
                    <p className="text-gray-500 italic mt-2">
                      "{selectedMovie.tagline}"
                    </p>
                  )}

                  {/* 评分和信息 */}
                  <div className="flex flex-wrap items-center gap-4 mt-4">
                    {selectedMovie.rating && (
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Star className="w-5 h-5 fill-current" />
                        <span className="font-bold">
                          {selectedMovie.rating.toFixed(1)}
                        </span>
                        {selectedMovie.rating_count && (
                          <span className="text-gray-400 text-sm">
                            ({selectedMovie.rating_count.toLocaleString()})
                          </span>
                        )}
                      </div>
                    )}
                    {selectedMovie.year && (
                      <span className="flex items-center gap-1 text-gray-400">
                        <Calendar className="w-4 h-4" />
                        {selectedMovie.year}
                      </span>
                    )}
                    {selectedMovie.runtime && (
                      <span className="flex items-center gap-1 text-gray-400">
                        <Clock className="w-4 h-4" />
                        {formatRuntime(selectedMovie.runtime)}
                      </span>
                    )}
                  </div>

                  {/* 类型 */}
                  {selectedMovie.genres && selectedMovie.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {selectedMovie.genres.map((genre) => (
                        <span
                          key={genre.id}
                          className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded-full"
                        >
                          {genre.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 导演 */}
                  {selectedMovie.director &&
                    selectedMovie.director.length > 0 && (
                      <p className="text-gray-400 mt-4">
                        <span className="text-gray-500">导演：</span>
                        {selectedMovie.director.map((d) => d.name).join(", ")}
                      </p>
                    )}

                  {/* 演员 */}
                  {selectedMovie.cast && selectedMovie.cast.length > 0 && (
                    <p className="text-gray-400 mt-2">
                      <span className="text-gray-500">主演：</span>
                      {selectedMovie.cast
                        .slice(0, 5)
                        .map((c) => c.name)
                        .join(", ")}
                      {selectedMovie.cast.length > 5 && "..."}
                    </p>
                  )}

                  {/* 简介 */}
                  {(selectedMovie.overview || selectedMovie.description) && (
                    <div className="mt-4">
                      <h3 className="text-white font-medium mb-2">简介</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">
                        {selectedMovie.overview || selectedMovie.description}
                      </p>
                    </div>
                  )}

                  {/* 预告片 */}
                  {selectedMovie.trailer_url && (
                    <a
                      href={selectedMovie.trailer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-4 text-red-500 hover:text-red-400"
                    >
                      <ExternalLink className="w-4 h-4" />
                      观看预告片
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            使用说明
          </h3>
          <div className="space-y-3 text-sm text-gray-400">
            <p>
              <strong className="text-white">自动刮削：</strong>
              输入电影名称，系统会自动从 TMDB 搜索并获取完整的元数据，包括海报、简介、演员、评分等。
            </p>
            <p>
              <strong className="text-white">TMDB API Key：</strong>
              需要在 Vercel 环境变量中设置{" "}
              <code className="bg-gray-800 px-2 py-0.5 rounded">
                TMDB_API_KEY
              </code>
              。访问{" "}
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-500 hover:underline"
              >
                TMDB 官网
              </a>{" "}
              免费申请。
            </p>
            <p>
              <strong className="text-white">数据存储：</strong>
              刮削的元数据会自动填充到电影信息中，帮助你快速管理电影库。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
