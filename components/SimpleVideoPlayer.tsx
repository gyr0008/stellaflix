"use client";

import { useState, useRef, useEffect } from "react";
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

interface SimpleVideoPlayerProps {
  url?: string;
  src?: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
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
 * HLS播放器 Hook
 */
function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  videoUrl: string | undefined,
  autoPlay: boolean,
  setError: (err: string | null) => void,
  setIsLoading: (loading: boolean) => void
) {
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (videoUrl.includes('.m3u8')) {
      const initHls = () => {
        const win = window as any;
        if (win.Hls && win.Hls.isSupported()) {
          if (hlsRef.current) hlsRef.current.destroy();

          const hls = new win.Hls({ debug: false, enableWorker: true, lowLatencyMode: true });
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          hls.on(win.Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            if (autoPlay) video.play().catch(() => {});
          });
          hls.on(win.Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal) {
              setError('视频加载失败');
              setIsLoading(false);
            }
          });
          hlsRef.current = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
          video.addEventListener('loadedmetadata', () => {
            setIsLoading(false);
            if (autoPlay) video.play().catch(() => {});
          });
        } else {
          setError('您的浏览器不支持 HLS 播放');
          setIsLoading(false);
        }
      };

      if (!(window as any).Hls) {
        setTimeout(initHls, 500);
      } else {
        initHls();
      }
    } else {
      video.src = videoUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl, autoPlay]);
}

/**
 * 视频事件 Hook
 */
function useVideoEvents(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  videoUrl: string | undefined,
  onTimeUpdate?: (currentTime: number, duration: number) => void,
  onEnded?: () => void
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useHlsPlayer(videoRef, videoUrl, false, setError, setIsLoading);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlers = {
      timeupdate: () => { setCurrentTime(video.currentTime); onTimeUpdate?.(video.currentTime, video.duration); },
      loadedmetadata: () => { setDuration(video.duration); setIsLoading(false); },
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      ended: () => { setIsPlaying(false); onEnded?.(); },
      waiting: () => setIsLoading(true),
      canplay: () => setIsLoading(false),
      error: () => { setError("视频加载失败"); setIsLoading(false); },
    };

    Object.entries(handlers).forEach(([event, handler]) => video.addEventListener(event, handler));
    return () => Object.entries(handlers).forEach(([event, handler]) => video.removeEventListener(event, handler));
  }, [videoUrl, onTimeUpdate, onEnded]);

  return { isPlaying, setIsPlaying, currentTime, duration, isLoading, setIsLoading, error, setError };
}

/**
 * 控制栏自动隐藏 Hook
 */
function useAutoHideControls(isPlaying: boolean) {
  const [showControls, setShowControls] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return { showControls, setShowControls };
}

/**
 * 进度条组件
 */
function ProgressBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const progress = (currentTime / duration) * 100;

  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-white text-sm w-16 text-right">{formatTime(currentTime)}</span>
      <div
        className="flex-1 h-2 bg-gray-600 rounded-full cursor-pointer group/progress relative"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * duration);
        }}
      >
        <div className="absolute h-full bg-red-600 rounded-full" style={{ width: `${progress}%` }} />
        <div
          className="absolute w-4 h-4 bg-red-600 rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover/progress:opacity-100 transition"
          style={{ left: `calc(${progress}% - 8px)` }}
        />
      </div>
      <span className="text-white text-sm w-16">{formatTime(duration)}</span>
    </div>
  );
}

/**
 * 控制按钮组件
 */
function ControlButtons({
  isPlaying,
  isMuted,
  volume,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onSeek,
  onToggleFullscreen,
  title,
}: {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  onSeek: (t: number) => void;
  onToggleFullscreen: () => void;
  title?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button onClick={() => onSeek(-10)} className="p-2 hover:bg-white/20 rounded transition">
          <SkipBack className="w-5 h-5 text-white" />
        </button>
        <button onClick={onTogglePlay} className="p-2 hover:bg-white/20 rounded transition">
          {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" fill="white" />}
        </button>
        <button onClick={() => onSeek(10)} className="p-2 hover:bg-white/20 rounded transition">
          <SkipForward className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onToggleMute} className="p-2 hover:bg-white/20 rounded transition">
            {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-20 accent-red-600"
          />
        </div>
        {title && <span className="text-white text-sm truncate max-w-xs">{title}</span>}
      </div>
      <button onClick={onToggleFullscreen} className="p-2 hover:bg-white/20 rounded transition">
        <Maximize className="w-5 h-5 text-white" />
      </button>
    </div>
  );
}

export default function SimpleVideoPlayer({
  url,
  src,
  poster,
  title,
  autoPlay = false,
  onTimeUpdate,
  onEnded,
}: SimpleVideoPlayerProps) {
  const videoUrl = src || url;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const { isPlaying, setIsPlaying, currentTime, duration, isLoading, error } = useVideoEvents(
    videoRef, videoUrl, onTimeUpdate, onEnded
  );
  const { showControls, setShowControls } = useAutoHideControls(isPlaying);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play().catch((err) => { if (err.name !== 'AbortError') console.error('播放失败:', err); }) : video.pause();
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
    if (newVolume === 0) { video.muted = true; setIsMuted(true); }
    else if (video.muted) { video.muted = false; setIsMuted(false); }
  };

  const seek = (deltaOrTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(deltaOrTime < 100 ? video.currentTime + deltaOrTime : deltaOrTime, duration));
  };

  const toggleFullscreen = () => {
    const container = document.getElementById("player-container");
    if (!container) return;
    document.fullscreenElement ? document.exitFullscreen() : container.requestFullscreen();
  };

  if (error) {
    return (
      <div className="w-full aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-white">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition">
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="player-container"
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={poster}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        playsInline
        autoPlay={autoPlay}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
        </div>
      )}

      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity">
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={seek} />
          <ControlButtons
            isPlaying={isPlaying}
            isMuted={isMuted}
            volume={volume}
            onTogglePlay={togglePlay}
            onToggleMute={toggleMute}
            onVolumeChange={handleVolumeChange}
            onSeek={seek}
            onToggleFullscreen={toggleFullscreen}
            title={title}
          />
        </div>
      )}
    </div>
  );
}
