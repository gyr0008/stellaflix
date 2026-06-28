/**
 * 电影详情页
 *
 * 1:1 复刻奈飞工厂设计
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Star, Loader2, Film, Share2, Bookmark, ArrowUpDown, RefreshCw } from 'lucide-react';
import VideoPlayer from '@/components/VideoPlayer';
import FavoriteButton from '@/components/FavoriteButton';
import { cleanDescription } from '@/lib/html-utils';

interface MovieInfo {
  id: string;
  title: string;
  poster_url: string;
  backdrop_url: string;
  rating: number;
  rating_count: number;
  year: number;
  genre: string[];
  description: string;
  type: string;
  director?: string;
  cast_members?: string[];
  country?: string;
}

interface VideoSource {
  id: string;
  name: string;
  year: string;
  area: string;
  type: string;
  poster: string;
  description: string;
  playUrl: string;
  playFrom: string;
}

function MovieDetailContent() {
  const searchParams = useSearchParams();
  const movieId = searchParams.get('id') || '';

  const [movie, setMovie] = useState<MovieInfo | null>(null);
  const [loadingMovie, setLoadingMovie] = useState(true);
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [currentSource, setCurrentSource] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [updatingDescription, setUpdatingDescription] = useState(false);
  const [descriptionSource, setDescriptionSource] = useState<string | null>(null);
  const [showDoubanInput, setShowDoubanInput] = useState(false);
  const [doubanUrl, setDoubanUrl] = useState('');

  // 获取电影信息
  useEffect(() => {
    if (!movieId) {
      setLoadingMovie(false);
      return;
    }

    const fetchMovie = async () => {
      try {
        const res = await fetch(`/api/movies/${movieId}`);
        const data = await res.json();
        if (data) setMovie(data);
      } catch (err) {
        console.error('获取电影信息失败:', err);
      } finally {
        setLoadingMovie(false);
      }
    };

    fetchMovie();
  }, [movieId]);

  // 记录观看历史
  const addToHistory = () => {
    if (!movie) return;
    const history = JSON.parse(localStorage.getItem('stellaflix_history') || '[]');
    const today = new Date().toISOString().split('T')[0];
    const existingIndex = history.findIndex((h: any) => {
      const recordDate = new Date(h.watchedAt).toISOString().split('T')[0];
      return h.movieId === movie.id && recordDate === today;
    });

    const newRecord = {
      id: `${movie.id}-${Date.now()}`,
      movieId: movie.id,
      title: movie.title,
      poster_url: movie.poster_url,
      rating: movie.rating,
      year: movie.year,
      watchedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      history[existingIndex].watchedAt = Date.now();
    } else {
      history.unshift(newRecord);
    }

    localStorage.setItem('stellaflix_history', JSON.stringify(history.slice(0, 100)));
  };

  // 搜索播放源
  useEffect(() => {
    if (!movie?.title) return;

    const searchSources = async () => {
      setLoadingSources(true);
      setError('');

      try {
        const response = await fetch(`/api/video/search?wd=${encodeURIComponent(movie.title)}`);
        const data = await response.json();

        if (data.success && data.results) {
          const filtered = data.results.filter((r: VideoSource) =>
            r.name.includes(movie.title) || movie.title.includes(r.name)
          );
          setSources(filtered.length > 0 ? filtered : data.results.slice(0, 5));
        } else {
          setError('未找到可用的播放源');
        }
      } catch (err) {
        setError('搜索播放源失败');
      } finally {
        setLoadingSources(false);
      }
    };

    searchSources();
  }, [movie?.title]);

  // 解析视频URL
  const parseVideoUrl = (playUrl: string): string => {
    if (!playUrl) return '';
    if (playUrl.includes('.m3u8') && playUrl.startsWith('http')) return playUrl;
    if (playUrl.includes('$$$')) {
      for (const source of playUrl.split('$$$')) {
        const url = source.split('$').pop();
        if (url?.includes('.m3u8') && url.startsWith('http')) return url;
      }
    }
    if (playUrl.includes('$')) {
      const url = playUrl.split('$').pop();
      if (url?.startsWith('http')) return url;
    }
    return playUrl.startsWith('http') ? playUrl : '';
  };

  // 选择播放源
  const handleSelectSource = (source: VideoSource) => {
    const url = parseVideoUrl(source.playUrl);
    if (url) {
      setCurrentSource(source.id);
      setVideoUrl(url);
      addToHistory();
    } else {
      setError('无法解析播放地址');
    }
  };

  // 播放
  const handlePlay = () => {
    if (sources.length > 0) handleSelectSource(sources[0]);
  };

  // 分享
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('链接已复制');
  };

  // 从豆瓣更新简介
  const handleUpdateDescription = async (doubanId?: string) => {
    if (!movie || updatingDescription) return;

    setUpdatingDescription(true);
    setDescriptionSource(null);

    try {
      // 如果提供了豆瓣 ID，直接使用
      let requestBody: any = {
        movieId: movie.id,
        title: movie.title,
        year: movie.year,
        forceUpdate: true,
      };

      // 如果有手动输入的豆瓣链接，提取 ID
      if (doubanId) {
        requestBody.doubanId = doubanId;
      }

      const response = await fetch('/api/movies/update-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success && data.updated) {
        // 更新本地状态
        setMovie({
          ...movie,
          description: data.movie.description,
        });
        setDescriptionSource('豆瓣');
        setShowDoubanInput(false);
        alert('简介更新成功！');
      } else if (data.success && !data.updated) {
        // 简介已存在，跳过更新
        alert(data.message || '简介已存在');
      } else if (data.canManualInput) {
        // 未找到简介，提示手动输入
        setShowDoubanInput(true);
        alert(data.hint || '未找到该电影的简介，请手动输入豆瓣链接');
      } else if (data.message) {
        alert(data.message);
      } else {
        alert(data.error || '更新失败');
      }
    } catch (err) {
      console.error('更新简介失败:', err);
      alert('网络请求失败，请稍后重试');
    } finally {
      setUpdatingDescription(false);
    }
  };

  // 从豆瓣链接提取 ID
  const extractDoubanId = (url: string): string | null => {
    const match = url.match(/subject\/(\d+)/);
    return match?.[1] || null;
  };

  // 处理手动输入豆瓣链接
  const handleManualDoubanUpdate = () => {
    const doubanId = extractDoubanId(doubanUrl);
    if (!doubanId) {
      alert('请输入有效的豆瓣链接，例如：https://movie.douban.com/subject/12345678/');
      return;
    }
    handleUpdateDescription(doubanId);
  };

  if (loadingMovie) {
    return (
      <div className="min-h-screen bg-[#181818] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-[#181818]">
        <div className="max-w-[1200px] mx-auto px-8 py-6">
          <Link href="/" className="text-gray-400 hover:text-white">
            ← 返回首页
          </Link>
        </div>
        <div className="text-center py-16">
          <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h1 className="text-2xl text-white mb-2">未找到电影</h1>
          <p className="text-gray-400">电影信息不存在或已被删除</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#181818]">
      {/* 主内容区 */}
      <div className="max-w-[1200px] mx-auto px-8 py-8">
        <div className="flex gap-8">
          {/* 左侧海报 */}
          <div className="flex-shrink-0 w-[200px]">
            {movie.poster_url ? (
              <img
                src={movie.poster_url}
                alt={movie.title}
                className="w-full rounded-lg shadow-2xl"
              />
            ) : (
              <div className="w-full aspect-[2/3] bg-gray-800 rounded-lg flex items-center justify-center">
                <Film className="w-12 h-12 text-gray-600" />
              </div>
            )}
          </div>

          {/* 右侧信息 */}
          <div className="flex-1 min-w-0">
            {/* 标题 */}
            <h1 className="text-[36px] font-bold text-white leading-tight mb-4" style={{ fontFamily: '"Microsoft YaHei", sans-serif' }}>
              {movie.title}
            </h1>

            {/* 标签 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 bg-white/10 text-white text-[14px] rounded border border-white/20">
                {movie.type === 'movie' ? '正片' : '纪录片'}
              </span>
              {movie.year && (
                <span className="px-3 py-1 bg-white/10 text-white text-[14px] rounded border border-white/20">
                  {movie.year}
                </span>
              )}
              {movie.country && (
                <span className="px-3 py-1 bg-white/10 text-white text-[14px] rounded border border-white/20">
                  {movie.country}
                </span>
              )}
            </div>

            {/* 导演 */}
            {movie.director && (
              <div className="mb-2">
                <span className="text-[#e50914] text-[16px] font-medium">导演：</span>
                <span className="text-white text-[16px]">{movie.director}</span>
              </div>
            )}

            {/* 演员 */}
            {movie.cast_members && movie.cast_members.length > 0 && (
              <div className="mb-2">
                <span className="text-[#e50914] text-[16px] font-medium">演员：</span>
                <span className="text-white text-[16px]">{movie.cast_members.join('、')}</span>
              </div>
            )}

            {/* 类型 */}
            {movie.genre && movie.genre.length > 0 && (
              <div className="mb-4">
                <span className="text-[#e50914] text-[16px] font-medium">类型：</span>
                <span className="text-white text-[16px]">{movie.genre.join('、')}</span>
              </div>
            )}

            {/* 评分 */}
            {movie.rating > 0 && (
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-[42px] font-bold text-white leading-none">{movie.rating.toFixed(1)}</span>
                {movie.rating_count > 0 && (
                  <span className="text-gray-400 text-[14px]">{movie.rating_count}次评分</span>
                )}
                <div className="flex items-center gap-0.5 ml-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-[14px] h-[14px] ${
                        star <= Math.round(movie.rating / 2)
                          ? 'text-yellow-400'
                          : 'text-gray-600'
                      }`}
                      fill="currentColor"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-3">
              {/* 播放按钮 */}
              <button
                onClick={handlePlay}
                disabled={sources.length === 0}
                className="inline-flex items-center gap-2 bg-[#e50914] hover:bg-[#b20710] disabled:bg-gray-600 text-white font-medium px-6 py-2.5 rounded text-[15px] transition"
              >
                <Play className="w-4 h-4" fill="white" />
                播放
              </button>

              {/* 分享按钮 */}
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-5 py-2.5 rounded text-[15px] transition"
              >
                <Share2 className="w-4 h-4" />
                分享
              </button>

              {/* 收藏按钮 */}
              <FavoriteButton
                movieId={movie.id}
                movieTitle={movie.title}
                posterUrl={movie.poster_url}
                rating={movie.rating}
                year={movie.year}
              />
            </div>
          </div>
        </div>

        {/* 简介区域 */}
        <div className="mt-10">
          {/* 简介标签 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-block border-l-4 border-[#e50914] pl-2">
              <span className="bg-[#e50914] text-white text-[14px] px-3 py-1 rounded font-medium">简介</span>
            </div>
            {/* 从豆瓣更新简介按钮 */}
            <button
              onClick={() => handleUpdateDescription()}
              disabled={updatingDescription}
              className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${updatingDescription ? 'animate-spin' : ''}`} />
              {updatingDescription ? '更新中...' : '从豆瓣更新'}
            </button>
            {/* 手动输入豆瓣链接 */}
            <button
              onClick={() => setShowDoubanInput(!showDoubanInput)}
              className="text-[13px] text-gray-400 hover:text-white transition"
            >
              {showDoubanInput ? '取消' : '手动输入链接'}
            </button>
            {descriptionSource && (
              <span className="text-[12px] text-green-400">已从{descriptionSource}更新</span>
            )}
          </div>

          {/* 手动输入豆瓣链接 */}
          {showDoubanInput && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-[#1a1a2e] rounded-lg">
              <input
                type="text"
                value={doubanUrl}
                onChange={(e) => setDoubanUrl(e.target.value)}
                placeholder="粘贴豆瓣链接，如：https://movie.douban.com/subject/12345678/"
                className="flex-1 bg-[#0a0a0f] text-white text-[14px] px-3 py-2 rounded border border-white/10 focus:border-[#e50914] focus:outline-none"
              />
              <button
                onClick={handleManualDoubanUpdate}
                disabled={!doubanUrl || updatingDescription}
                className="px-4 py-2 bg-[#e50914] hover:bg-[#b20710] disabled:bg-gray-600 text-white text-[14px] rounded transition"
              >
                更新
              </button>
            </div>
          )}

          {/* 关键词 */}
          <div className="flex flex-wrap gap-2 mb-4">
            {movie.genre && movie.genre.map((g, i) => (
              <span key={i} className="text-gray-400 text-[15px]">#{g}</span>
            ))}
            {movie.director && (
              <span className="text-gray-400 text-[15px]">#{movie.director}</span>
            )}
            {movie.cast_members && movie.cast_members.slice(0, 3).map((c, i) => (
              <span key={i} className="text-gray-400 text-[15px]">#{c}</span>
            ))}
            {movie.country && (
              <span className="text-gray-400 text-[15px]">#{movie.country}</span>
            )}
            {movie.year && (
              <span className="text-gray-400 text-[15px]">#{movie.year}</span>
            )}
          </div>

          {/* 剧情简介 */}
          {movie.description && (
            <p className="text-gray-300 text-[16px] leading-relaxed">
              {cleanDescription(movie.description)}
            </p>
          )}
        </div>
      </div>

      {/* 资源列表 */}
      <div className="max-w-[1200px] mx-auto px-8 py-8 border-t border-white/10">
        <div className="bg-black/40 backdrop-blur-xl rounded-xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[24px] font-bold text-white">资源列表</h2>
          <button className="flex items-center gap-2 text-white bg-[#e50914] hover:bg-[#b20710] px-4 py-2 rounded text-[14px] transition">
            <ArrowUpDown className="w-4 h-4" />
            升排序
          </button>
        </div>

        {loadingSources ? (
          <div className="flex items-center gap-3 text-gray-400 py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[15px]">搜索播放源中...</span>
          </div>
        ) : sources.length > 0 ? (
          <>
            {/* 播放源标签 */}
            <div className="flex flex-wrap gap-3 mb-4">
              {sources.map((source, index) => (
                <button
                  key={`${source.id}-${index}`}
                  onClick={() => handleSelectSource(source)}
                  className={`px-4 py-2 rounded text-[14px] transition flex items-center gap-2 ${
                    currentSource === source.id
                      ? 'bg-[#e50914] text-white'
                      : 'bg-white/10 hover:bg-white/20 text-gray-300'
                  }`}
                >
                  {currentSource === source.id && (
                    <Play className="w-3 h-3" fill="currentColor" />
                  )}
                  {source.name || `线路 ${index + 1}`}
                </button>
              ))}
            </div>

            {/* 当前播放源详情 */}
            <div className="bg-white/5 rounded-lg p-4 mt-4">
              <p className="text-gray-300 text-[15px]">
                {sources.find(s => s.id === currentSource)?.description || '1080P'}
              </p>
            </div>
          </>
        ) : (
          <div className="text-gray-400 py-8 text-[15px]">暂无可用播放源</div>
        )}
        </div>
      </div>

      {/* 播放器（选中源后显示） */}
      {sources.length > 0 && (
        <div className="max-w-[1200px] mx-auto px-8 pb-8">
          <div className="bg-black rounded-lg overflow-hidden">
            <VideoPlayer
              sources={sources.map((s, i) => ({
                id: s.id,
                name: s.name || `线路 ${i + 1}`,
                url: parseVideoUrl(s.playUrl),
              })).filter(s => s.url)}
              title={movie.title}
              autoPlay={!!currentSource}
              initialSourceIndex={currentSource ? sources.findIndex(s => s.id === currentSource) : 0}
              onSourceChange={(index) => {
                const source = sources[index];
                if (source) {
                  setCurrentSource(source.id);
                  const url = parseVideoUrl(source.playUrl);
                  if (url) setVideoUrl(url);
                  addToHistory();
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function MovieDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#181818] flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
        </div>
      }
    >
      <MovieDetailContent />
    </Suspense>
  );
}
