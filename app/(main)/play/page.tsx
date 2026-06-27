/**
 * 通用播放页面
 * 接收 URL 参数播放视频
 * 参数：url (视频地址), title (标题)
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import SimpleVideoPlayer from '@/components/SimpleVideoPlayer';
import { parseVideoUrls } from '@/lib/video-utils';

/**
 * 解析视频 URL（使用统一工具函数）
 * @param rawUrl 原始URL字符串
 * @returns 解析后的可播放URL
 */
function parseVideoUrl(rawUrl: string): string {
  if (!rawUrl) return '';

  const sources = parseVideoUrls(rawUrl);
  return sources[0]?.url || '';
}

/**
 * 加载 HLS.js 脚本
 */
function useHlsLoader() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const win = window as any;
    if (win.Hls) {
      setLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, []);

  return loaded;
}

/**
 * 播放页面内容组件
 */
function PlayContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawUrl = searchParams.get('url') || '';
  const title = searchParams.get('title') || '视频播放';
  const videoUrl = parseVideoUrl(rawUrl);
  const hlsLoaded = useHlsLoader();

  // 无效 URL
  if (!videoUrl) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">无效的播放链接</h1>
          <p className="text-gray-400 mb-6">未找到视频地址</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* 顶部导航 */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-gray-400 hover:text-white transition"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-white truncate">{title}</h1>
          </div>
        </div>
      </div>

      {/* 播放器 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-black rounded-lg overflow-hidden">
          {hlsLoaded ? (
            <SimpleVideoPlayer src={videoUrl} title={title} autoPlay />
          ) : (
            <div className="aspect-video flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 播放页面（带 Suspense）
 */
export default function PlayPage() {
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