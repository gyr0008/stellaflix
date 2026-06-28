/**
 * NetflixGC 播放页面
 *
 * 路径：/netflixgc/play?id=118539
 *
 * 功能：
 * 1. 播放 NetflixGC 视频（使用 hls.js 支持 m3u8）
 * 2. 多源选择（蓝光、1080P、4K等）
 * 3. 多集切换
 */

'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, Loader2, ChevronDown, Volume2, VolumeX, Play, Shield, ShieldOff } from 'lucide-react';
import HlsPlayer from '@/components/HlsPlayer';

/** 广告拦截配置 */
const AD_BLOCKER_CONFIG = {
  // 广告相关的 class 名称（常见模式）
  adClassPatterns: [
    /ad[-_]?popup/i,
    /ad[-_]?overlay/i,
    /ad[-_]?modal/i,
    /ad[-_]?container/i,
    /ad[-_]?wrapper/i,
    /preroll/i,
    /midroll/i,
    /postroll/i,
    /video[-_]?ad/i,
    /player[-_]?ad/i,
    /.float[-_]?ad/i,
    /popup[-_]?ad/i,
  ],
  // 广告相关的 ID 名称
  adIdPatterns: [
    /ad[-_]?container/i,
    /ad[-_]?wrapper/i,
    /ad[-_]?modal/i,
    /ad[-_]?popup/i,
    /preroll/i,
    /video[-_]?ad/i,
  ],
  // 广告相关的选择器（精确匹配）
  adSelectors: [
    '[class*="ad-popup"]',
    '[class*="ad-overlay"]',
    '[class*="ad-modal"]',
    '[id*="ad-container"]',
    '[id*="ad-wrapper"]',
    '.video-ad',
    '.preroll-ad',
  ],
};

/** 播放源类型 */
interface PlaySource {
  key: string;
  name: string;
  quality: string;
}

/**
 * 广告拦截 Hook
 * 监听 DOM 变化，自动移除广告元素
 */
function useAdBlocker(enabled: boolean = true) {
  const removedAdsRef = useRef<Set<Element>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    /** 检查元素是否是广告 */
    const isAdElement = (element: Element): boolean => {
      const className = element.className?.toString() || '';
      const id = element.id || '';

      // 检查 class 名称
      if (AD_BLOCKER_CONFIG.adClassPatterns.some(p => p.test(className))) {
        return true;
      }

      // 检查 ID 名称
      if (AD_BLOCKER_CONFIG.adIdPatterns.some(p => p.test(id))) {
        return true;
      }

      // 检查精确选择器
      for (const selector of AD_BLOCKER_CONFIG.adSelectors) {
        try {
          if (element.matches(selector)) return true;
        } catch {}
      }

      // 检查内联样式（全屏覆盖层）
      const style = element.getAttribute('style') || '';
      if (style.includes('position: fixed') && style.includes('z-index:')) {
        const zIndex = parseInt(style.match(/z-index:\s*(\d+)/)?.[1] || '0');
        if (zIndex > 999) return true; // 高 z-index 的 fixed 元素可能是广告
      }

      return false;
    };

    /** 移除广告元素 */
    const removeAd = (element: Element) => {
      if (removedAdsRef.current.has(element)) return;
      removedAdsRef.current.add(element);
      console.log('[广告拦截] 已移除广告元素:', element);
      element.remove();
    };

    /** 扫描页面中的广告 */
    const scanForAds = () => {
      // 使用选择器扫描
      for (const selector of AD_BLOCKER_CONFIG.adSelectors) {
        try {
          document.querySelectorAll(selector).forEach(removeAd);
        } catch {}
      }
    };

    // MutationObserver 监听 DOM 变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (isAdElement(node)) {
              removeAd(node);
            }
            // 检查子元素
            node.querySelectorAll?.('*').forEach(child => {
              if (isAdElement(child)) {
                removeAd(child);
              }
            });
          }
        });
      });
    });

    // 开始监听
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'style'],
    });

    // 初始扫描
    scanForAds();

    return () => {
      observer.disconnect();
      removedAdsRef.current.clear();
    };
  }, [enabled]);
}

/**
 * 分析 m3u8 广告段
 * 识别并返回广告时间范围
 */
function analyzeM3u8ForAds(m3u8Content: string): { start: number; end: number }[] {
  const adSegments: { start: number; end: number }[] = [];
  const lines = m3u8Content.split('\n');

  let currentTime = 0;
  let inAdSegment = false;
  let adStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检查段时长
    if (line.startsWith('#EXTINF:')) {
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      if (durationMatch) {
        const duration = parseFloat(durationMatch[1]);

        // 检查下一行是否是广告（通常包含特殊标记）
        const nextLine = (lines[i + 1] || '').trim();
        const isAd = nextLine.includes('ad') || nextLine.includes('promo') ||
                     nextLine.includes('commercial') || nextLine.includes('sponsor');

        if (isAd && !inAdSegment) {
          adStart = currentTime;
          inAdSegment = true;
        } else if (!isAd && inAdSegment) {
          adSegments.push({ start: adStart, end: currentTime });
          inAdSegment = false;
        }

        currentTime += duration;
      }
    }
  }

  // 处理末尾的广告段
  if (inAdSegment) {
    adSegments.push({ start: adStart, end: currentTime });
  }

  return adSegments;
}

/**
 * 播放页面内容
 */
function PlayContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const title = searchParams.get('title') || '视频播放';

  const [m3u8Url, setM3u8Url] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 多源相关
  const [sources, setSources] = useState<PlaySource[]>([]);
  const [currentSource, setCurrentSource] = useState<string>('bfzym3u8');
  const [showSourceMenu, setShowSourceMenu] = useState(false);

  // 视频播放器引用
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  // 播放控制状态
  const [isMuted, setIsMuted] = useState(true); // 默认静音（允许自动播放）
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true); // 显示播放按钮覆盖层

  // 广告拦截状态
  const [adBlockerEnabled, setAdBlockerEnabled] = useState(true);
  const [adBlockerStatus, setAdBlockerStatus] = useState<string>('已启用');
  const [adsFiltered, setAdsFiltered] = useState<number>(0); // 过滤的广告数量

  // 启用广告拦截
  useAdBlocker(adBlockerEnabled);

  /** 获取代理 m3u8 地址（带广告过滤） */
  const getProxiedM3u8Url = useCallback((originalUrl: string): string => {
    if (!adBlockerEnabled) return originalUrl;
    // 使用代理 API 进行广告过滤
    return `/api/netflixgc/m3u8-proxy?url=${encodeURIComponent(originalUrl)}&filter=true`;
  }, [adBlockerEnabled]);

  /** 加载播放地址（不触发页面重新渲染导致滚动位置丢失） */
  const loadPlayUrl = async (sourceKey: string) => {
    if (!id) return;

    // 保存当前滚动位置
    const scrollY = window.scrollY;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/netflixgc/play?id=${id}&source=${sourceKey}`);
      const data = await res.json();

      if (data.success && data.m3u8Url) {
        setM3u8Url(data.m3u8Url);
        setCurrentSource(sourceKey);
        if (data.availableSources) {
          setSources(data.availableSources);
        }
      } else {
        setError(data.error || '无法获取播放地址');
      }
    } catch (err) {
      setError('网络请求失败');
    } finally {
      setLoading(false);
      // 恢复滚动位置
      window.scrollTo(0, scrollY);
    }
  };

  /** 初始化 HLS 播放器 */
  useEffect(() => {
    if (!m3u8Url || !videoRef.current) return;

    // 动态加载 hls.js
    const loadHls = async () => {
      const Hls = (await import('hls.js')).default;

      const video = videoRef.current;
      if (!video) return;

      // 销毁之前的 HLS 实例
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // 设置静音状态（允许自动播放）
      video.muted = true;
      video.volume = 1;

      // 检查浏览器是否原生支持 HLS (Safari)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari 原生支持（不支持广告拦截）
        video.src = m3u8Url;
        video.play().catch(() => {});
        setAdBlockerStatus('Safari 原生模式，部分功能受限');
      } else if (Hls.isSupported()) {
        // 使用 hls.js（支持广告拦截）- 智能平衡优化（清晰+流畅+无拖影）
        const hls = new Hls({
          // === 核心性能配置 ===
          enableWorker: true,           // WebWorker 解码，减少主线程压力
          enableSoftwareAES: false,     // 使用 WebCrypto 硬件加速解密
          lowLatencyMode: false,        // 稳定性优先

          // === 缓冲区配置（智能平衡）===
          maxBufferLength: 20,          // 20秒缓冲（平衡延迟和流畅）
          maxMaxBufferLength: 60,       // 最大60秒缓冲
          maxBufferSize: 30 * 1024 * 1024, // 30MB缓冲区
          maxBufferHole: 0.2,           // 最小缓冲间隙（防跳帧）
          backBufferLength: 15,         // 后向缓冲15秒

          // === 预取配置（关键：提前加载）===
          startFragPrefetch: true,      // 启用片段预取

          // === 自适应码率（ABR）配置 - 智能平衡 ===
          startLevel: -1,               // 自动选择初始码率
          testBandwidth: true,          // 启用带宽测试
          abrEwmaDefaultEstimate: 8000000, // 默认估算8Mbps（平衡）
          abrBandWidthFactor: 0.65,     // 带宽安全系数（平衡）
          abrBandWidthUpFactor: 0.85,   // 带宽上升系数（较快提升）
          abrMaxWithRealBitrate: true,  // 使用真实码率计算

          // === 段加载配置（快速响应）===
          manifestLoadingTimeOut: 8000,
          manifestLoadingMaxRetry: 5,
          manifestLoadingRetryDelay: 600,
          levelLoadingTimeOut: 8000,
          levelLoadingMaxRetry: 5,
          levelLoadingRetryDelay: 600,
          fragLoadingTimeOut: 8000,     // 片段加载超时（更快失败重试）
          fragLoadingMaxRetry: 10,      // 重试次数（更多）
          fragLoadingRetryDelay: 200,   // 重试延迟（更快）
          maxLoadingDelay: 1.5,         // 最大加载延迟（秒）

          // === 同步配置 ===
          liveSyncDurationCount: 2,     // 同步距离2段

          // === 质量限制配置 ===
          capLevelToPlayerSize: true,   // 根据播放器大小限制画质
          stretchShortVideoTrack: false,

          // === 字幕配置 ===
          renderTextTracksNatively: true,

          // === 跨域配置 ===
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.withCredentials = false;
          },
        });

        // 使用代理后的 m3u8 地址（带广告过滤）
        const effectiveM3u8Url = getProxiedM3u8Url(m3u8Url);
        console.log('[广告拦截] 使用代理 m3u8:', adBlockerEnabled ? '是' : '否');

        // 监听播放列表加载，统计过滤效果
        if (adBlockerEnabled) {
          hls.on(Hls.Events.LEVEL_LOADED, (_event: any, data: any) => {
            if (data.details && data.details.fragments) {
              console.log(`[广告拦截] 当前播放列表片段数: ${data.details.fragments.length}`);
            }
          });
        }

        hls.loadSource(effectiveM3u8Url);
        hls.attachMedia(video);

        // === 智能画质监控系统 ===
        let lastTime = 0;
        let frameDropCount = 0;
        let currentQuality = -1; // -1 = 自动
        const maxQuality = 1080; // 最大允许清晰度

        // 检测帧率并自动降级
        const monitorPerformance = () => {
          if (!video || video.paused) return;

          const currentTime = video.currentTime;
          const timeDiff = currentTime - lastTime;

          // 如果时间差异常（>100ms 但 <1s），可能有卡顿
          if (lastTime > 0 && timeDiff > 0.1 && timeDiff < 1) {
            frameDropCount++;
            if (frameDropCount > 3 && currentQuality === -1) {
              // 连续卡顿，降低画质
              const levels = hls.levels;
              if (hls.currentLevel > 0) {
                hls.currentLevel--;
                console.log(`[智能降级] 检测到卡顿，已降至 ${levels[hls.currentLevel]?.height || '?'}p`);
                frameDropCount = 0;
              }
            }
          } else {
            frameDropCount = Math.max(0, frameDropCount - 1);
          }

          lastTime = currentTime;
          requestAnimationFrame(monitorPerformance);
        };

        hls.on(Hls.Events.MANIFEST_PARSED, (_event: any, data: any) => {
          const levels = data.levels;
          if (levels && levels.length > 0) {
            // 限制最大清晰度为 1080p
            const maxHeight = Math.max(...levels.map((l: any) => l.height || 0));
            if (maxHeight > maxQuality) {
              const maxLevel = levels.findIndex((l: any) => (l.height || 0) <= maxQuality);
              if (maxLevel >= 0) {
                hls.currentLevel = maxLevel;
                console.log(`[画质优化] 已限制最大清晰度为 ${maxQuality}p`);
              }
            }

            // 输出可用画质
            console.log('[画质] 可用等级:', levels.map((l: any) => `${l.height}p`).join(', '));
          }

          // 静音状态下自动播放
          video.play().then(() => {
            setIsPlaying(true);
            setShowPlayOverlay(false);
            setAdBlockerStatus(adBlockerEnabled ? '已启用 - 代理过滤中' : '已禁用');
            // 开始性能监控
            requestAnimationFrame(monitorPerformance);
          }).catch(() => {
            console.log('等待用户交互后播放');
          });
        });

        // 监听缓冲区变化
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          const buffered = video.buffered;
          if (buffered.length > 0) {
            const bufferedEnd = buffered.end(buffered.length - 1);
            const currentTime = video.currentTime;
            const ahead = bufferedEnd - currentTime;
            // 缓冲不足时降低画质
            if (ahead < 5 && hls.currentLevel > 0) {
              hls.currentLevel--;
              console.log(`[缓冲优化] 缓冲不足(${ahead.toFixed(1)}s)，已降低画质`);
            }
          }
        });

        hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (data.fatal) {
            console.error('HLS fatal error:', data);
            setError('视频加载失败，请尝试其他播放源');
          }
        });

        // 全屏变化监听
        const handleFullscreenChange = () => {
          const isFullscreen = !!document.fullscreenElement;
          console.log(`[全屏] ${isFullscreen ? '进入全屏' : '退出全屏'}`);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);

        hlsRef.current = hls;
      } else {
        setError('您的浏览器不支持 HLS 视频播放');
      }
    };

    loadHls();

    // 清理函数
    return () => {
      // 移除全屏监听
      document.removeEventListener('fullscreenchange', () => {});

      // 销毁 HLS 实例
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [m3u8Url, adBlockerEnabled]);

  /** 点击播放按钮 */
  const handlePlayClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    setIsMuted(false);
    video.play().then(() => {
      setIsPlaying(true);
      setShowPlayOverlay(false);
    }).catch(console.error);
  }, []);

  /** 切换静音 */
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  /** 初始加载 */
  useEffect(() => {
    loadPlayUrl(currentSource);
  }, [id]);

  /** 切换源 */
  const switchSource = (sourceKey: string) => {
    setCurrentSource(sourceKey);
    setShowSourceMenu(false);
    loadPlayUrl(sourceKey);
  };

  // 无效 ID
  if (!id) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">无效的视频 ID</h1>
          <Link
            href="/netflixgc"
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            scroll={false}
          >
            <ArrowLeft className="w-5 h-5" />
            返回列表
          </Link>
        </div>
      </div>
    );
  }

  // 获取当前源名称
  const currentSourceName = sources.find(s => s.key === currentSource)?.name || currentSource;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* 顶部导航 */}
      <div className="bg-[#14141f] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/netflixgc"
              className="text-gray-400 hover:text-white transition"
              scroll={false}
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-xl font-bold text-white truncate flex-1">{title}</h1>

            {/* 源选择按钮 */}
            {sources.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowSourceMenu(!showSourceMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition"
                >
                  <span className="text-sm">{currentSourceName}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {/* 源选择菜单 */}
                {showSourceMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a2e] rounded-lg shadow-xl z-50 border border-white/10">
                    <div className="p-2">
                      <div className="text-xs text-gray-500 px-2 py-1">选择播放源</div>
                      {sources.map((source) => (
                        <button
                          key={source.key}
                          onClick={() => switchSource(source.key)}
                          className={`w-full text-left px-3 py-2 rounded text-sm ${
                            currentSource === source.key
                              ? 'bg-red-600 text-white'
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          <span>{source.name}</span>
                          <span className="ml-2 text-xs opacity-60">{source.quality}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 播放器区域 - 使用固定高度避免布局跳动 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="aspect-video bg-[#14141f] rounded-lg overflow-hidden relative">
          {/* 加载状态覆盖层 */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">正在加载播放地址...</p>
              </div>
            </div>
          )}

          {/* 错误状态覆盖层 */}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={() => loadPlayUrl(currentSource)}
                  className="text-red-400 hover:text-red-300"
                >
                  重新加载
                </button>
              </div>
            </div>
          )}

          {/* 视频播放器 - 极致优化防拖影 */}
          {m3u8Url && (
            <video
              ref={videoRef}
              controls
              muted
              playsInline
              preload="auto"
              className="w-full h-full"
              style={{
                willChange: 'transform',
                transform: 'translateZ(0)',
                imageRendering: 'auto',      // 平滑渲染
                backfaceVisibility: 'hidden', // 防止闪烁
                perspective: 1000,            // 3D 性能优化
              }}
            >
              您的浏览器不支持视频播放
            </video>
          )}

          {/* 播放按钮覆盖层 */}
          {showPlayOverlay && m3u8Url && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer z-20"
              onClick={handlePlayClick}
            >
              <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition transform hover:scale-110">
                <Play className="w-10 h-10 text-white ml-1" />
              </div>
              <p className="absolute bottom-8 text-white text-sm">点击播放（静音）</p>
            </div>
          )}

          {/* 静音切换按钮 */}
          {!showPlayOverlay && m3u8Url && (
            <button
              onClick={toggleMute}
              className="absolute top-4 right-4 p-2 bg-black/50 rounded-full hover:bg-black/70 transition z-30"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-white" />
              ) : (
                <Volume2 className="w-5 h-5 text-white" />
              )}
            </button>
          )}

          {/* 广告拦截状态指示器 */}
          {!showPlayOverlay && m3u8Url && (
            <div className="absolute top-4 left-4 flex items-center gap-2 z-30">
              <button
                onClick={() => setAdBlockerEnabled(!adBlockerEnabled)}
                className={`p-2 rounded-full transition ${
                  adBlockerEnabled
                    ? 'bg-green-600/80 hover:bg-green-700'
                    : 'bg-gray-600/80 hover:bg-gray-700'
                }`}
                title={adBlockerEnabled ? '广告拦截已启用' : '广告拦截已禁用'}
              >
                {adBlockerEnabled ? (
                  <Shield className="w-5 h-5 text-white" />
                ) : (
                  <ShieldOff className="w-5 h-5 text-white" />
                )}
              </button>
              <span className={`text-xs px-2 py-1 rounded ${
                adBlockerEnabled ? 'bg-green-600/80' : 'bg-gray-600/80'
              }`}>
                {adBlockerStatus}
              </span>
            </div>
          )}
        </div>

        {/* 视频信息 */}
        <div className="mt-4 p-4 bg-[#14141f] rounded-lg border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">
              当前播放源：<span className="text-white">{currentSourceName}</span>
            </span>
            <span className="text-xs text-gray-500">ID: {id}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">
              广告拦截：<span className={adBlockerEnabled ? 'text-green-400' : 'text-gray-500'}>
                {adBlockerEnabled ? '已启用 (m3u8 过滤)' : '已禁用'}
              </span>
            </span>
            <span className="text-xs text-gray-500">{adBlockerStatus}</span>
          </div>
          <p className="text-xs text-gray-500 break-all">
            播放地址：{m3u8Url || '加载中...'}
          </p>
        </div>

        {/* 可用源列表 */}
        {sources.length > 0 && (
          <div className="mt-4 p-4 bg-[#14141f] rounded-lg border border-white/5">
            <h3 className="text-sm font-medium text-gray-400 mb-3">可用播放源</h3>
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <button
                  key={source.key}
                  onClick={() => switchSource(source.key)}
                  className={`px-3 py-1.5 rounded text-sm transition ${
                    currentSource === source.key
                      ? 'bg-red-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {source.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 播放页面（带 Suspense）
 */
export default function NetflixGCPlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        </div>
      }
    >
      <PlayContent />
    </Suspense>
  );
}
