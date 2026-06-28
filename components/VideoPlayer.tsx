/**
 * 视频播放器组件（支持多源自动切换）
 *
 * 功能：
 * - 多播放源自动切换（失败自动切换下一源）
 * - 手动选择播放源
 * - 进度条、音量、全屏控制
 * - 自动隐藏控制栏
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Loader2,
  AlertCircle,
  SkipBack,
  SkipForward,
  ChevronDown,
  Check,
} from "lucide-react";

interface VideoSource {
  id: string;
  name: string;
  url: string;
}

interface VideoPlayerProps {
  sources: VideoSource[];
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  initialSourceIndex?: number;
  onSourceChange?: (index: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}

/**
 * 格式化时间
 */
function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * 视频播放器主组件
 */
export default function VideoPlayer({
  sources,
  poster,
  title,
  autoPlay = false,
  initialSourceIndex = 0,
  onSourceChange,
  onTimeUpdate,
  onEnded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  // 当前播放源索引
  const [currentSourceIndex, setCurrentSourceIndex] = useState(initialSourceIndex);

  // 播放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 观看时长记录
  const watchStartTimeRef = useRef<number | null>(null);
  const totalWatchTimeRef = useRef<number>(0);
  const savedRef = useRef<boolean>(false); // 防止重复保存

  // 音量
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // 控制栏显示
  const [showControls, setShowControls] = useState(true);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当前播放源
  const currentSource = sources[currentSourceIndex];

  /**
   * 初始化HLS播放器
   */
  const initHls = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;

    // 清理旧的HLS实例
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (url.includes(".m3u8")) {
      const win = window as any;
      if (win.Hls && win.Hls.isSupported()) {
        const hls = new win.Hls({
          // === 核心性能配置 ===
          debug: false,
          enableWorker: true,
          lowLatencyMode: false,

          // === 缓冲区配置（关键优化）===
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 20 * 1024 * 1024, // 20MB
          maxBufferHole: 0.5,
          backBufferLength: Infinity,

          // === 自适应码率（ABR）配置 ===
          startLevel: -1,
          testBandwidth: true,
          abrEwmaDefaultEstimate: 5000000,
          abrBandWidthFactor: 0.7,
          abrBandWidthUpFactor: 0.9,

          // === 段加载配置 ===
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 5,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 5,
          fragLoadingTimeOut: 30000,
          fragLoadingMaxRetry: 10,
          fragLoadingRetryDelay: 500,
        });

        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(win.Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          if (autoPlay) video.play().catch(() => {});
        });

        hls.on(win.Hls.Events.ERROR, (_: any, data: any) => {
          console.error("HLS错误:", data);
          if (data.fatal) {
            // 尝试切换到下一个源
            tryNextSource();
          }
        });

        hlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari原生支持
        video.src = url;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
          if (autoPlay) video.play().catch(() => {});
        });
      } else {
        setError("您的浏览器不支持HLS播放");
        setIsLoading(false);
      }
    } else {
      // 非HLS源
      video.src = url;
    }
  }, [autoPlay]);

  /**
   * 尝试切换到下一个播放源
   */
  const tryNextSource = useCallback(() => {
    const nextIndex = currentSourceIndex + 1;
    if (nextIndex < sources.length) {
      console.log(`切换到播放源 ${nextIndex + 1}: ${sources[nextIndex].name}`);
      setCurrentSourceIndex(nextIndex);
      onSourceChange?.(nextIndex);
    } else {
      setError("所有播放源均不可用");
      setIsLoading(false);
    }
  }, [currentSourceIndex, sources, onSourceChange]);

  /**
   * 切换播放源
   */
  const switchSource = useCallback((index: number) => {
    if (index === currentSourceIndex) return;

    setCurrentSourceIndex(index);
    setShowSourceMenu(false);
    setError(null);
    setIsLoading(true);
    onSourceChange?.(index);
  }, [currentSourceIndex, onSourceChange]);

  /**
   * 监听播放源变化，重新加载视频
   */
  useEffect(() => {
    if (!currentSource?.url) return;

    setIsLoading(true);
    setError(null);

    const video = videoRef.current;
    if (!video) return;

    // 记录当前播放位置
    const savedTime = video.currentTime;

    initHls(currentSource.url);

    // 尝试恢复播放位置
    const handleLoadedMetadata = () => {
      if (savedTime > 0 && video.duration > savedTime) {
        video.currentTime = savedTime;
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [currentSourceIndex, currentSource?.url, initHls]);

  /**
   * 视频事件监听
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlers = {
      timeupdate: () => {
        setCurrentTime(video.currentTime);
        onTimeUpdate?.(video.currentTime, video.duration);
      },
      loadedmetadata: () => {
        setDuration(video.duration);
        setIsLoading(false);
      },
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      ended: () => {
        setIsPlaying(false);
        onEnded?.();
      },
      waiting: () => setIsLoading(true),
      canplay: () => setIsLoading(false),
      error: () => {
        console.error("视频播放错误");
        // 尝试切换到下一个源
        tryNextSource();
      },
    };

    Object.entries(handlers).forEach(([event, handler]) =>
      video.addEventListener(event, handler)
    );

    return () => {
      Object.entries(handlers).forEach(([event, handler]) =>
        video.removeEventListener(event, handler)
      );
    };
  }, [currentSourceIndex, onTimeUpdate, onEnded, tryNextSource]);

  /**
   * 控制栏自动隐藏
   */
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (isPlaying && !showSourceMenu) setShowControls(false);
      }, 3000);
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isPlaying, showSourceMenu]);

  /**
   * 保存观看时长到localStorage
   */
  const saveWatchTime = useCallback(() => {
    // 如果正在播放，先累加当前时间段
    let currentTotal = totalWatchTimeRef.current;
    if (watchStartTimeRef.current) {
      currentTotal += Math.round((Date.now() - watchStartTimeRef.current) / 1000);
    }

    // 只有大于1秒才保存，且防止重复保存
    if (currentTotal > 1 && title && !savedRef.current) {
      savedRef.current = true;
      const watchLog = JSON.parse(localStorage.getItem("stellaflix_watch_time") || "[]");
      watchLog.push({
        title,
        duration: currentTotal,
        timestamp: Date.now(),
      });
      localStorage.setItem("stellaflix_watch_time", JSON.stringify(watchLog.slice(-100)));
    }
  }, [title]);

  /**
   * 组件卸载时保存观看时长
   */
  useEffect(() => {
    return () => {
      saveWatchTime();
    };
  }, [saveWatchTime]);

  /**
   * 播放/暂停
   */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // 开始播放，记录开始时间，重置保存标志
      savedRef.current = false;
      watchStartTimeRef.current = Date.now();
      video.play().catch((err) => {
        if (err.name !== "AbortError") console.error("播放失败:", err);
      });
    } else {
      // 暂停播放，累加观看时长并保存
      if (watchStartTimeRef.current) {
        const elapsed = Math.round((Date.now() - watchStartTimeRef.current) / 1000);
        totalWatchTimeRef.current += elapsed;
        watchStartTimeRef.current = null;
        // 暂停时立即保存
        saveWatchTime();
      }
      video.pause();
    }
  };

  /**
   * 静音切换
   */
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  /**
   * 音量变化
   */
  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      video.muted = true;
      setIsMuted(true);
    } else if (video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  /**
   * 跳转
   */
  const seek = (deltaOrTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(
      0,
      Math.min(
        deltaOrTime < 100 ? video.currentTime + deltaOrTime : deltaOrTime,
        duration
      )
    );
  };

  /**
   * 全屏切换
   */
  const toggleFullscreen = () => {
    const container = document.getElementById("video-player-container");
    if (!container) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : container.requestFullscreen();
  };

  // 没有播放源
  if (!sources || sources.length === 0) {
    return (
      <div className="w-full aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">暂无可用播放源</p>
        </div>
      </div>
    );
  }

  return (
    <div
      id="video-player-container"
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* 视频元素 */}
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        playsInline
        autoPlay={autoPlay}
      />

      {/* 加载中 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-red-600 animate-spin mx-auto mb-2" />
            <p className="text-white text-sm">{currentSource?.name || "加载中..."}</p>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-white mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                initHls(currentSource.url);
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* 控制栏 */}
      {showControls && !error && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity">
          {/* 进度条 */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-white text-sm w-16 text-right">
              {formatTime(currentTime)}
            </span>
            <div
              className="flex-1 h-2 bg-gray-600 rounded-full cursor-pointer group/progress relative"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - rect.left) / rect.width) * duration);
              }}
            >
              <div
                className="absolute h-full bg-red-600 rounded-full"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              <div
                className="absolute w-4 h-4 bg-red-600 rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover/progress:opacity-100 transition"
                style={{ left: `calc(${(currentTime / duration) * 100}% - 8px)` }}
              />
            </div>
            <span className="text-white text-sm w-16">{formatTime(duration)}</span>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* 后退10秒 */}
              <button
                onClick={() => seek(-10)}
                className="p-2 hover:bg-white/20 rounded transition"
                title="后退10秒"
              >
                <SkipBack className="w-5 h-5 text-white" />
              </button>

              {/* 播放/暂停 */}
              <button
                onClick={togglePlay}
                className="p-2 hover:bg-white/20 rounded transition"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white" fill="white" />
                )}
              </button>

              {/* 前进10秒 */}
              <button
                onClick={() => seek(10)}
                className="p-2 hover:bg-white/20 rounded transition"
                title="前进10秒"
              >
                <SkipForward className="w-5 h-5 text-white" />
              </button>

              {/* 音量控制 */}
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMute}
                  className="p-2 hover:bg-white/20 rounded transition"
                >
                  {isMuted || volume === 0 ? (
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
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-20 accent-red-600"
                />
              </div>

              {/* 标题 */}
              {title && (
                <span className="text-white text-sm truncate max-w-xs ml-2">
                  {title}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* 播放源选择 */}
              {sources.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowSourceMenu(!showSourceMenu)}
                    className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-white text-sm transition"
                  >
                    {currentSource?.name || `线路 ${currentSourceIndex + 1}`}
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {/* 播放源菜单 */}
                  {showSourceMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-[#2a2a2a] rounded-lg shadow-xl overflow-hidden min-w-[150px]">
                      {sources.map((source, index) => (
                        <button
                          key={source.id}
                          onClick={() => switchSource(index)}
                          className={`flex items-center gap-2 w-full px-4 py-2 text-left text-sm transition ${
                            index === currentSourceIndex
                              ? "bg-red-600 text-white"
                              : "text-gray-300 hover:bg-[#3a3a3a]"
                          }`}
                        >
                          {index === currentSourceIndex && (
                            <Check className="w-4 h-4" />
                          )}
                          <span className={index === currentSourceIndex ? "" : "ml-6"}>
                            {source.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
      )}
    </div>
  );
}
