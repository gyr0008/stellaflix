/**
 * 首页搜索栏组件
 * Netflix 风格的搜索框
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, Film, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  id: string;
  name: string;
  poster: string;
  year: string;
  type: string;
}

export default function HomeSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    setShowResults(true);

    try {
      const response = await fetch(
        `/api/video/search?wd=${encodeURIComponent(query)}`
      );
      const data = await response.json();

      if (data.success && data.results) {
        setResults(data.results.slice(0, 8));
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('搜索失败:', error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setQuery('');
    setIsFocused(false);

    // 跳转到电影详情页
    const detailUrl = new URL('/movies/detail', window.location.origin);
    detailUrl.searchParams.set('title', result.name);
    detailUrl.searchParams.set('year', result.year || '');
    detailUrl.searchParams.set('poster', result.poster || '');
    detailUrl.searchParams.set('type', result.type || '');
    router.push(detailUrl.pathname + detailUrl.search);
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* 搜索输入框 */}
      <div className={`flex items-center bg-black/70 border rounded-lg overflow-hidden transition-all ${isFocused ? 'border-white' : 'border-gray-600'}`}>
        <Search className="w-5 h-5 text-gray-400 ml-4" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setIsFocused(true); if (results.length > 0) setShowResults(true); }}
          onBlur={() => { setTimeout(() => { setIsFocused(false); setShowResults(false); }, 200); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索电影、电视剧..."
          className="flex-1 px-4 py-3 bg-transparent text-white placeholder-gray-400 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setShowResults(false); }}
            className="p-2 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-medium transition"
        >
          {searching ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            '搜索'
          )}
        </button>
      </div>

      {/* 搜索结果 */}
      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden z-50"
          >
            {searching ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin mx-auto mb-2" />
                <p className="text-gray-400">搜索中...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="max-h-[400px] overflow-y-auto">
                {results.map((result, index) => (
                  <button
                    key={`${result.id}-${index}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full flex items-center gap-4 p-3 hover:bg-gray-800 transition text-left"
                  >
                    {result.poster ? (
                      <img
                        src={result.poster}
                        alt={result.name}
                        className="w-12 h-16 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-16 bg-gray-700 rounded flex items-center justify-center">
                        <Film className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{result.name}</p>
                      <p className="text-gray-400 text-sm">{result.year} · {result.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <Film className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-400">未找到结果</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}