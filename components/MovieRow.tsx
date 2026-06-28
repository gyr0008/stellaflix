/**
 * 电影行组件
 * Netflix 风格的横向滚动电影列表
 * 支持24小时轮换内容（通过 section 参数指定分区）
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Movie {
  id: string;
  title: string;
  year: number;
  genre: string[];
  poster_url: string;
  rating: number;
  description?: string;
}

interface MovieRowProps {
  title: string;
  section: string; // movie_high, movie_hot, doc_high, doc_hot
  limit?: number;
}

export default function MovieRow({ title, section, limit = 10 }: MovieRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 海报加载失败时显示占位图的样式
  const posterFailedStyle = `
    .poster-failed .poster-fallback { opacity: 1 !important; }
    .poster-failed img { display: none !important; }
  `;
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [hoveredMovie, setHoveredMovie] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  // 从 featured API 获取电影数据（24小时轮换）
  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const res = await fetch(`/api/movies/featured?section=${section}&limit=${limit}`);
        const data = await res.json();
        if (data.movies) {
          setMovies(data.movies);
        }
      } catch (error) {
        console.error(`获取${title}数据失败:`, error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, [section, title, limit]);

  // 检查滚动状态
  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [movies]);

  // 滚动
  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 600;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(checkScroll, 300);
  };

  // 加载中
  if (loading) {
    return (
      <div className="relative group py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        </div>
      </div>
    );
  }

  // 无数据
  if (movies.length === 0) {
    return null;
  }

  return (
    <div className="relative group py-6">
      {/* 海报加载失败样式 */}
      <style dangerouslySetInnerHTML={{ __html: posterFailedStyle }} />

      {/* 标题 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>

      {/* 电影列表容器 */}
      <div className="relative">
        {/* 左箭头 */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/70 hover:bg-black/90 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* 电影列表 */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {movies.map((movie, index) => (
            <div
              key={`${movie.id}-${index}`}
              className="flex-shrink-0 w-[200px] md:w-[240px] relative group/item"
              onMouseEnter={() => setHoveredMovie(movie.id)}
              onMouseLeave={() => setHoveredMovie(null)}
            >
              {/* 海报 */}
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden cursor-pointer bg-[#1a1a24]">
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover/item:scale-110"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    // 使用SVG内联占位图，避免依赖外部文件
                    target.style.display = 'none';
                    target.parentElement?.classList.add('poster-failed');
                  }}
                />
                {/* 海报加载失败时的占位内容 */}
                <div className="poster-fallback absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a24] opacity-0">
                  <svg className="w-12 h-12 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-gray-500 text-center px-2 truncate max-w-full">{movie.title}</span>
                </div>

                {/* 悬停遮罩 */}
                <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity duration-300 ${hoveredMovie === movie.id ? 'opacity-100' : 'opacity-0'}`}>
                  <Link
                    href={`/movies/detail?id=${movie.id}`}
                    className="p-4 bg-red-600 rounded-full hover:bg-red-700 transition transform hover:scale-110"
                  >
                    <Play className="w-8 h-8 text-white" fill="white" />
                  </Link>
                </div>

                {/* 评分 - 左下角 */}
                {movie.rating > 0 && (
                  <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded flex items-center gap-1">
                    <span className="text-yellow-400 text-sm">★</span>
                    <span className="text-white text-sm font-bold">{movie.rating.toFixed(1)}</span>
                  </div>
                )}

                {/* 类型标签 - 右上角 */}
                {movie.genre && movie.genre.length > 0 && (
                  <span className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded">
                    {movie.genre[0]}
                  </span>
                )}
              </div>

              {/* 信息 */}
              <div className="mt-3">
                <h3 className="text-white font-medium truncate">{movie.title}</h3>
                <p className="text-gray-400 text-sm truncate">{movie.year}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 右箭头 */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/70 hover:bg-black/90 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
