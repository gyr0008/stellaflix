/**
 * NetflixGC 索引管理页面
 *
 * 路径：/admin/netflixgc-index
 *
 * 功能：
 * 1. 查看索引状态
 * 2. 重建索引
 * 3. 测试搜索
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/** 索引状态 */
interface IndexStats {
  total: number;
  lastUpdate: string;
  isStale: boolean;
}

/** 搜索结果 */
interface SearchResult {
  id: number;
  title: string;
  poster: string;
  description: string;
  actors: string;
  doubanScore: string;
  keywords: string[];
}

export default function NetflixGCIndexPage() {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** 获取索引状态 */
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/netflixgc/index');
      const data = await res.json();
      if (data.success) {
        setStats({
          total: data.total,
          lastUpdate: data.lastUpdate,
          isStale: data.isStale,
        });
      }
    } catch (error) {
      console.error('获取索引状态失败:', error);
    }
  };

  /** 初始加载 */
  useEffect(() => {
    fetchStats();
  }, []);

  /** 重建索引 */
  const handleRebuild = async () => {
    setRebuilding(true);
    setMessage(null);

    try {
      const res = await fetch('/api/netflixgc/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rebuild' }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage(`索引重建完成！共 ${data.total} 个视频`);
        setStats({
          total: data.total,
          lastUpdate: data.lastUpdate,
          isStale: false,
        });
      } else {
        setMessage(`重建失败: ${data.error}`);
      }
    } catch (error) {
      setMessage('网络请求失败');
    } finally {
      setRebuilding(false);
    }
  };

  /** 测试搜索 */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);

    try {
      const res = await fetch('/api/netflixgc/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', keyword: searchQuery }),
      });

      const data = await res.json();

      if (data.success) {
        setSearchResults(data.results);
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* 标题 */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/netflixgc-test"
            className="text-gray-400 hover:text-white transition"
          >
            ← 返回
          </Link>
          <h1 className="text-3xl font-bold">📚 NetflixGC 索引管理</h1>
        </div>

        {/* 索引状态 */}
        <section className="mb-8 p-6 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">索引状态</h2>

          {stats ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-700 rounded">
                <div className="text-3xl font-bold text-blue-400">{stats.total}</div>
                <div className="text-sm text-gray-400">视频数量</div>
              </div>
              <div className="text-center p-4 bg-gray-700 rounded">
                <div className={`text-3xl font-bold ${stats.isStale ? 'text-yellow-400' : 'text-green-400'}`}>
                  {stats.isStale ? '过期' : '有效'}
                </div>
                <div className="text-sm text-gray-400">索引状态</div>
              </div>
              <div className="text-center p-4 bg-gray-700 rounded">
                <div className="text-lg font-bold text-gray-300">
                  {stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleString() : '未知'}
                </div>
                <div className="text-sm text-gray-400">最后更新</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-400">加载中...</div>
          )}

          {/* 重建按钮 */}
          <div className="mt-6">
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition"
            >
              {rebuilding ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  重建中...
                </span>
              ) : (
                '🔄 重建索引'
              )}
            </button>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className="mt-4 p-3 bg-gray-700 rounded text-center">
              {message}
            </div>
          )}
        </section>

        {/* 测试搜索 */}
        <section className="mb-8 p-6 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">测试搜索</h2>

          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入搜索关键词"
              className="flex-1 px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded transition"
            >
              {searchLoading ? '搜索中...' : '搜索'}
            </button>
          </div>

          {/* 搜索结果 */}
          {searchResults.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm text-gray-400">
                找到 {searchResults.length} 个结果
              </div>
              {searchResults.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 p-3 bg-gray-700 rounded"
                >
                  {item.poster && (
                    <img
                      src={item.poster}
                      alt={item.title}
                      className="w-16 h-22 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {item.description?.substring(0, 100)}...
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      ID: {item.id} | 评分: {item.doubanScore}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 快捷链接 */}
        <section className="p-6 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">快捷操作</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/admin/netflixgc-test"
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-center"
            >
              🎬 浏览视频列表
            </Link>
            <Link
              href="/netflixgc/play?id=118539&title=火玫瑰1992"
              className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-center"
            >
              ▶️ 测试播放
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
