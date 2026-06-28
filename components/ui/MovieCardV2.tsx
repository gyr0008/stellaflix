/**
 * MovieCardV2 - 现代科技感电影卡片
 *
 * 设计特点：
 * - 更大的卡片尺寸
 * - 3D 倾斜效果：鼠标悬停时卡片跟随鼠标倾斜
 * - 鼠标跟随发光：卡片背后有跟随鼠标的发光效果
 * - 光泽动画：卡片表面有流动的光泽效果
 * - 流畅的动画过渡
 * - 简洁的信息展示
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
    year: number;
    genre: string | string[];
    type?: string;
    description?: string;
  };
}

/**
 * MovieCardV2 组件 - 使用 React.memo 优化
 */
const MovieCardV2 = memo(function MovieCardV2({ movie }: MovieCardProps) {
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

  // 获取类型标签 - 使用 useMemo 缓存
  const genreTag = useMemo(() => {
    if (Array.isArray(movie.genre)) return movie.genre[0] || "";
    return movie.genre || "";
  }, [movie.genre]);

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
      <Link href={`/movies/${movie.id}`} className="block w-full h-full">
        <div className="relative w-full h-full">
          {/* 海报 */}
          {hasValidPoster && !imgError ? (
            <img
              src={movie.poster_url}
              alt={movie.title}
              className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
              onError={handleImgError}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0f] flex flex-col items-center justify-center">
              <Film className="w-16 h-16 text-gray-700 mb-2" />
              <span className="text-xs text-gray-500 text-center px-2 truncate max-w-full">{movie.title}</span>
            </div>
          )}

          {/* 发光边框 - 悬浮时显示 */}
          <div className="absolute inset-0 rounded-xl border border-white/0 group-hover:border-white/20 transition-all duration-500 pointer-events-none" />

          {/* 顶部渐变 */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* 类型标签 */}
          {genreTag && (
            <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-md text-[11px] text-white/90 font-medium tracking-wide opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-10">
              {genreTag}
            </div>
          )}

          {/* 播放按钮 - 居中 */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="w-16 h-16 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center transform scale-75 group-hover:scale-100 transition-all duration-300 shadow-2xl shadow-white/20">
              <Play className="w-7 h-7 text-black ml-1" fill="black" />
            </div>
          </div>

          {/* 底部渐变 */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/80 to-transparent" />

          {/* 底部信息 - 只保留电影名 */}
          <div className="absolute inset-x-0 bottom-0 p-4 translate-y-4 group-hover:translate-y-0 transition-all duration-300">
            <h3 className="text-white font-semibold text-base truncate">{movie.title}</h3>
          </div>
        </div>
      </Link>
    </TiltCard>
  );
});

export default MovieCardV2;
