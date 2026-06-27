/**
 * 4K 内容测试页面
 *
 * 路径：/admin/test-4k
 *
 * 功能：
 * 1. 测试所有 CMS 源的 4K 内容可用性
 * 2. 搜索指定电影的 4K 版本
 */

'use client';

import { useState } from 'react';

/** 测试结果类型 */
interface TestResult {
  name: string;
  status: 'ok' | 'error' | 'timeout';
  totalResults: number;
  hdResults: number;
  hdPercentage: string;
  sampleHdTitles: string[];
  error?: string;
  responseTime: number;
}

/** 搜索结果类型 */
interface SearchResult {
  source: string;
  vod_name: string;
  vod_pic: string;
  vod_year: string;
  isHD: boolean;
  hdType: string[];
  vod_play_from: string;
}

export default function Test4KPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  /** 测试所有源 */
  const runTest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-4k');
      const data = await res.json();
      setTestResults(data.results);
    } catch (err) {
      console.error('测试失败:', err);
    }
    setLoading(false);
  };

  /** 搜索 4K 内容 */
  const search4K = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search-4k?query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.hdResults || []);
    } catch (err) {
      console.error('搜索失败:', err);
    }
    setSearchLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">🎬 4K 内容测试</h1>

      {/* 测试所有源 */}
      <section className="mb-12">
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-xl font-semibold">CMS 源 4K 测试</h2>
          <button
            onClick={runTest}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '测试中...' : '开始测试'}
          </button>
        </div>

        {testResults.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {testResults.map((r) => (
              <div
                key={r.name}
                className={`p-4 rounded-lg border ${
                  r.status === 'ok'
                    ? r.hdResults > 0
                      ? 'border-green-500 bg-green-900/20'
                      : 'border-yellow-500 bg-yellow-900/20'
                    : 'border-red-500 bg-red-900/20'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold">{r.name}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      r.status === 'ok'
                        ? 'bg-green-600'
                        : 'bg-red-600'
                    }`}
                  >
                    {r.status === 'ok' ? '✓ 可用' : r.status === 'timeout' ? '⏰ 超时' : '✗ 错误'}
                  </span>
                </div>

                {r.status === 'ok' ? (
                  <>
                    <div className="text-sm text-gray-300 mb-2">
                      总资源: {r.totalResults} | 4K: {r.hdResults} ({r.hdPercentage})
                    </div>
                    {r.sampleHdTitles.length > 0 && (
                      <div className="text-xs text-gray-400">
                        <div className="mb-1">4K 样本：</div>
                        {r.sampleHdTitles.map((title, i) => (
                          <div key={i} className="truncate">• {title}</div>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      响应: {r.responseTime}ms
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-red-300">{r.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 搜索特定电影 */}
      <section>
        <h2 className="text-xl font-semibold mb-4">🔍 搜索电影 4K 版本</h2>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search4K()}
            placeholder="输入电影名，如：流浪地球"
            className="flex-1 px-4 py-2 bg-gray-800 rounded border border-gray-600 focus:border-blue-500 outline-none"
          />
          <button
            onClick={search4K}
            disabled={searchLoading}
            className="px-6 py-2 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {searchLoading ? '搜索中...' : '搜索'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {searchResults.map((r, i) => (
              <div
                key={i}
                className="p-4 bg-gray-800 rounded-lg border border-gray-700"
              >
                <div className="flex gap-3">
                  {r.vod_pic && (
                    <img
                      src={r.vod_pic}
                      alt={r.vod_name}
                      className="w-20 h-28 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <div className="font-bold mb-1">{r.vod_name}</div>
                    <div className="text-sm text-gray-400 mb-2">
                      {r.vod_year} | {r.source}
                    </div>
                    {r.isHD && (
                      <div className="flex gap-1 flex-wrap">
                        {r.hdType.map((t) => (
                          <span
                            key={t}
                            className="text-xs px-2 py-1 bg-yellow-600 rounded"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      播放源: {r.vod_play_from}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {searchQuery && searchResults.length === 0 && !searchLoading && (
          <div className="text-gray-400 text-center py-8">
            未找到 4K 版本，试试其他电影？
          </div>
        )}
      </section>
    </div>
  );
}
