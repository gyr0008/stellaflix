/**
 * HLS 高性能播放器组件
 *
 * 功能：
 * 1. 智能预加载
 * 2. 自适应码率
 * 3. 优化的缓冲策略
 * 4. WebWorker 解码
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface HlsPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

/**
 * 高性能 HLS 播放器
 */
export default function HlsPlayer({
  src,
  poster,
  className = '',
  onPlay,
  onPause,
  onEnded,
  onError,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 初始化 HLS 播放器 */
  const initPlayer = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !src) return;

    // 清理旧实例
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsLoading(true);
    setError(null);

    // 动态导入 hls.js
    const Hls = (await import('hls.js')).default;

    // 检查是否原生支持 HLS (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });
      return;
    }

    // 检查 hls.js 是否支持
    if (!Hls.isSupported()) {
      setError('您的浏览器不支持 HLS 播放');
      setIsLoading(false);
      onError?.('HLS not supported');
      return;
    }

    // 创建优化的 HLS 实例
    const hls = new Hls({
      // === 核心性能配置 ===
      enableWorker: true,           // WebWorker 解码，减少主线程压力
      enableSoftwareAES: true,      // 软件解密
      lowLatencyMode: false,        // 稳定性优先

      // === 缓冲区配置（关键优化）===
      maxBufferLength: 30,          // 最大缓冲 30 秒
      maxMaxBufferLength: 60,       // 最大允许缓冲 60 秒
      maxBufferSize: 20 * 1024 * 1024, // 20MB 缓冲区（增大）
      maxBufferHole: 0.5,           // 允许 0.5s 的缓冲间隙
      backBufferLength: Infinity,   // 保留后向缓冲，避免重放卡顿

      // === 自适应码率（ABR）配置 ===
      startLevel: -1,               // 自动选择初始码率
      testBandwidth: true,          // 启用带宽测试
      abrEwmaDefaultEstimate: 5000000, // 默认估计 5Mbps
      abrBandWidthFactor: 0.7,      // 带宽安全系数（保守）
      abrBandWidthUpFactor: 0.9,    // 带宽上升系数

      // === 段加载配置 ===
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 5,
      manifestLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 5,
      levelLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 30000,    // 增加片段加载超时
      fragLoadingMaxRetry: 10,      // 增加重试次数
      fragLoadingRetryDelay: 500,

      // === 同步配置 ===
      liveSyncDurationCount: 3,

      // === 跨域配置 ===
      xhrSetup: (xhr: XMLHttpRequest) => {
        xhr.withCredentials = false;
      },

      // === 日志（生产环境关闭）===
      debug: false,
    });

    // 加载源
    hls.loadSource(src);
    hls.attachMedia(video);

    // 监听事件
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setIsLoading(false);
      console.log('[HLS Player] 播放列表已加载');

      // 自动播放
      video.play().then(() => {
        onPlay?.();
      }).catch(() => {
        console.log('[HLS Player] 等待用户交互');
      });
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_: any, data: any) => {
      console.log(`[HLS Player] 码率切换: Level ${data.level}`);
    });

    hls.on(Hls.Events.FRAG_LOADED, (_: any, data: any) => {
      // 片段加载完成
    });

    hls.on(Hls.Events.ERROR, (_: any, data: any) => {
      console.error('[HLS Player] 错误:', data);

      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('[HLS Player] 网络错误，尝试恢复...');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('[HLS Player] 媒体错误，尝试恢复...');
            hls.recoverMediaError();
            break;
          default:
            setError('视频播放失败');
            onError?.('Playback failed');
            hls.destroy();
            break;
        }
      }
    });

    hlsRef.current = hls;
  }, [src, onPlay, onPause, onEnded, onError]);

  // 初始化播放器
  useEffect(() => {
    initPlayer();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [initPlayer]);

  // 视频事件处理
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => onPlay?.();
    const handlePause = () => onPause?.();
    const handleEnded = () => onEnded?.();

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onPlay, onPause, onEnded]);

  return (
    <div className={`relative ${className}`}>
      {/* 视频元素 */}
      <video
        ref={videoRef}
        poster={poster}
        controls
        playsInline
        className="w-full h-full"
      />

      {/* 加载指示器 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white text-sm">加载中...</p>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-2">{error}</p>
            <button
              onClick={initPlayer}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
            >
              重试
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
