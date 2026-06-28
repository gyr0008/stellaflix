/**
 * 电影卡片组件
 *
 * 用途: 展示单个电影的海报、标题、评分等信息
 * 参数:
 *   - movie: 电影数据对象
 * 返回值: JSX 元素
 *
 * 效果：
 * - 3D 倾斜效果：鼠标悬停时卡片跟随鼠标倾斜
 * - 鼠标跟随发光：卡片背后有跟随鼠标的发光效果
 * - 光泽动画：卡片表面有流动的光泽效果
 *
 * 性能优化：
 * - 使用 React.memo 避免不必要的重渲染
 * - 使用 useCallback 缓存事件处理函数
 * - 使用 useMemo 缓存计算结果
 */

"use client";

import { useState, useCallback, useMemo, memo } from "react";
import Link from "next/link";
import { Star, Play, Film } from "lucide-react";
import TiltCard from "@/components/ui/TiltCard";

interface MovieCardProps {
  movie: {
    id: string;
    title: string;
    poster_url: string;
    rating: number;
    year: number | string;
    genre: string | string[];
    description?: string;
  };
}

/**
 * 电影卡片组件 - 使用 React.memo 优化
 */
const MovieCard = memo(function MovieCard({ movie }: MovieCardProps) {
  // 图片加载状态
  const [imgError, setImgError] = useState(false);

  /** 图片加载失败处理 - 使用 useCallback 缓存 */
  const handleImgError = useCallback(() => {
    setImgError(true);
  }, []);

  // 检查图片 URL 是否有效 - 使用 useMemo 缓存
  const hasValidPoster = useMemo(() => {
    return movie.poster_url &&
      !movie.poster_url.includes('image.tmdb.org') &&
      (movie.poster_url.startsWith('http') || movie.poster_url.startsWith('/images'));
  }, [movie.poster_url]);

  return (
    <TiltCard
      enableTilt={true}
      behindGlowEnabled={true}
      behindGlowColor="rgba(229, 9, 20, 0.5)"
      behindGlowSize="60%"
      innerGradient="linear-gradient(145deg, rgba(229, 9, 20, 0.1) 0%, rgba(0, 0, 0, 0.95) 100%)"
      maxWidth="100%"
      aspectRatio="0.667"
      className="group"
    >
      <Link href={`/movies/detail?id=${movie.id}`} className="block w-full h-full">
        <div className="relative w-full h-full">
          {/* 海报图片 */}
          {hasValidPoster && !imgError ? (
            <img
              src={movie.poster_url}
              alt={movie.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={handleImgError}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-[#1a1a24] flex items-center justify-center">
              <Film className="w-12 h-12 text-gray-600" />
              <span className="absolute bottom-2 text-xs text-gray-500 truncate px-2 max-w-full">{movie.title}</span>
            </div>
          )}

          {/* 悬停遮罩 - 奈飞风格 */}
          <div className="absolute inset-0 bg-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300 shadow-lg">
              <Play className="w-6 h-6 text-black ml-0.5" fill="black" />
            </div>
          </div>

          {/* 评分标签 */}
          {movie.rating > 0 && (
            <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 rounded-lg flex items-center gap-1 backdrop-blur-sm z-10">
              <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
              <span className="text-yellow-400 text-xs font-medium">{movie.rating.toFixed(1)}</span>
            </div>
          )}

          {/* 底部渐变 */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black via-black/60 to-transparent" />

          {/* 信息区域 - 电影名 */}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <h3 className="text-white font-medium text-sm truncate group-hover:text-red-400 transition-colors">
              {movie.title}
            </h3>
          </div>
        </div>
      </Link>
    </TiltCard>
  );
});

export default MovieCard;
