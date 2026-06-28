/**
 * 收藏按钮组件
 *
 * 使用 localStorage 存储收藏数据，无需登录
 */

"use client";

import { useState, useEffect } from "react";
import { Heart } from "lucide-react";

interface FavoriteButtonProps {
  movieId: string;
  movieTitle?: string;
  posterUrl?: string;
  rating?: number;
  year?: number;
  onToggle?: (isFavorite: boolean) => void;
}

export default function FavoriteButton({
  movieId,
  movieTitle = "",
  posterUrl = "",
  rating = 0,
  year = 0,
  onToggle,
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

  // 检查是否已收藏
  useEffect(() => {
    try {
      const favorites = JSON.parse(localStorage.getItem('stellaflix_favorites') || '[]');
      setIsFavorite(favorites.some((f: any) => f.id === movieId));
    } catch (error) {
      console.error('检查收藏状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, [movieId]);

  // 切换收藏状态
  const toggle = () => {
    try {
      const stored = localStorage.getItem('stellaflix_favorites');
      const favorites = stored ? JSON.parse(stored) : [];

      if (isFavorite) {
        // 取消收藏
        const updated = favorites.filter((f: any) => f.id !== movieId);
        localStorage.setItem('stellaflix_favorites', JSON.stringify(updated));
        setIsFavorite(false);
        onToggle?.(false);
      } else {
        // 添加收藏
        const newFavorite = {
          id: movieId,
          title: movieTitle,
          poster_url: posterUrl,
          rating: rating,
          year: year,
          addedAt: Date.now(),
        };
        favorites.push(newFavorite);
        localStorage.setItem('stellaflix_favorites', JSON.stringify(favorites));
        setIsFavorite(true);
        onToggle?.(true);
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="w-10 h-10 rounded-full bg-gray-800 animate-pulse" />
    );
  }

  return (
    <button
      onClick={toggle}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
        isFavorite
          ? "bg-red-600 text-white hover:bg-red-700"
          : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
      }`}
      aria-label={isFavorite ? "取消收藏" : "收藏"}
    >
      <Heart className="w-5 h-5" fill={isFavorite ? "currentColor" : "none"} />
    </button>
  );
}
