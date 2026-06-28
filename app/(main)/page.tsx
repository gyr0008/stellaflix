/**
 * 首页 - 深色作品集风格
 *
 * 用途: 展示电影推荐内容，采用类似作品集的深色设计风格
 * 依赖:
 *   - Header: 顶部导航栏
 *   - MovieCard: 电影卡片组件
 *   - framer-motion: 动画库
 * 架构:
 *   - Hero 区域：纯净背景展示
 *   - 高分电影：20部高分推荐
 *   - 热播电影：20部热播榜
 *   - 纪录片：20部纪录片推荐
 *
 * 性能优化：
 * - 使用 dynamic import 延迟加载非关键组件
 * - 使用 useMemo 缓存计算结果
 * - 使用 useCallback 缓存事件处理函数
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import MovieCard from '@/components/MovieCard';
import BounceCards from '@/components/BounceCards';
import { Star, Flame, Film, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';

// 延迟加载 SplashCursor（非关键组件）
const SplashCursor = dynamic(() => import('@/components/ui/SplashCursor'), {
  ssr: false,
  loading: () => null
});

interface Movie {
  id: string;
  title: string;
  poster_url: string;
  rating: number;
  year: string;
  genre: string[];
  description?: string;
}

/**
 * Hero 区域组件
 * 银河动态视频背景 + 粒子特效
 */
function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 检查视频是否已缓存
    const video = document.getElementById('hero-video') as HTMLVideoElement;
    if (video) {
      video.oncanplay = () => setVideoLoaded(true);
      if (video.readyState >= 3) setVideoLoaded(true);
    }
  }, []);

  return (
    <section className="relative h-screen overflow-hidden bg-black">
      {/* 银河视频背景 */}
      <div className="absolute inset-0 bg-black overflow-hidden">
        {/* 视频层 */}
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/hero-fallback.jpg"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${videoLoaded ? 'opacity-100' : 'opacity-0'}`}
          id="hero-video"
          onCanPlay={() => setVideoLoaded(true)}
        >
          <source src="https://assets.mixkit.co/videos/preview/mixkit-swirling-energy-in-the-space-27666-large.mp4" type="video/mp4" />
          <source src="https://cdn.pixabay.com/video/2020/07/30/45349-444930032_large.mp4" type="video/mp4" />
        </video>

        {/* CSS 动态星空背景（视频加载前/失败时显示） */}
        <div className={`absolute inset-0 transition-opacity duration-1000 ${videoLoaded ? 'opacity-0' : 'opacity-100'}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-black to-black" />
          {/* 星星粒子 */}
          {Array.from({ length: 100 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-px h-px bg-white rounded-full animate-pulse"
              style={{
                left: `${(i * 7.3) % 100}%`,
                top: `${(i * 11.7) % 100}%`,
                opacity: 0.3 + (i % 5) * 0.15,
                animationDelay: `${(i * 0.3) % 3}s`,
                animationDuration: `${2 + (i % 3)}s`,
              }}
            />
          ))}
          {/* 星云效果 */}
          <div className="absolute top-0 left-0 w-full h-full">
            <div className="absolute top-[20%] left-[30%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute top-[30%] right-[20%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute bottom-[20%] left-[40%] w-[600px] h-[300px] bg-cyan-600/8 rounded-full blur-[140px] animate-pulse" style={{ animationDelay: '2s' }} />
          </div>
        </div>

        {/* 暗色遮罩 */}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* 中心内容区域 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={mounted ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1.2, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4"
      >
        {/* 品牌标志 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={mounted ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 1, delay: 0.8 }}
          className="mb-6"
        >
          <span className="text-6xl md:text-8xl font-bold text-white/90 tracking-tight">
            Stella<span className="text-red-600">Flix</span>
          </span>
        </motion.div>

        {/* 标语 */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, delay: 1.2 }}
          className="text-lg md:text-xl text-gray-300/80 max-w-2xl tracking-wide"
        >
          海量高清电影与纪录片，沉浸式观影体验
        </motion.p>
      </motion.div>

      {/* 底部渐变 */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0f] to-transparent" />

      {/* 滚动指示器 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={mounted ? { opacity: 1 } : {}}
        transition={{ duration: 1, delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20"
      >
        <span className="text-xs text-gray-500 uppercase tracking-[0.2em]">SCROLL</span>
        <div className="w-px h-10 bg-gray-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white to-transparent animate-scroll-down" />
        </div>
      </motion.div>
    </section>
  );
}

/**
 * 电影行组件
 * 展示一排电影卡片，参考网站风格：8列填满屏幕
 */
function MovieRowSection({
  title,
  icon,
  movies,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  movies: Movie[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="py-12">
        <div className="px-4 md:px-8">
          <div className="flex items-center gap-3 mb-6">
            {icon}
            <h2 className="text-2xl font-bold text-white">{title}</h2>
          </div>
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (movies.length === 0) {
    return null;
  }

  return (
    <section className="py-10 md:py-16">
      <div className="px-4 md:px-8">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex items-center gap-3 mb-6"
        >
          {icon}
          <h2 className="text-2xl font-bold text-white">{title}</h2>
        </motion.div>

        {/* 电影网格 - 8列填满屏幕，参考网站风格 */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 md:gap-3"
        >
          {movies.slice(0, 16).map((movie, index) => (
            <motion.div
              key={movie.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.03 }}
            >
              <MovieCard movie={movie} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/**
 * 精选推荐区域 - BounceCards 弹跳卡片
 * 12部精选电影，扇形展开效果
 */
function FeaturedSection({ movies, loading }: { movies: Movie[]; loading: boolean }) {
  const router = useRouter();

  if (loading || movies.length === 0) return null;

  // 取前12部电影作为精选
  const featuredMovies = movies.slice(0, 12);

  // BounceCards 的图片
  const images = featuredMovies.map(m => m.poster_url || '/placeholder-poster.jpg');

  // 12张卡片的扇形变换样式
  const transformStyles = [
    'rotate(8deg) translate(-500px)',
    'rotate(6deg) translate(-400px)',
    'rotate(5deg) translate(-320px)',
    'rotate(4deg) translate(-240px)',
    'rotate(3deg) translate(-160px)',
    'rotate(1deg) translate(-80px)',
    'rotate(-1deg) translate(80px)',
    'rotate(-3deg) translate(160px)',
    'rotate(-4deg) translate(240px)',
    'rotate(-5deg) translate(320px)',
    'rotate(-6deg) translate(400px)',
    'rotate(-8deg) translate(500px)'
  ];

  const handleCardClick = (index: number) => {
    const movie = featuredMovies[index];
    if (movie) {
      router.push(`/movies/detail?id=${movie.id}`);
    }
  };

  return (
    <section className="py-16 md:py-24 overflow-hidden">
      <div className="px-4 md:px-8">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold text-white mb-4">
            <span className="text-red-500">★</span> 精选推荐
          </h2>
          <p className="text-gray-400">悬停卡片，探索更多精彩内容</p>
        </motion.div>

        {/* BounceCards 容器 - 参考网站风格 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex justify-center"
        >
          <BounceCards
            images={images}
            containerWidth={1400}
            containerHeight={400}
            animationDelay={0.8}
            animationStagger={0.06}
            easeType="elastic.out(1, 0.5)"
            transformStyles={transformStyles}
            enableHover={true}
            onCardClick={handleCardClick}
          />
        </motion.div>

        {/* 电影信息展示 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8 text-center"
        >
          <p className="text-gray-500 text-sm">点击卡片查看详情</p>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * 首页组件
 * 性能优化：并行获取数据，减少加载时间
 */
export default function HomePage() {
  const [highScoreMovies, setHighScoreMovies] = useState<Movie[]>([]);
  const [hotMovies, setHotMovies] = useState<Movie[]>([]);
  const [documentaries, setDocumentaries] = useState<Movie[]>([]);

  const [loadingHighScore, setLoadingHighScore] = useState(true);
  const [loadingHot, setLoadingHot] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // 并行获取所有数据（每个展览区16部电影）
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // 并行请求所有数据
        const [highScoreRes, hotRes, docsRes] = await Promise.all([
          fetch('/api/movies?sort=top&limit=16'),
          fetch('/api/movies?sort=hot&limit=16'),
          fetch('/api/movies?type=documentary&limit=16')
        ]);

        const [highScoreData, hotData, docsData] = await Promise.all([
          highScoreRes.json(),
          hotRes.json(),
          docsRes.json()
        ]);

        setHighScoreMovies(highScoreData.movies || []);
        setHotMovies(hotData.movies || []);
        setDocumentaries(docsData.movies || []);
      } catch (error) {
        console.error('获取数据失败:', error);
      } finally {
        setLoadingHighScore(false);
        setLoadingHot(false);
        setLoadingDocs(false);
      }
    };

    fetchAllData();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Splash Cursor 效果 - 延迟加载 */}
      <SplashCursor
        COLOR="#32050d"
        RAINBOW_MODE={false}
        SPLAT_RADIUS={0.2}
        SPLAT_FORCE={6000}
        COLOR_UPDATE_SPEED={10}
      />

      {/* 导航栏 */}
      <Header />

      {/* Hero 区域 - 纯净背景 */}
      <HeroSection />

      {/* 精选推荐 - BounceCards */}
      <FeaturedSection movies={highScoreMovies} loading={loadingHighScore} />

      {/* 高分电影 */}
      <MovieRowSection
        title="高分电影"
        icon={<Star className="w-6 h-6 text-yellow-400" />}
        movies={highScoreMovies}
        loading={loadingHighScore}
      />

      {/* 热播电影 */}
      <MovieRowSection
        title="热播电影"
        icon={<Flame className="w-6 h-6 text-red-500" />}
        movies={hotMovies}
        loading={loadingHot}
      />

      {/* 纪录片 */}
      <MovieRowSection
        title="纪录片"
        icon={<Film className="w-6 h-6 text-blue-400" />}
        movies={documentaries}
        loading={loadingDocs}
      />

      {/* 底部间距 */}
      <div className="h-16" />
    </div>
  );
}
