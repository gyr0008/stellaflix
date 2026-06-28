/**
 * NetflixGC 测试页面
 *
 * 路径：/admin/netflixgc-test
 *
 * 功能：
 * 1. 浏览 NetflixGC 视频列表
 * 2. 按类型筛选（电影、连续剧、纪录片）
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/** 视频项类型 */
interface VideoItem {
  id: number;
  title: string;
  poster: string;
  description: string;
  status: string;
  actors: string;
  doubanScore: string;
  detailUrl: string;
}

export default function NetflixGCTestPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);

  /** 加载视频列表 */
  const loadVideos = async (videoType: string, pageNum: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/netflixgc/search?type=${videoType}&page=${pageNum}`);
      const data = await res.json();

      if (data.success) {
        setVideos(data.results);
      }
    } catch (err) {
      console.error('加载失败:', err);
    } finally {
      setLoading(false);
    }
  };

  /** 初始加载 */
  useEffect(() => {
    loadVideos(type, page);
  }, [type, page]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">🎬 NetflixGC 测试</h1>

      {/* 类型筛选 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">视频类型</h2>
        <div className="flex gap-4">
          {[
            { key: 'all', label: '全部' },
            { key: 'movie', label: '电影' },
            { key: 'tv', label: '连续剧' },
            { key: 'documentary', label: '纪录片' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => { setType(item.key); setPage(1); }}
              className={`px-4 py-2 rounded ${
                type === item.key
                  ? 'bg-blue-600'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* 分页 */}
      <section className="mb-6 flex items-center gap-4">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50"
        >
          上一页
        </button>
        <span>第 {page} 页</span>
        <button
          onClick={() => setPage(p => p + 1)}
          className="px-4 py-2 bg-gray-700 rounded"
        >
          下一页
        </button>
      </section>

      {/* 视频列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">加载中...</p>
        </div>
      ) : (
        <section>
          <h2 className="text-xl font-semibold mb-4">
            视频列表（{videos.length} 个）
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {videos.map((video) => (
              <div
                key={video.id}
                className="bg-gray-800 rounded-lg overflow-hidden"
              >
                {video.poster && (
                  <img
                    src={video.poster}
                    alt={video.title}
                    className="w-full h-48 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="p-4">
                  <h3 className="font-bold mb-1 truncate">{video.title}</h3>
                  <div className="text-sm text-gray-400 mb-2">
                    {video.status}
                    {video.doubanScore !== '0' && (
                      <span className="ml-2 text-yellow-400">
                        ⭐ {video.doubanScore}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {video.description}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-600">ID: {video.id}</span>
                    <Link
                      href={`/netflixgc/play?id=${video.id}&title=${encodeURIComponent(video.title)}`}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                    >
                      播放
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
