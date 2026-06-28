"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, ExternalLink, Film, X, ChevronDown, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    episodes?: Array<{ id: string; title: string; url: string; episode_number: number }>;
  };
}

interface VideoSourceSearchProps {
  movieTitle: string;
  movieYear?: number;
  movieId?: string;
  onPlay?: (source: SearchResult) => void;
}

/**
 * 获取类型标签颜色
 */
function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    电影: "bg-blue-500/20 text-blue-400", movie: "bg-blue-500/20 text-blue-400",
    电视剧: "bg-purple-500/20 text-purple-400", tv: "bg-purple-500/20 text-purple-400",
    动漫: "bg-pink-500/20 text-pink-400", animation: "bg-pink-500/20 text-pink-400",
    纪录片: "bg-green-500/20 text-green-400", documentary: "bg-green-500/20 text-green-400",
  };
  return colors[type?.toLowerCase()] || "bg-gray-500/20 text-gray-400";
}

/**
 * 解析视频URL
 */
function parseVideoUrl(url: string): string {
  if (url.includes('.m3u8')) return url;
  if (url.includes('$')) return url.split('$').pop() || url;
  return url;
}

/**
 * 搜索结果项组件
 */
function SearchResultItem({
  result,
  index,
  selectedSource,
  expandedItem,
  onPlay,
  onToggleExpand,
}: {
  result: SearchResult;
  index: number;
  selectedSource: string | null;
  expandedItem: string | null;
  onPlay: (r: SearchResult) => void;
  onToggleExpand: (key: string) => void;
}) {
  const router = useRouter();
  const isExpanded = expandedItem === `${result.source}-${index}`;
  const isSelected = selectedSource === result.source;

  const handlePlayEpisode = (ep: { url: string; title: string }) => {
    const playUrl = new URL("/play/external", window.location.origin);
    playUrl.searchParams.set("source", result.source);
    playUrl.searchParams.set("url", ep.url);
    playUrl.searchParams.set("title", `${result.title} - ${ep.title}`);
    router.push(playUrl.pathname + playUrl.search);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-gray-800/50 rounded-lg overflow-hidden hover:bg-gray-800 transition"
    >
      <div className="flex items-center gap-4 p-3">
        <div className="w-16 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-700">
          {result.cover ? (
            <img src={result.cover} alt={result.title} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-movie.jpg"; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-6 h-6 text-gray-500" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-white font-medium truncate">{result.title}</h4>
            <span className={`px-2 py-0.5 rounded text-xs ${getTypeColor(result.type)}`}>
              {result.type || "未知"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
            {result.year && <span>{result.year}年</span>}
            <span className="flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />{result.source_name}
            </span>
          </div>
          {result.extra_data?.episodes && (
            <p className="text-xs text-gray-500 mt-1">共 {result.extra_data.episodes.length} 集</p>
          )}
        </div>

        <button
          onClick={() => onPlay(result)}
          disabled={isSelected}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
            isSelected ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 text-white"
          }`}
        >
          <Play className="w-4 h-4" />播放
        </button>
      </div>

      {result.extra_data?.episodes && result.extra_data.episodes.length > 0 && (
        <div className="border-t border-gray-700">
          <button
            onClick={() => onToggleExpand(`${result.source}-${index}`)}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 transition"
          >
            <span>查看剧集</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="p-3 grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                  {result.extra_data.episodes.map((ep) => (
                    <button key={ep.id} onClick={() => handlePlayEpisode(ep)}
                      className="px-2 py-1.5 bg-gray-700 hover:bg-red-600 text-white text-xs rounded transition truncate"
                      title={ep.title}>
                      {ep.title || `第${ep.episode_number}集`}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

export default function VideoSourceSearch({ movieTitle, movieYear, movieId, onPlay }: VideoSourceSearchProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const handleSearch = async () => {
    setSearching(true);
    setError("");
    setResults([]);

    try {
      const response = await fetch(`/api/video/search?wd=${encodeURIComponent(movieTitle)}`);
      const data = await response.json();

      if (data.success && data.results) {
        setResults(data.results.map((item: any) => ({
          id: item.id.toString(),
          title: item.name,
          cover: item.poster,
          year: parseInt(item.year) || 0,
          type: item.type,
          source: data.source,
          source_name: data.source,
          url: item.playUrl,
          extra_data: {
            episodes: item.playUrl.split('#').map((url: string, index: number) => {
              const [name, playUrl] = url.split('$');
              return { id: `${item.id}-${index}`, title: name || `第${index + 1}集`, url: playUrl || url, episode_number: index + 1 };
            }),
          },
        })));
      } else {
        setError(data.error || "未找到可用的播放源");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索视频源失败");
    } finally {
      setSearching(false);
    }
  };

  const handlePlay = (result: SearchResult) => {
    setSelectedSource(result.source);
    if (onPlay) { onPlay(result); return; }

    const playUrl = new URL("/play", window.location.origin);
    playUrl.searchParams.set("url", parseVideoUrl(result.url));
    playUrl.searchParams.set("title", result.title);
    playUrl.searchParams.set("source", result.source);
    router.push(playUrl.pathname + playUrl.search);
  };

  return (
    <>
      <button
        onClick={() => { setIsOpen(true); if (results.length === 0 && !searching) handleSearch(); }}
        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
      >
        <Play className="w-5 h-5" />搜索播放源
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl max-h-[80vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}>

              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <Film className="w-6 h-6 text-red-500" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">搜索播放源</h3>
                    <p className="text-sm text-gray-400">{movieTitle} {movieYear ? `(${movieYear})` : ""}</p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-800 rounded-lg transition">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="overflow-y-auto p-4" style={{ maxHeight: "60vh" }}>
                {searching && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-4" />
                    <p className="text-gray-400">正在搜索多个视频源...</p>
                    <p className="text-sm text-gray-500 mt-2">这可能需要几秒钟</p>
                  </div>
                )}

                {error && !searching && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
                    <p className="text-gray-300 mb-4">{error}</p>
                    <button onClick={handleSearch} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition">
                      重新搜索
                    </button>
                  </div>
                )}

                {!searching && results.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-400">找到 {results.length} 个播放源</p>
                      <button onClick={handleSearch} className="text-sm text-red-500 hover:text-red-400 transition">
                        刷新搜索
                      </button>
                    </div>
                    {results.map((result, index) => (
                      <SearchResultItem key={`${result.source}-${result.id}-${index}`}
                        result={result} index={index} selectedSource={selectedSource}
                        expandedItem={expandedItem} onPlay={handlePlay}
                        onToggleExpand={(key) => setExpandedItem(expandedItem === key ? null : key)} />
                    ))}
                  </div>
                )}
              </div>

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
