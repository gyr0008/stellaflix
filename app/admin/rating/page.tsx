/**
 * 评分管理页面
 *
 * 用于管理和更新电影评分
 */

'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Database, Star, TrendingUp, Loader2 } from 'lucide-react';

interface RatingStats {
  totalMovies: number;
  ratedMovies: number;
  highQualityMovies: number;
  unratedMovies: number;
}

interface UpdateResult {
  movieId: string;
  title: string;
  averageRating: number;
  ratingCount: number;
  sources: Array<{
    source: string;
    rating: number;
    ratingCount: number;
  }>;
}

export default function RatingAdminPage() {
  const [stats, setStats] = useState<RatingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [movieId, setMovieId] = useState('');
  const [movieTitle, setMovieTitle] = useState('');

  // 获取评分统计
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/scraper/rating');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('获取统计失败:', error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // 更新单部电影评分
  const handleUpdateSingle = async () => {
    if (!movieId || !movieTitle) {
      setResult('请填写电影ID和名称');
      return;
    }

    setLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/scraper/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieId,
          title: movieTitle,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const r = data.data as UpdateResult;
        setResult(
          `✅ 更新成功！\n` +
          `电影: ${r.title}\n` +
          `综合评分: ${r.averageRating} (${r.ratingCount}人评)\n` +
          `来源: ${r.sources.map(s => `${s.source} ${s.rating}`).join(', ')}`
        );
        fetchStats();
      } else {
        setResult(`❌ 更新失败: ${data.error}`);
      }
    } catch (error) {
      setResult(`❌ 请求失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // 批量更新
  const handleBatchUpdate = async () => {
    setBatchLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/scraper/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: true,
          limit: 20,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(`✅ ${data.message}\n请查看服务器日志了解进度`);
      } else {
        setResult(`❌ 批量更新失败: ${data.error}`);
      }
    } catch (error) {
      setResult(`❌ 请求失败: ${error}`);
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Star className="w-8 h-8 text-yellow-400" />
          评分管理
        </h1>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <Database className="w-4 h-4" />
              <span className="text-sm">总电影数</span>
            </div>
            <div className="text-2xl font-bold">{stats?.totalMovies || 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-sm">已评分</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400">{stats?.ratedMovies || 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-sm">高分电影</span>
            </div>
            <div className="text-2xl font-bold text-green-400">{stats?.highQualityMovies || 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <RefreshCw className="w-4 h-4 text-red-400" />
              <span className="text-sm">待评分</span>
            </div>
            <div className="text-2xl font-bold text-red-400">{stats?.unratedMovies || 0}</div>
          </div>
        </div>

        {/* 单部更新 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">单部电影评分更新</h2>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              placeholder="电影ID"
              value={movieId}
              onChange={(e) => setMovieId(e.target.value)}
              className="flex-1 bg-gray-700 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <input
              type="text"
              placeholder="电影名称"
              value={movieTitle}
              onChange={(e) => setMovieTitle(e.target.value)}
              className="flex-1 bg-gray-700 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              onClick={handleUpdateSingle}
              disabled={loading}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  更新中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  更新评分
                </>
              )}
            </button>
          </div>
        </div>

        {/* 批量更新 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">批量评分更新</h2>
          <p className="text-gray-400 mb-4">
            将为数据库中所有未评分的电影获取评分（每部电影间隔2秒，避免被封）
          </p>
          <button
            onClick={handleBatchUpdate}
            disabled={batchLoading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {batchLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                开始批量更新
              </>
            )}
          </button>
        </div>

        {/* 结果显示 */}
        {result && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">执行结果</h2>
            <pre className="whitespace-pre-wrap text-gray-300 font-mono text-sm">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
