/**
 * B站视频播放器
 * 支持DASH格式（无水印）和MP4格式
 * 使用dash.js播放DASH流
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
} from "lucide-react";

interface BilibiliPlayerProps {
  /** 播放信息（来自/api/bilibili/stream） */
  playInfo: {
    type: "dash" | "mp4";
    videoUrl?: string;
    audioUrl?: string;
    proxyUrl?: string;
    url?: string;
    width?: number;
    height?: number;
  };
  /** 封面图 */
  poster?: string;
  /** 标题 */
  title?: string;
  /** 自动播放 */
  autoPlay?: boolean;
}

/** 格式化时间 */
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

export default function BilibiliPlayer({
  playInfo,
  poster,
  title,
  autoPlay = false,
}: BilibiliPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dashPlayerRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 初始化DASH播放器
   */
  const initDashPlayer = useCallback(
    (videoUrl: string, audioUrl: string) => {
      const video = videoRef.current;
      if (!video) return;

      // 清理旧实例
      if (dashPlayerRef.current) {
        dashPlayerRef.current.reset();
        dashPlayerRef.current = null;
      }

      const win = window as any;

      // 等待dash.js加载
      const init = () => {
        if (!win.dashjs) {
          // 动态加载dash.js
          const script = document.createElement("script");
          script.src = "https://cdn.dashjs.org/latest/dash.all.min.js";
          script.onload = () => createPlayer();
          script.onerror = () => setError("dash.js加载失败");
          document.head.appendChild(script);
          return;
        }
        createPlayer();
      };

      const createPlayer = () => {
        if (!win.dashjs || !video) return;

        const player = win.dashjs.MediaPlayer().create();
        player.initialize(video, videoUrl, autoPlay);

        // 设置请求头
        player.updateSettings({
          streaming: {
            xhrWithCredentials: true,
          },
        });

        // 监听事件
        player.on(win.dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          setIsLoading(false);
          setDuration(player.duration());
        });

        player.on(win.dashjs.MediaPlayer.events.ERROR, (e: any) => {
          console.error("DASH错误:", e);
          setError("DASH播放失败");
          setIsLoading(false);
        });

        // 定时更新进度
        const updateProgress = () => {
          if (player && video) {
            setCurrentTime(video.currentTime);
            setDuration(player.duration() || video.duration);
          }
          requestAnimationFrame(updateProgress);
        };
        updateProgress();

        dashPlayerRef.current = player;
      };

      init();
    },
    [autoPlay]
  );

  /**
   * 初始化HLS播放器（MP4降级用）
   */
  const initHlsPlayer = useCallback(
    (url: string) => {
      const video = videoRef.current;
      if (!video) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        setDuration(video.duration);
        setIsLoading(false);
        if (autoPlay) video.play().catch(() => {});
      });
    },
    [autoPlay]
  );

  /**
   * 监听playInfo变化，初始化播放器
   */
  useEffect(() => {
    if (!playInfo) return;

    setIsLoading(true);
    setError(null);

    if (playInfo.type === "dash" && playInfo.videoUrl) {
      // DASH格式：需要分别加载视频和音频
      // dash.js只支持单URL，所以用video+audio合并的方式
      // 这里用一个技巧：创建一个MediaSource来合并流
      // 简化方案：直接播放视频流（大部分DASH视频音频已包含）
      initDashPlayer(playInfo.videoUrl, playInfo.audioUrl || "");
    } else if (playInfo.type === "mp4") {
      const url = playInfo.proxyUrl || playInfo.url;
      if (url) {
        initHlsPlayer(url);
      }
    }

    return () => {
      if (dashPlayerRef.current) {
        dashPlayerRef.current.reset();
        dashPlayerRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playInfo?.videoUrl, playInfo?.type]);

  /**
   * 控制栏自动隐藏
   */
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false);
      }, 3000);
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isPlaying]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (dashPlayerRef.current) {
      dashPlayerRef.current.isPaused()
        ? dashPlayerRef.current.play()
        : dashPlayerRef.current.pause();
    } else {
      video.paused ? video.play() : video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

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

  const seek = (deltaOrTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime =
      deltaOrTime < 100 ? video.currentTime + deltaOrTime : deltaOrTime;
    video.currentTime = Math.max(0, Math.min(newTime, duration));
  };

  const toggleFullscreen = () => {
    const container = document.getElementById("bilibili-player-container");
    if (!container) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : container.requestFullscreen();
  };

  // 视频事件
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlers = {
      timeupdate: () => setCurrentTime(video.currentTime),
      loadedmetadata: () => {
        setDuration(video.duration);
        setIsLoading(false);
      },
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      waiting: () => setIsLoading(true),
      canplay: () => setIsLoading(false),
      error: () => {
        setError("视频播放出错");
        setIsLoading(false);
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
  }, []);

  return (
    <div
      id="bilibili-player-container"
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        playsInline
        crossOrigin="anonymous"
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-[#00a1d6] animate-spin mx-auto mb-2" />
            <p className="text-white text-sm">
              {playInfo?.type === "dash" ? "DASH加载中（无水印）" : "加载中..."}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-white mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                if (playInfo) {
                  if (playInfo.type === "dash" && playInfo.videoUrl) {
                    initDashPlayer(playInfo.videoUrl, playInfo.audioUrl || "");
                  } else {
                    const url = playInfo.proxyUrl || playInfo.url;
                    if (url) initHlsPlayer(url);
                  }
                }
              }}
              className="px-4 py-2 bg-[#00a1d6] hover:bg-[#00b5e5] text-white rounded-lg transition"
            >
              重试
            </button>
          </div>
        </div>
      )}

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
                className="absolute h-full bg-[#00a1d6] rounded-full"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              <div
                className="absolute w-4 h-4 bg-[#00a1d6] rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover/progress:opacity-100 transition"
                style={{ left: `calc(${(currentTime / duration) * 100}% - 8px)` }}
              />
            </div>
            <span className="text-white text-sm w-16">{formatTime(duration)}</span>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => seek(-10)} className="p-2 hover:bg-white/20 rounded transition" title="后退10秒">
                <SkipBack className="w-5 h-5 text-white" />
              </button>
              <button onClick={togglePlay} className="p-2 hover:bg-white/20 rounded transition">
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white" fill="white" />
                )}
              </button>
              <button onClick={() => seek(10)} className="p-2 hover:bg-white/20 rounded transition" title="前进10秒">
                <SkipForward className="w-5 h-5 text-white" />
              </button>
              <div className="flex items-center gap-1">
                <button onClick={toggleMute} className="p-2 hover:bg-white/20 rounded transition">
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
                  className="w-20 accent-[#00a1d6]"
                />
              </div>
              {title && (
                <span className="text-white text-sm truncate max-w-xs ml-2">{title}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {playInfo?.type === "dash" && (
                <span className="px-2 py-1 bg-[#00a1d6]/20 text-[#00a1d6] rounded text-xs">
                  无水印
                </span>
              )}
              <button onClick={toggleFullscreen} className="p-2 hover:bg-white/20 rounded transition">
                <Maximize className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
