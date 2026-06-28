/**
 * Netflix风格搜索框组件
 *
 * 功能：
 * - 点击搜索图标展开下拉搜索面板
 * - 搜索历史（localStorage存储）
 * - 热门搜索（带排名）
 * - 实时搜索建议
 * - ESC关闭
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Clock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MovieSuggestion {
  id: string;
  title: string;
  poster_url: string;
  year: number;
  rating: number;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // 搜索关键词
  const [keyword, setKeyword] = useState("");

  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // 热门搜索
  const [hotSearches, setHotSearches] = useState<string[]>([
    "肖申克的救赎",
    "千与千寻",
    "星际穿越",
    "泰坦尼克号",
    "盗梦空间",
  ]);

  // 搜索建议
  const [suggestions, setSuggestions] = useState<MovieSuggestion[]>([]);

  // 加载状态
  const [loading, setLoading] = useState(false);

  // 打开时加载搜索历史
  useEffect(() => {
    if (isOpen) {
      const history = JSON.parse(localStorage.getItem("searchHistory") || "[]");
      setSearchHistory(history);
      setKeyword("");
      setSuggestions([]);

      // 自动聚焦输入框
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // ESC关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // 搜索建议（防抖）
  useEffect(() => {
    if (!keyword.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSuggestions(keyword);
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword]);

  // 获取搜索建议
  const fetchSuggestions = async (query: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/movies/search?q=${encodeURIComponent(query)}&limit=8`
      );
      const data = await response.json();
      setSuggestions(data.movies || []);
    } catch (error) {
      console.error("获取搜索建议失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 保存搜索历史
  const saveToHistory = (term: string) => {
    const history = JSON.parse(localStorage.getItem("searchHistory") || "[]");
    const newHistory = [term, ...history.filter((h: string) => h !== term)].slice(0, 10);
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));
    setSearchHistory(newHistory);
  };

  // 清除搜索历史
  const clearHistory = () => {
    localStorage.removeItem("searchHistory");
    setSearchHistory([]);
  };

  // 执行搜索
  const handleSearch = (term: string) => {
    if (!term.trim()) return;
    saveToHistory(term);
    onClose();
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  // 回车搜索
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(keyword);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/60 z-[99]"
        onClick={onClose}
      />

      {/* 搜索面板 - 从右侧滑出 */}
      <div className="fixed top-0 right-0 w-[400px] h-full bg-black/60 backdrop-blur-xl z-[100] shadow-2xl overflow-y-auto border-l border-white/10">
        {/* 搜索栏 */}
        <div className="flex items-center gap-3 p-4 border-b border-[#2a2a2a]">
          <div className="flex-1 flex items-center gap-2 bg-[#2a2a2a] rounded-lg px-3 py-2">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索电影、纪录片..."
              className="flex-1 bg-transparent text-white outline-none placeholder-gray-500"
            />
            {keyword && (
              <button
                onClick={() => setKeyword("")}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm"
          >
            取消
          </button>
        </div>

        {/* 搜索建议 */}
        {keyword && suggestions.length > 0 && (
          <div className="p-4">
            <h3 className="text-gray-500 text-sm mb-3">搜索建议</h3>
            <div className="space-y-2">
              {suggestions.map((movie) => (
                <button
                  key={movie.id}
                  onClick={() => {
                    saveToHistory(keyword);
                    onClose();
                    router.push(`/movies/${movie.id}`);
                  }}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors text-left"
                >
                  <div className="w-10 h-14 bg-gray-700 rounded overflow-hidden flex-shrink-0">
                    {movie.poster_url && (
                      <img
                        src={movie.poster_url}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{movie.title}</p>
                    <p className="text-gray-500 text-xs">{movie.year}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 无搜索内容时显示历史和热门 */}
        {!keyword && (
          <div className="p-4">
            {/* 搜索历史 */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-medium">搜索历史</h3>
                {searchHistory.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="flex items-center gap-1 text-gray-500 text-sm hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除
                  </button>
                )}
              </div>

              {searchHistory.length > 0 ? (
                <div className="space-y-1">
                  {searchHistory.map((term, index) => (
                    <button
                      key={index}
                      onClick={() => handleSearch(term)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-gray-300 hover:bg-[#2a2a2a] rounded-lg transition-colors text-left"
                    >
                      <Clock className="w-4 h-4 text-gray-500" />
                      {term}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">没有搜索记录哦</p>
              )}
            </div>

            {/* 热门搜索 */}
            <div>
              <h3 className="text-white font-medium mb-3">热门搜索</h3>
              <div className="space-y-1">
                {hotSearches.map((term, index) => (
                  <button
                    key={index}
                    onClick={() => handleSearch(term)}
                    className="flex items-center gap-3 w-full px-3 py-2 text-gray-300 hover:bg-[#2a2a2a] rounded-lg transition-colors text-left"
                  >
                    <span
                      className={`w-5 h-5 flex items-center justify-center text-sm font-bold ${
                        index < 3 ? "text-red-500" : "text-gray-500"
                      }`}
                    >
                      {index + 1}
                    </span>
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
