"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Hls from "hls.js";

/**
 * 剧集类型
 */
interface Episode {
  id: string;
  title: string;
  url: string;
  episode_number: number;
}

/**
 * 播放状态类型
 */
interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  playbackRate: number;
}

/**
 * 外部源播放页面内容（需要 Suspense 包裹）
 */
function ExternalPlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // URL 参数
  const source = searchParams.get("source");
  const url = searchParams.get("url");
  const title = searchParams.get("title") || "未知标题";
  const movieId = searchParams.get("movieId");
  const episodesParam = searchParams.get("episodes");

  // 解析剧集列表
  const episodes: Episode[] = episodesParam ? JSON.parse(episodesParam) : [];

  // 状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    isMuted: false,
    isFullscreen: false,
    playbackRate: 1,
  });
  const [showControls, setShowControls] = useState(true);
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(-1);

  // 视频 ref
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 找到当前集数
  useEffect(() => {
    if (episodes.length > 0 && url) {
      const index = episodes.findIndex((ep) => ep.url === url);
      setCurrentEpisodeIndex(index);
    }
  }, [episodes, url]);

  // 解析视频 URL 并播放
  useEffect(() => {
    if (!url || !source) {
      setError("缺少播放参数");
      setLoading(false);
      return;
    }

    const resolveVideo = async () => {
      try {
        setLoading(true);
        setError("");
        console.log("[Player] 开始解析视频:", url);

        // 检查是否是直接视频链接
        const isDirectVideo = /\.(mp4|m3u8|webm|flv|ts)(\?|$)/i.test(url);

        if (isDirectVideo) {
          console.log("[Player] 直接视频链接，跳过解析");
          // 使用代理 URL 绕过 CORS
          const proxiedUrl = `/api/proxy/video?url=${encodeURIComponent(url)}`;
          setVideoUrl(proxiedUrl);
          setLoading(false);
          return;
        }

        // 调用解析 API 获取真实视频地址
        const response = await fetch("/api/video-sources/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, source }),
        });

        const data = await response.json();
        console.log("[Player] 解析结果:", data);

        if (!response.ok) {
          // 如果解析失败，尝试直接使用原 URL
          console.log("[Player] 解析失败，尝试直接使用原 URL");
          const proxiedUrl = `/api/proxy/video?url=${encodeURIComponent(url)}`;
          setVideoUrl(proxiedUrl);
          setLoading(false);
          return;
        }

        if (data.url) {
          // 使用代理 URL
          const proxiedUrl = `/api/proxy/video?url=${encodeURIComponent(data.url)}`;
          setVideoUrl(proxiedUrl);
        } else {
          // 如果没有返回 URL，尝试直接使用原 URL
          console.log("[Player] 未返回 URL，尝试直接使用原 URL");
          const proxiedUrl = `/api/proxy/video?url=${encodeURIComponent(url)}`;
          setVideoUrl(proxiedUrl);
        }
      } catch (err) {
        console.error("[Player] 解析出错:", err);
        // 出错时也尝试直接使用原 URL
        console.log("[Player] 出错，尝试直接使用原 URL");
        const proxiedUrl = `/api/proxy/video?url=${encodeURIComponent(url)}`;
        setVideoUrl(proxiedUrl);
      } finally {
        setLoading(false);
      }
    };

    resolveVideo();
  }, [url, source]);

  // 更新播放器状态
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    let hlsInstance: Hls | null = null;

    // 检查是否是 m3u8 格式
    const isHLS = videoUrl.includes('.m3u8');

    console.log('[Player] 视频 URL:', videoUrl, '是否 HLS:', isHLS);

    if (isHLS) {
      // 检查是否支持原生 HLS（Safari）
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('[Player] 使用原生 HLS (Safari)');
        video.src = videoUrl;
      } else if (Hls.isSupported()) {
        console.log('[Player] 使用 hls.js');

        // 自定义片段加载器，通过代理加载
        const customLoader = {
          load: function(context: any, config: any, callbacks: any) {
            const url = context.url;
            // 通过代理加载
            const proxyUrl = `/api/proxy/video?url=${encodeURIComponent(url)}`;
            console.log('[Player] 代理加载:', proxyUrl);

            fetch(proxyUrl)
              .then(response => {
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                return response.arrayBuffer();
              })
              .then(data => {
                callbacks.onSuccess({ url: url, data: data }, {}, context, null);
              })
              .catch(err => {
                callbacks.onError({ code: 0, message: err.message }, context, null);
              });
          }
        };

        hlsInstance = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          enableWorker: true,
          lowLatencyMode: false,
          // 使用自定义加载器
          pLoader: customLoader,
          fLoader: customLoader,
        });

        hlsInstance.loadSource(videoUrl);
        hlsInstance.attachMedia(video);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[Player] HLS 视频加载成功');
        });

        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          console.error('[Player] HLS 错误:', data.type, data.details, data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('[Player] 网络错误，尝试恢复...');
                hlsInstance?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('[Player] 媒体错误，尝试恢复...');
                hlsInstance?.recoverMediaError();
                break;
              default:
                setError('HLS 视频加载失败');
                break;
            }
          }
        });
      } else {
        setError('您的浏览器不支持 HLS 视频播放');
      }
    } else {
      // 非 HLS 格式，直接设置 src
      video.src = videoUrl;
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };

    const updateState = () => {
      if (!video) return;
      setPlayerState({
        isPlaying: !video.paused,
        currentTime: video.currentTime,
        duration: video.duration || 0,
        buffered: video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0,
        volume: video.volume,
        isMuted: video.muted,
        isFullscreen: !!document.fullscreenElement,
        playbackRate: video.playbackRate,
      });
    };

    const events = [
      "play",
      "pause",
      "timeupdate",
      "loadedmetadata",
      "progress",
      "volumechange",
    ];

    events.forEach((event) => video?.addEventListener(event, updateState));

    // 全屏变化监听
    document.addEventListener("fullscreenchange", updateState);

    return () => {
      events.forEach((event) => video?.removeEventListener(event, updateState));
      document.removeEventListener("fullscreenchange", updateState);
    };
  }, [videoUrl]);

  // 自动隐藏控制栏
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        if (playerState.isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [playerState.isPlaying]);

  // 播放进度保存
  useEffect(() => {
    if (!videoUrl || !movieId || !user) return;

    saveIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused) return;

      fetch("/api/watch-progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movie_id: movieId,
          position_seconds: video.currentTime,
          duration_seconds: video.duration,
          source_url: url,
        }),
      });
    }, 10000);

    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [videoUrl, movieId, user, url]);

  // 播放器控制函数
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, video.duration));
  };

  const changePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
  };

  const toggleFullscreen = () => {
    const container = document.getElementById("player-container");
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  };

  // 上一集/下一集
  const goToEpisode = (direction: "prev" | "next") => {
    if (episodes.length === 0 || currentEpisodeIndex === -1) return;

    const newIndex =
      direction === "prev"
        ? currentEpisodeIndex - 1
        : currentEpisodeIndex + 1;

    if (newIndex >= 0 && newIndex < episodes.length) {
      const ep = episodes[newIndex];
      const playUrl = new URL("/play/external", window.location.origin);
      playUrl.searchParams.set("source", source!);
      playUrl.searchParams.set("url", ep.url);
      playUrl.searchParams.set("title", `${title.split(" - ")[0]} - ${ep.title}`);
      if (movieId) playUrl.searchParams.set("movieId", movieId);
      playUrl.searchParams.set("episodes", JSON.stringify(episodes));
      router.push(playUrl.pathname + playUrl.search);
    }
  };

  // 跳转到指定集数
  const goToSpecificEpisode = (episode: Episode) => {
    const playUrl = new URL("/play/external", window.location.origin);
    playUrl.searchParams.set("source", source!);
    playUrl.searchParams.set("url", episode.url);
    playUrl.searchParams.set("title", `${title.split(" - ")[0]} - ${episode.title}`);
    if (movieId) playUrl.searchParams.set("movieId", movieId);
    playUrl.searchParams.set("episodes", JSON.stringify(episodes));
    router.push(playUrl.pathname + playUrl.search);
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // 格式化百分比
  const formatPercent = (value: number, total: number) => {
    if (!total) return "0%";
    return `${Math.round((value / total) * 100)}%`;
  };

  // 渲染加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-red-600 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">正在解析视频...</p>
          <p className="text-gray-400 text-sm mt-2">
            正在从 {source} 获取视频地址
          </p>
        </div>
      </div>
    );
  }

  // 渲染错误状态
  if (error || !videoUrl) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">播放失败</h2>
          <p className="text-gray-400 mb-6">{error || "无法获取视频地址"}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              <RotateCcw className="w-5 h-5" />
              重新加载
            </button>
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black" id="player-container">
      <Header />

      {/* 视频播放器 */}
      <div className="relative w-full h-screen flex items-center justify-center">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          playsInline
          crossOrigin="anonymous"
          onError={(e) => {
            console.error("[Player] 视频加载错误:", e);
            setError("视频加载失败，可能是网络问题或视频格式不支持");
          }}
          onLoadedMetadata={() => {
            console.log("[Player] 视频加载成功");
          }}
        />

        {/* 控制层 */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col justify-between pointer-events-none"
            >
              {/* 顶部信息栏 */}
              <div className="bg-gradient-to-b from-black/80 to-transparent p-4 pointer-events-auto">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-white/20 rounded-full transition"
                  >
                    <ArrowLeft className="w-6 h-6 text-white" />
                  </button>
                  <div className="flex-1">
                    <h1 className="text-white text-lg font-semibold truncate">
                      {title}
                    </h1>
                    <p className="text-gray-300 text-sm">
                      来源: {source} | 当前: {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
                    </p>
                  </div>
                  {episodes.length > 0 && (
                    <button
                      onClick={() => setShowEpisodeList(!showEpisodeList)}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition"
                    >
                      剧集列表
                    </button>
                  )}
                </div>
              </div>

              {/* 中间控制区 */}
              <div className="flex items-center justify-center gap-8 pointer-events-auto">
                {/* 上一集 */}
                {episodes.length > 0 && currentEpisodeIndex > 0 && (
                  <button
                    onClick={() => goToEpisode("prev")}
                    className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition"
                  >
                    <SkipBack className="w-8 h-8 text-white" />
                  </button>
                )}

                {/* 后退 10 秒 */}
                <button
                  onClick={() => seek(playerState.currentTime - 10)}
                  className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition"
                >
                  <span className="text-white text-sm font-medium">-10s</span>
                </button>

                {/* 播放/暂停 */}
                <button
                  onClick={togglePlay}
                  className="p-6 bg-red-600 hover:bg-red-700 rounded-full transition transform hover:scale-110"
                >
                  {playerState.isPlaying ? (
                    <Pause className="w-10 h-10 text-white" />
                  ) : (
                    <Play className="w-10 h-10 text-white" />
                  )}
                </button>

                {/* 前进 10 秒 */}
                <button
                  onClick={() => seek(playerState.currentTime + 10)}
                  className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition"
                >
                  <span className="text-white text-sm font-medium">+10s</span>
                </button>

                {/* 下一集 */}
                {episodes.length > 0 &&
                  currentEpisodeIndex < episodes.length - 1 && (
                    <button
                      onClick={() => goToEpisode("next")}
                      className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition"
                    >
                      <SkipForward className="w-8 h-8 text-white" />
                    </button>
                  )}
              </div>

              {/* 底部控制栏 */}
              <div className="bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-auto">
                {/* 进度条 */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-white text-sm w-16 text-right">
                    {formatTime(playerState.currentTime)}
                  </span>
                  <div
                    className="flex-1 h-2 bg-gray-600 rounded-full cursor-pointer group relative"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = (e.clientX - rect.left) / rect.width;
                      seek(percent * playerState.duration);
                    }}
                  >
                    {/* 缓冲进度 */}
                    <div
                      className="absolute h-full bg-gray-500 rounded-full"
                      style={{
                        width: formatPercent(
                          playerState.buffered,
                          playerState.duration
                        ),
                      }}
                    />
                    {/* 播放进度 */}
                    <div
                      className="absolute h-full bg-red-600 rounded-full"
                      style={{
                        width: formatPercent(
                          playerState.currentTime,
                          playerState.duration
                        ),
                      }}
                    />
                    {/* 拖动点 */}
                    <div
                      className="absolute w-4 h-4 bg-red-600 rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition"
                      style={{
                        left: `calc(${formatPercent(
                          playerState.currentTime,
                          playerState.duration
                        )} - 8px)`,
                      }}
                    />
                  </div>
                  <span className="text-white text-sm w-16">
                    {formatTime(playerState.duration)}
                  </span>
                </div>

                {/* 其他控制按钮 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* 音量控制 */}
                    <button
                      onClick={toggleMute}
                      className="p-2 hover:bg-white/20 rounded transition"
                    >
                      {playerState.isMuted ? (
                        <VolumeX className="w-5 h-5 text-white" />
                      ) : (
                        <Volume2 className="w-5 h-5 text-white" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={playerState.isMuted ? 0 : playerState.volume}
                      onChange={(e) => {
                        const video = videoRef.current;
                        if (video) {
                          video.volume = parseFloat(e.target.value);
                          video.muted = video.volume === 0;
                        }
                      }}
                      className="w-20 accent-red-600"
                    />

                    {/* 倍速选择 */}
                    <select
                      value={playerState.playbackRate}
                      onChange={(e) =>
                        changePlaybackRate(parseFloat(e.target.value))
                      }
                      className="bg-transparent text-white text-sm border border-gray-600 rounded px-2 py-1"
                    >
                      <option value="0.5" className="bg-gray-800">
                        0.5x
                      </option>
                      <option value="0.75" className="bg-gray-800">
                        0.75x
                      </option>
                      <option value="1" className="bg-gray-800">
                        正常
                      </option>
                      <option value="1.25" className="bg-gray-800">
                        1.25x
                      </option>
                      <option value="1.5" className="bg-gray-800">
                        1.5x
                      </option>
                      <option value="2" className="bg-gray-800">
                        2x
                      </option>
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* 全屏 */}
                    <button
                      onClick={toggleFullscreen}
                      className="p-2 hover:bg-white/20 rounded transition"
                    >
                      <Maximize className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 剧集列表侧边栏 */}
        <AnimatePresence>
          {showEpisodeList && episodes.length > 0 && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900/95 backdrop-blur-sm overflow-y-auto"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold">
                    剧集列表 ({episodes.length}集)
                  </h3>
                  <button
                    onClick={() => setShowEpisodeList(false)}
                    className="p-1 hover:bg-white/20 rounded transition"
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {episodes.map((ep, index) => (
                    <button
                      key={ep.id}
                      onClick={() => goToSpecificEpisode(ep)}
                      className={`p-2 rounded text-sm transition ${
                        currentEpisodeIndex === index
                          ? "bg-red-600 text-white"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {ep.episode_number || index + 1}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * 外部源播放页面
 * 用于播放来自第三方视频源的视频
 */
export default function ExternalPlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
        </div>
      }
    >
      <ExternalPlayerContent />
    </Suspense>
  );
}
