/**
 * B站内容页面
 *
 * 用途: 展示B站推荐视频和搜索功能
 * 依赖:
 *   - Header: 共享导航栏组件
 *   - useScrollHide: 滚动隐藏 hook
 *   - bilibili-utils: B站相关工具函数
 *   - framer-motion: 动画库
 * 架构:
 *   - 搜索功能: 关键词搜索B站视频
 *   - 推荐功能: 无限滚动加载高质量推荐视频
 *   - 播放功能: 嵌入式视频播放器
 *   - 历踪功能: 记录已播放视频，避免重复推荐
 */

'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import Header from '@/components/Header';
import { useScrollHide } from '@/hooks/useScrollHide';
import {
  Search, Play, Eye, ArrowLeft, Loader2,
  AlertCircle, Clock, LogIn, CheckCircle, X, Trash2,
  Flame, TrendingUp, RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BilibiliVideo,
  getSearchHistory,
  saveSearchHistory,
  clearSearchHistory,
  getViewedVideos,
  saveViewedVideo,
  clearViewedVideos,
  formatPlayCount
} from '@/lib/bilibili-utils';
import { cleanDescription } from '@/lib/html-utils';

// ============================================
// 常量配置
// ============================================

/** 每页加载数量 */
const PAGE_SIZE = 30;

/** 热门搜索标签 */
const HOT_TAGS = ['纪录片', '电影', '4K', '科技', '教程', '音乐', '动漫', '游戏'];

// ============================================
// 子组件
// ============================================

/**
 * B站视频卡片组件
 *
 * 做什么: 展示单个视频卡片，包含封面、标题、播放量
 * 参数:
 *   - video: 视频数据对象
 *   - onPlay: 点击播放的回调函数
 * 返回值: JSX 元素
 */
const BilibiliCard = memo(({ video, onPlay }: {
  video: BilibiliVideo;
  onPlay: (v: BilibiliVideo) => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    className="group cursor-pointer"
    onClick={() => onPlay(video)}
  >
    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#12121a] mb-2 border border-white/0 group-hover:border-white/20 transition-all duration-500">
      <img
        src={`/api/bilibili/image?url=${encodeURIComponent(video.pic)}`}
        alt={video.title}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        loading="lazy"
      />
      <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300">
          <Play className="w-7 h-7 text-black ml-0.5" fill="black" />
        </div>
      </div>
      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-xs text-white">
        {video.duration}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/80 to-transparent" />
    </div>
    <h3 className="text-white text-sm font-semibold line-clamp-2 group-hover:text-white transition leading-snug">
      {video.title}
    </h3>
    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
      <span className="flex items-center gap-0.5">
        <Eye className="w-3 h-3" /> {formatPlayCount(video.play)}
      </span>
      <span className="truncate">{video.author}</span>
    </div>
  </motion.div>
));
BilibiliCard.displayName = 'BilibiliCard';

/**
 * 加载中组件
 *
 * 做什么: 展示加载动画
 * 参数: 无
 * 返回值: JSX 元素
 */
function LoadingSpinner({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="text-center py-32">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-red-500 animate-spin" />
      </div>
      <p className="text-gray-400">{text}</p>
    </div>
  );
}

// ============================================
// 主组件
// ============================================

export default function BilibiliPage() {
  // ============================================
  // 状态定义
  // ============================================

  /** 搜索关键词 */
  const [keyword, setKeyword] = useState('');

  /** 搜索结果 */
  const [results, setResults] = useState<BilibiliVideo[]>([]);

  /** 搜索加载状态 */
  const [loading, setLoading] = useState(false);

  /** 错误信息 */
  const [error, setError] = useState<string | null>(null);

  /** 是否已搜索 */
  const [searched, setSearched] = useState(false);

  /** 搜索历史 */
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  /** 推荐视频列表 */
  const [videos, setVideos] = useState<BilibiliVideo[]>([]);

  /** 初始加载状态 */
  const [loadingVideos, setLoadingVideos] = useState(true);

  /** 加载更多状态 */
  const [loadingMore, setLoadingMore] = useState(false);

  /** 当前页码 */
  const [page, setPage] = useState(1);

  /** 是否还有更多数据 */
  const [hasMore, setHasMore] = useState(true);

  /** 是否已登录 */
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  /** 显示 Cookie 配置弹窗 */
  const [showCookieModal, setShowCookieModal] = useState(false);

  /** 手动输入的 Cookie */
  const [manualCookie, setManualCookie] = useState('');

  /** 已看视频集合 */
  const [viewedVideos, setViewedVideos] = useState<Set<string>>(new Set());

  /** 显示查看历史弹窗 */
  const [showViewHistory, setShowViewHistory] = useState(false);

  /** 播放中的视频 */
  const [playingVideo, setPlayingVideo] = useState<BilibiliVideo | null>(null);

  /** 视频播放地址 */
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  /** 播放加载状态 */
  const [loadingPlay, setLoadingPlay] = useState(false);

  // ============================================
  // Refs
  // ============================================

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const panelElementRef = useRef<HTMLDivElement>(null);
  const panelVisibleRef = useRef(false);

  // ============================================
  // Hooks
  // ============================================

  /** 滚动隐藏状态 */
  const filtersVisible = useScrollHide();

  // ============================================
  // 面板控制函数
  // ============================================

  /**
   * 切换搜索面板显示/隐藏
   * 使用 CSS class 控制，避免触发 React 重渲染
   */
  const togglePanel = useCallback(() => {
    panelVisibleRef.current = !panelVisibleRef.current;
    panelElementRef.current?.classList.toggle('hidden', !panelVisibleRef.current);
    panelElementRef.current?.classList.toggle('block', panelVisibleRef.current);
  }, []);

  /**
   * 关闭搜索面板
   */
  const closePanel = useCallback(() => {
    panelVisibleRef.current = false;
    panelElementRef.current?.classList.add('hidden');
    panelElementRef.current?.classList.remove('block');
  }, []);

  // ============================================
  // 初始化效果
  // ============================================

  /** 加载搜索历史 */
  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  /** 加载已看视频列表 */
  useEffect(() => {
    setViewedVideos(new Set(getViewedVideos()));
  }, []);

  /** 检查登录状态 */
  useEffect(() => {
    const cookies = localStorage.getItem('bilibili_cookies');
    if (cookies) {
      try {
        if (JSON.parse(cookies).SESSDATA) setIsLoggedIn(true);
      } catch { /* 忽略解析错误 */ }
    }
  }, []);

  // ============================================
  // 工具函数
  // ============================================

  /**
   * 获取用户 Cookie 字符串
   * 做什么: 从 localStorage 读取用户配置的 Cookie
   * 返回值: string - Cookie 字符串，未配置时返回空字符串
   */
  const getUserCookie = (): string => {
    try {
      const cookies = localStorage.getItem('bilibili_cookies');
      if (cookies) {
        const data = JSON.parse(cookies);
        return data.cookieString || '';
      }
    } catch { /* 忽略解析错误 */ }
    return '';
  };

  // ============================================
  // 数据获取函数
  // ============================================

  /**
   * 获取推荐视频
   *
   * 做什么: 从 API 获取推荐视频列表
   * 参数:
   *   - pageNum: 页码
   *   - append: 是否追加到现有列表（无限滚动时为 true）
   * 返回值: 无（直接更新状态）
   */
  const fetchVideos = useCallback(async (pageNum: number, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingVideos(true);
    }
    setError(null);

    try {
      // 获取已播放过的视频列表（排除重复推荐）
      const viewed = getViewedVideos();
      const excludeParam = viewed.length > 0 ? `&exclude=${viewed.join(',')}` : '';

      const res = await fetch(`/api/bilibili/popular?type=all&page=${pageNum}&refresh=${Date.now()}${excludeParam}`);
      const data = await res.json();

      if (data.success && data.videos) {
        const newVideos: BilibiliVideo[] = data.videos;

        if (append) {
          // 追加时去重，避免重复 key
          setVideos(prev => {
            const existingBvids = new Set(prev.map(v => v.bvid));
            const uniqueNewVideos = newVideos.filter(v => !existingBvids.has(v.bvid));
            return [...prev, ...uniqueNewVideos];
          });
        } else {
          setVideos(newVideos);
        }

        // 判断是否还有更多数据
        setHasMore(newVideos.length >= PAGE_SIZE);
      } else {
        setError('加载推荐失败，请稍后再试');
      }
    } catch {
      setError('加载推荐失败');
    } finally {
      setLoadingVideos(false);
      setLoadingMore(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchVideos(1, false);
    setPage(1);
    setHasMore(true);
  }, [fetchVideos]);

  // ============================================
  // 无限滚动
  // ============================================

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingVideos && !loadingMore && !searched) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchVideos(nextPage, true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [page, hasMore, loadingVideos, loadingMore, searched, fetchVideos]);

  // ============================================
  // 事件处理函数
  // ============================================

  /** 点击外部关闭面板 */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelElementRef.current &&
        !panelElementRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        closePanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closePanel]);

  /**
   * 执行搜索
   * 做什么: 根据关键词搜索B站视频
   */
  const handleSearch = useCallback(async (searchKeyword?: string) => {
    const kw = searchKeyword || keyword;
    if (!kw.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    closePanel();
    saveSearchHistory(kw);
    setSearchHistory(getSearchHistory());

    try {
      const cookie = getUserCookie();
      const params = new URLSearchParams({ wd: kw.trim() });
      if (cookie) params.append('cookie', cookie);

      const res = await fetch(`/api/bilibili/search?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setResults(data.results);
      } else {
        setError(data.error || '搜索失败');
        setResults([]);
      }
    } catch {
      setError('网络请求失败');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, closePanel]);

  /**
   * 清除搜索，返回推荐页
   */
  const handleClearSearch = useCallback(() => {
    setSearched(false);
    setResults([]);
    setKeyword('');
    setPage(1);
    setHasMore(true);
    fetchVideos(1, false);
  }, [fetchVideos]);

  /**
   * 播放视频
   * 做什么: 获取视频播放地址并开始播放
   */
  const handlePlay = useCallback(async (video: BilibiliVideo) => {
    setPlayingVideo(video);
    setLoadingPlay(true);
    setVideoUrl(null);

    // 记录已播放视频
    saveViewedVideo(video.bvid);
    setViewedVideos(new Set(getViewedVideos()));

    try {
      const cookies = localStorage.getItem('bilibili_cookies');
      let cookieString = '';
      if (cookies) {
        try { cookieString = JSON.parse(cookies).cookieString || ''; } catch { /* 忽略 */ }
      }

      const headers: Record<string, string> = {};
      if (cookieString) headers['X-Bilibili-Cookie'] = cookieString;

      const res = await fetch(`/api/bilibili/stream?bvid=${video.bvid}&action=playurl`, { headers });
      const data = await res.json();

      if (data.success) {
        setVideoUrl(data.proxyUrl || data.url);
      } else {
        setError(data.error || '获取播放地址失败');
      }
    } catch {
      setError('获取播放地址失败');
    } finally {
      setLoadingPlay(false);
    }
  }, []);

  /**
   * 删除单条搜索历史
   */
  const handleDeleteHistory = useCallback((item: string) => {
    const newHistory = searchHistory.filter(h => h !== item);
    setSearchHistory(newHistory);
    localStorage.setItem('bilibili_search_history', JSON.stringify(newHistory));
  }, [searchHistory]);

  /**
   * 清空搜索历史
   */
  const handleClearHistory = useCallback(() => {
    clearSearchHistory();
    setSearchHistory([]);
  }, []);

  /**
   * 点击历史/热搜标签
   */
  const handleTagClick = useCallback((word: string) => {
    setKeyword(word);
    handleSearch(word);
  }, [handleSearch]);

  /**
   * 返回推荐页
   */
  const handleBack = useCallback(() => {
    setPlayingVideo(null);
    setVideoUrl(null);
  }, []);

  /**
   * 清空已看视频历史
   */
  const handleClearViewHistory = useCallback(() => {
    clearViewedVideos();
    setViewedVideos(new Set());
    setShowViewHistory(false);
    // 重新加载
    setPage(1);
    setHasMore(true);
    fetchVideos(1, false);
  }, [fetchVideos]);

  /**
   * 保存 Cookie 配置
   */
  const handleSaveCookie = useCallback(() => {
    if (manualCookie.trim()) {
      localStorage.setItem('bilibili_cookies', JSON.stringify({
        cookieString: manualCookie.trim(),
        SESSDATA: 'manual',
      }));
      setIsLoggedIn(true);
      setShowCookieModal(false);
      setManualCookie('');
      // 重新加载
      setPage(1);
      setHasMore(true);
      fetchVideos(1, false);
    }
  }, [manualCookie, fetchVideos]);

  // ============================================
  // 播放页面渲染
  // ============================================

  if (playingVideo) {
    return (
      <div className="min-h-screen bg-[#0a0a0f]">
        {/* 顶部导航栏 */}
        <div className="bg-[#12121a] border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
            <button onClick={handleBack} className="text-gray-400 hover:text-white transition">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{playingVideo.title}</h1>
              <p className="text-sm text-gray-400 mt-1">
                {playingVideo.author} · {formatPlayCount(playingVideo.play)}次播放
              </p>
            </div>
          </div>
        </div>

        {/* 视频播放器 */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-black rounded-xl overflow-hidden">
            {loadingPlay ? (
              <div className="aspect-video flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
              </div>
            ) : videoUrl ? (
              <video src={videoUrl} className="w-full aspect-video" controls autoPlay />
            ) : (
              <div className="aspect-video flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-white">{error || '播放地址获取失败'}</p>
                  <button onClick={() => handlePlay(playingVideo)} className="mt-4 px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition">
                    重试
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 视频简介 */}
          <div className="mt-4 bg-[#12121a] rounded-xl p-4 border border-white/5">
            <p className="text-gray-300 text-sm leading-relaxed">{cleanDescription(playingVideo.description) || '暂无简介'}</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // 主页面渲染
  // ============================================

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* 导航栏 */}
      <Header visible={filtersVisible} />

      {/* 搜索区域 - 固定在 Header 下方，包含搜索面板 */}
      <div className={`fixed top-16 left-0 right-0 z-40 transition-transform duration-300 ease-in-out ${
        filtersVisible ? "translate-y-0" : "-translate-y-[120%]"
      }`}>
        <div className="bg-black/40 backdrop-blur-2xl border-b border-white/10">
          <div className="max-w-[1600px] mx-auto px-6 py-3">
            {/* 搜索框 */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onFocus={() => togglePanel()}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索B站视频..."
                  className="w-full pl-11 pr-10 py-3 bg-white/[0.03] border border-white/5 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.06] transition text-[15px] backdrop-blur-sm"
                />
                {keyword && (
                  <button onClick={() => { setKeyword(''); inputRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button onClick={() => handleSearch()} disabled={loading || !keyword.trim()}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white rounded-xl transition font-medium flex-shrink-0">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '搜索'}
              </button>
            </div>

            {/* 状态标签 */}
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">B站源</span>
              <span className="text-xs text-gray-500">高清画质</span>
              <div className="flex-1" />
              {isLoggedIn ? (
                <span className="flex items-center gap-1 text-green-400 text-xs">
                  <CheckCircle className="w-3 h-3" /> 已登录
                </span>
              ) : (
                <button onClick={() => setShowCookieModal(true)}
                  className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs transition">
                  <LogIn className="w-3 h-3" /> 配置Cookie
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 搜索面板 - 紧贴搜索栏下方 */}
        <div ref={panelElementRef} className="hidden bg-black/50 backdrop-blur-3xl border-b border-white/10" onClick={closePanel}>
          <div className="max-w-[1600px] mx-auto px-6"
            onClick={(e) => e.stopPropagation()}>
            <div ref={panelRef} className="max-w-2xl py-2 max-h-[60vh] overflow-y-auto">
              {/* 搜索历史 */}
              {searchHistory.length > 0 && (
                <div className="py-3 border-b border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-white">搜索历史</span>
                    <button onClick={handleClearHistory}
                      className="text-xs text-gray-500 hover:text-red-400 transition flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> 清空
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map((item, i) => (
                      <div key={i} className="flex items-center gap-1 group">
                        <button onClick={() => handleTagClick(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-lg text-sm text-gray-300 transition">
                          <Clock className="w-3 h-3 text-gray-500" />
                          {item}
                        </button>
                        <button onClick={() => handleDeleteHistory(item)}
                          className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 热门搜索标签 */}
              <div className="py-3">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-white">热门搜索</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {HOT_TAGS.map((tag) => (
                    <button key={tag} onClick={() => handleTagClick(tag)}
                      className="px-4 py-2 bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] hover:border-red-500/30 text-gray-300 rounded-xl text-sm transition">
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-[1600px] mx-auto px-6 pt-24 pb-12" onClick={closePanel}>
        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-gray-500 text-xs mt-2">
              提示：B站对服务器IP有访问限制，建议使用
              <Link href="/movies" className="text-red-400 hover:underline mx-1">电影</Link>
              或
              <Link href="/documentaries" className="text-red-400 hover:underline mx-1">纪录片</Link>
              分区浏览内容
            </p>
          </div>
        )}

        {/* 搜索结果 */}
        {!loading && searched && results.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <p className="text-gray-400 text-sm">找到 {results.length} 个结果</p>
              <button onClick={handleClearSearch} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> 返回推荐
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5">
              {results.map((video) => (
                <BilibiliCard key={video.bvid} video={video} onPlay={handlePlay} />
              ))}
            </div>
          </div>
        )}

        {/* 搜索无结果 */}
        {!loading && searched && results.length === 0 && !error && (
          <div className="text-center py-32">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Search className="w-10 h-10 text-gray-500" />
            </div>
            <p className="text-gray-400 text-lg">没有找到相关视频</p>
            <p className="text-gray-500 text-sm mt-2">换个关键词试试</p>
            <button onClick={handleClearSearch} className="mt-4 text-red-400 hover:text-red-300 text-sm">
              返回推荐
            </button>
          </div>
        )}

        {/* 搜索加载中 */}
        {loading && <LoadingSpinner text="正在搜索..." />}

        {/* 热门推荐（未搜索时） */}
        {!searched && (
          <div>
            {/* 顶部信息栏 */}
            <div className="flex items-center gap-8 mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Flame className="w-4 h-4 text-red-400" />
                <span>共 {videos.length} 个推荐</span>
              </div>
              <div className="flex-1" />
              {viewedVideos.size > 0 && (
                <button
                  onClick={() => setShowViewHistory(true)}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-400 transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>已看 {viewedVideos.size} 个</span>
                </button>
              )}
            </div>

            {loadingVideos && videos.length === 0 ? (
              <LoadingSpinner text="加载推荐中..." />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5">
                  {videos.map((video) => (
                    <BilibiliCard key={video.bvid} video={video} onPlay={handlePlay} />
                  ))}
                </div>

                {/* 无限滚动触发器 */}
                <div ref={loadMoreRef} className="py-8">
                  {loadingMore && (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                      <span className="text-gray-400 text-sm">加载更多...</span>
                    </div>
                  )}
                  {!hasMore && videos.length > 0 && (
                    <p className="text-center text-gray-600 text-sm">- 已加载全部内容 -</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cookie 配置弹窗 */}
      {showCookieModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">配置B站Cookie</h3>
                <button onClick={() => setShowCookieModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-blue-400 text-sm font-medium mb-1">为什么需要Cookie？</p>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    B站对服务器IP有访问限制，配置Cookie后可通过浏览器直接访问B站API获取高清视频。
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-300 text-sm font-medium mb-2">获取Cookie步骤：</p>
                  <ol className="text-gray-400 text-xs space-y-1.5 list-decimal list-inside">
                    <li>打开 <a href="https://www.bilibili.com" target="_blank" className="text-red-400 hover:underline">bilibili.com</a> 并登录</li>
                    <li>按 F12 打开开发者工具</li>
                    <li>切换到 Application → Cookies → www.bilibili.com</li>
                    <li>复制以下Cookie值并粘贴到下方</li>
                  </ol>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">完整Cookie字符串</label>
                  <textarea
                    value={manualCookie}
                    onChange={(e) => setManualCookie(e.target.value)}
                    placeholder="SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx; ..."
                    className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500/50 resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCookieModal(false)}
                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveCookie}
                    disabled={!manualCookie.trim()}
                    className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white rounded-lg transition font-medium"
                  >
                    保存Cookie
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 查看历史弹窗 */}
      {showViewHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">观看历史</h3>
                <button onClick={() => setShowViewHistory(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-300 text-sm">已播放视频</span>
                    <span className="text-red-400 font-bold text-lg">{viewedVideos.size}</span>
                  </div>
                  <p className="text-gray-400 text-xs">
                    系统只会排除你实际点击播放的视频，刷新推荐不会被记录
                  </p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm font-medium mb-1">清空历史的作用</p>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    清空后，之前播放过的视频可能会再次出现。如果你想重新发现内容，可以清空历史。
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowViewHistory(false)}
                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition"
                  >
                    关闭
                  </button>
                  <button
                    onClick={handleClearViewHistory}
                    className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition font-medium flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    清空历史
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
