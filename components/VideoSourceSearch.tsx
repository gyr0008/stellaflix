"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Play,
  Loader2,
  ExternalLink,
  Film,
  X,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * 视频源搜索结果项类型
 */
interface SearchResult {
  id: string;
  title: string;
  cover: string;
  year: number;
  type: string;
  source: string;
  source_name: string;
  url: string;
  extra_data?: {
    episodes?: Array<{
      id: string;
      title: string;
      url: string;
      episode_number: number;
    }>;
  };
}

/**
 * 视频源搜索组件 props
 */
interface VideoSourceSearchProps {
  movieTitle: string;
  movieYear?: number;
  movieId?: string;
  onPlay?: (source: SearchResult) => void;
}

/**
 * 视频源搜索组件
 * 用于搜索和选择视频源，支持多源搜索和播放源选择
 */
export default function VideoSourceSearch({
  movieTitle,
  movieYear,
  movieId,
  onPlay,
}: VideoSourceSearchProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  /**
   * 搜索视频源
   */
  const handleSearch = async () => {
    setSearching(true);
    setError("");
    setResults([]);

    try {
      const params = new URLSearchParams();
      params.set("title", movieTitle);
      if (movieYear) params.set("year", movieYear.toString());

      const response = await fetch(
        `/api/video-sources/search-by-movie?${params.toString()}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "搜索失败");
      }

      if (data.data && data.data.length > 0) {
        setResults(data.data);
      } else {
        setError("未找到可用的播放源");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索视频源失败");
    } finally {
      setSearching(false);
    }
  };

  /**
   * 播放视频
   * 先获取视频详情（剧集列表），然后跳转到播放页面
   */
  const handlePlay = async (result: SearchResult) => {
    setSelectedSource(result.source);

    // 如果有回调，使用回调
    if (onPlay) {
      onPlay(result);
      return;
    }

    try {
      // 尝试获取视频详情（包括剧集列表）
      const detailResponse = await fetch(
        `/api/video-sources/detail?source=${result.source}&id=${result.id}`
      );

      let episodes = result.extra_data?.episodes || [];
      let videoUrl = result.url;

      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        if (detailData.success && detailData.data?.episodes) {
          episodes = detailData.data.episodes;
          // 如果有剧集，使用第一集的 URL
          if (episodes.length > 0) {
            videoUrl = episodes[0].url;
          }
        }
      }

      // 构建播放 URL
      const playUrl = new URL("/play/external", window.location.origin);
      playUrl.searchParams.set("source", result.source);
      playUrl.searchParams.set("url", videoUrl);
      playUrl.searchParams.set("title", result.title);
      if (movieId) playUrl.searchParams.set("movieId", movieId);
      if (episodes.length > 0) {
        playUrl.searchParams.set("episodes", JSON.stringify(episodes));
      }

      router.push(playUrl.pathname + playUrl.search);
    } catch (error) {
      console.error("获取视频详情失败:", error);
      // 即使获取详情失败，也跳转播放
      const playUrl = new URL("/play/external", window.location.origin);
      playUrl.searchParams.set("source", result.source);
      playUrl.searchParams.set("url", result.url);
      playUrl.searchParams.set("title", result.title);
      if (movieId) playUrl.searchParams.set("movieId", movieId);
      router.push(playUrl.pathname + playUrl.search);
    }
  };

  /**
   * 获取类型标签颜色
   */
  const getTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case "电影":
      case "movie":
        return "bg-blue-500/20 text-blue-400";
      case "电视剧":
      case "tv":
        return "bg-purple-500/20 text-purple-400";
      case "动漫":
      case "animation":
        return "bg-pink-500/20 text-pink-400";
      case "纪录片":
      case "documentary":
        return "bg-green-500/20 text-green-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  return (
    <>
      {/* 搜索触发按钮 */}
      <button
        onClick={() => {
          setIsOpen(true);
          if (results.length === 0 && !searching) {
            handleSearch();
          }
        }}
        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
      >
        <Play className="w-5 h-5" />
        搜索播放源
      </button>

      {/* 弹窗 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl max-h-[80vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <Film className="w-6 h-6 text-red-500" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      搜索播放源
                    </h3>
                    <p className="text-sm text-gray-400">
                      {movieTitle} {movieYear ? `(${movieYear})` : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-800 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* 内容区 */}
              <div className="overflow-y-auto p-4" style={{ maxHeight: "60vh" }}>
                {/* 搜索状态 */}
                {searching && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-4" />
                    <p className="text-gray-400">正在搜索多个视频源...</p>
                    <p className="text-sm text-gray-500 mt-2">
                      这可能需要几秒钟
                    </p>
                  </div>
                )}

                {/* 错误信息 */}
                {error && !searching && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
                    <p className="text-gray-300 mb-4">{error}</p>
                    <button
                      onClick={handleSearch}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
                    >
                      重新搜索
                    </button>
                  </div>
                )}

                {/* 搜索结果 */}
                {!searching && results.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-400">
                        找到 {results.length} 个播放源
                      </p>
                      <button
                        onClick={handleSearch}
                        className="text-sm text-red-500 hover:text-red-400 transition"
                      >
                        刷新搜索
                      </button>
                    </div>

                    {results.map((result, index) => (
                      <motion.div
                        key={`${result.source}-${result.id}-${index}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-gray-800/50 rounded-lg overflow-hidden hover:bg-gray-800 transition"
                      >
                        {/* 结果项 */}
                        <div className="flex items-center gap-4 p-3">
                          {/* 封面 */}
                          <div className="w-16 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-700">
                            {result.cover ? (
                              <img
                                src={result.cover}
                                alt={result.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "/placeholder-movie.jpg";
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Film className="w-6 h-6 text-gray-500" />
                              </div>
                            )}
                          </div>

                          {/* 信息 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-white font-medium truncate">
                                {result.title}
                              </h4>
                              <span
                                className={`px-2 py-0.5 rounded text-xs ${getTypeColor(
                                  result.type
                                )}`}
                              >
                                {result.type || "未知"}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                              {result.year && <span>{result.year}年</span>}
                              <span className="flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" />
                                {result.source_name}
                              </span>
                            </div>
                            {result.extra_data?.episodes && (
                              <p className="text-xs text-gray-500 mt-1">
                                共 {result.extra_data.episodes.length} 集
                              </p>
                            )}
                          </div>

                          {/* 播放按钮 */}
                          <button
                            onClick={() => handlePlay(result)}
                            disabled={selectedSource === result.source}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                              selectedSource === result.source
                                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                                : "bg-red-600 hover:bg-red-700 text-white"
                            }`}
                          >
                            <Play className="w-4 h-4" />
                            播放
                          </button>
                        </div>

                        {/* 展开详情（多集） */}
                        {result.extra_data?.episodes &&
                          result.extra_data.episodes.length > 0 && (
                            <div className="border-t border-gray-700">
                              <button
                                onClick={() =>
                                  setExpandedItem(
                                    expandedItem === `${result.source}-${index}`
                                      ? null
                                      : `${result.source}-${index}`
                                  )
                                }
                                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 transition"
                              >
                                <span>查看剧集</span>
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${
                                    expandedItem === `${result.source}-${index}`
                                      ? "rotate-180"
                                      : ""
                                  }`}
                                />
                              </button>

                              <AnimatePresence>
                                {expandedItem === `${result.source}-${index}` && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-3 grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                                      {result.extra_data.episodes.map(
                                        (ep) => (
                                          <button
                                            key={ep.id}
                                            onClick={() => {
                                              // 播放指定集数
                                              const playUrl = new URL(
                                                "/play/external",
                                                window.location.origin
                                              );
                                              playUrl.searchParams.set(
                                                "source",
                                                result.source
                                              );
                                              playUrl.searchParams.set(
                                                "url",
                                                ep.url
                                              );
                                              playUrl.searchParams.set(
                                                "title",
                                                `${result.title} - ${ep.title}`
                                              );
                                              if (movieId)
                                                playUrl.searchParams.set(
                                                  "movieId",
                                                  movieId
                                                );
                                              router.push(
                                                playUrl.pathname +
                                                  playUrl.search
                                              );
                                            }}
                                            className="px-2 py-1.5 bg-gray-700 hover:bg-red-600 text-white text-xs rounded transition truncate"
                                            title={ep.title}
                                          >
                                            {ep.title || `第${ep.episode_number}集`}
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* 底部提示 */}
              <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                <p className="text-xs text-gray-500 text-center">
                  💡 提示：视频源来自第三方网站，播放质量可能不稳定。如果某个源无法播放，请尝试其他源。
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
