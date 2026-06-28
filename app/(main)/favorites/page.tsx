/**
 * 收藏页面
 *
 * 用途: 显示用户收藏的电影列表
 * 依赖:
 *   - lucide-react: 图标组件
 *   - next/link: 路由链接
 * 架构: 使用 localStorage 存储收藏数据
 *
 * 功能:
 * - 加载并显示收藏列表
 * - 支持取消收藏
 * - 按添加时间倒序排列
 * - 页面重新可见时自动刷新
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, Play, Trash2, Loader2, Film, RefreshCw } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

/**
 * 收藏电影数据结构
 */
interface FavoriteMovie {
  /** 电影 ID */
  id: string;
  /** 电影标题 */
  title: string;
  /** 海报 URL */
  poster_url: string;
  /** 评分 */
  rating: number;
  /** 年份 */
  year: number;
  /** 添加时间戳 */
  addedAt: number;
}

// ============================================
// 常量配置
// ============================================

/** localStorage key */
const STORAGE_KEY = 'stellaflix_favorites';

// ============================================
// 组件实现
// ============================================

/**
 * 收藏页面组件
 *
 * 做什么: 渲染用户收藏的电影列表
 * 返回值: JSX 元素
 */
export default function FavoritesPage() {
  /** 收藏列表 */
  const [favorites, setFavorites] = useState<FavoriteMovie[]>([]);

  /** 加载状态 */
  const [loading, setLoading] = useState(true);

  /**
   * 加载收藏列表
   * 做什么: 从 localStorage 读取并设置收藏数据
   */
  const loadFavorites = () => {
    try {
      setLoading(true);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 按添加时间倒序排列
        parsed.sort((a: FavoriteMovie, b: FavoriteMovie) => b.addedAt - a.addedAt);
        setFavorites(parsed);
      } else {
        setFavorites([]);
      }
    } catch (error) {
      console.error('加载收藏失败:', error);
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 初始化和监听页面可见性
   */
  useEffect(() => {
    loadFavorites();

    // 监听页面可见性变化，当页面重新可见时刷新数据
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadFavorites();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  /**
   * 移除收藏
   * 做什么: 从收藏列表中移除指定电影
   * 参数:
   *   - id: 要移除的电影 ID
   */
  const removeFavorite = (id: string) => {
    const updated = favorites.filter(f => f.id !== id);
    setFavorites(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // 加载中状态
  if (loading) {
    return (
      <div className="min-h-screen bg-[#181818] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#181818] pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-red-600" fill="currentColor" />
            <h1 className="text-3xl font-bold text-white">我的收藏</h1>
            <span className="text-gray-400">({favorites.length})</span>
          </div>
          <button
            onClick={loadFavorites}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        {/* 收藏列表 */}
        {favorites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {favorites.map((movie) => (
              <FavoriteCard
                key={movie.id}
                movie={movie}
                onRemove={removeFavorite}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 子组件
// ============================================

/**
 * 空状态组件
 *
 * 做什么: 显示无收藏时的提示界面
 */
function EmptyState() {
  return (
    <div className="text-center py-16">
      <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <h2 className="text-xl text-gray-400 mb-2">暂无收藏</h2>
      <p className="text-gray-500 mb-6">去首页看看有什么好电影吧</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition"
      >
        浏览电影
      </Link>
    </div>
  );
}

/**
 * 收藏卡片组件
 *
 * 做什么: 渲染单个收藏电影卡片
 * 参数:
 *   - movie: 电影数据
 *   - onRemove: 移除收藏的回调函数
 */
function FavoriteCard({ movie, onRemove }: { movie: FavoriteMovie; onRemove: (id: string) => void }) {
  return (
    <div className="relative group">
      <Link href={`/movies/detail?id=${movie.id}`}>
        <div className="aspect-[2/3] rounded-lg overflow-hidden">
          {movie.poster_url ? (
            <img
              src={movie.poster_url}
              alt={movie.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/placeholder-movie.jpg';
              }}
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              <Film className="w-12 h-12 text-gray-600" />
            </div>
          )}
          {/* 悬停遮罩 */}
          <div className="absolute inset-0 bg-[#181818]/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="p-3 bg-red-600 rounded-full">
              <Play className="w-6 h-6 text-white" fill="white" />
            </div>
          </div>
          {/* 评分 */}
          {movie.rating > 0 && (
            <div className="absolute bottom-2 left-2 bg-[#181818]/70 px-2 py-1 rounded flex items-center gap-1">
              <span className="text-yellow-400 text-xs">★</span>
              <span className="text-white text-xs font-bold">{movie.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </Link>

      {/* 信息 */}
      <div className="mt-2 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-white text-sm font-medium truncate">{movie.title}</h3>
          <p className="text-gray-400 text-xs">{movie.year}</p>
        </div>
        {/* 删除按钮 */}
        <button
          onClick={() => onRemove(movie.id)}
          className="p-1 text-gray-500 hover:text-red-500 transition"
          title="取消收藏"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
