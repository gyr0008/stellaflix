/**
 * Netflix 页面 - 奈飞工厂风格
 *
 * 路径：/netflixgc
 *
 * 功能：
 * 1. 还原奈飞工厂原站风格的筛选界面
 * 2. 频道、类型、地区、年份、语言、字母筛选
 * 3. 按最新/最热/评分排序
 * 4. 无限滚动加载更多
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useScrollHide } from "@/hooks/useScrollHide";
import { Play, Loader2, Film } from "lucide-react";
import { cleanDescription } from "@/lib/html-utils";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { FollowingGlow } from "@/components/ui/glow-effects";

/** 视频项类型 */
interface VideoItem {
  id: number;
  title: string;
  poster: string;
  description: string;
  status: string;
  actors: string;
  doubanScore: string;
  detailUrl: string;
}

/** 筛选配置 - 还原奈飞工厂原站 */
const CHANNELS = ["电影", "连续剧", "漫剧", "综艺", "纪录片", "直播"];

/** 频道 -> API type 映射 */
const CHANNEL_TYPE_MAP: Record<string, string> = {
  "电影": "movie",
  "连续剧": "tv",
  "漫剧": "comic",
  "综艺": "variety",
  "纪录片": "documentary",
  "直播": "live",
};

const GENRES = [
  "全部", "喜剧", "爱情", "恐怖", "动作", "科幻", "剧情", "犯罪", "奇幻",
  "悬疑", "惊悚", "家庭", "冒险", "同性", "运动", "战争", "灾难",
  "NETFLIX", "HBO", "BBC ONE", "HULU", "APPLE TV", "FOX"
];

const REGIONS = [
  "全部", "中国", "大陆", "香港", "台湾", "美国", "韩国", "日本", "泰国",
  "新加坡", "马来西亚", "印度", "英国", "法国", "瑞典", "瑞士", "乌克兰",
  "加拿大", "西班牙", "俄罗斯", "其它"
];

const YEARS = [
  "全部", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019",
  "2018", "2017", "2016", "2015", "2014", "2013", "2012", "2011", "2010",
  "2009", "2008", "2007", "2006", "2005", "2004", "2003", "2002", "2001",
  "2000", "1999", "1998", "1997", "1996", "1995"
];

const LANGUAGES = [
  "全部", "中文", "粤语", "闽南语", "英语", "日语", "韩语", "法语",
  "俄语", "德语", "泰语", "瑞典语", "印度语"
];

const LETTERS = [
  "全部", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
  "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0-9"
];

export default function NetflixPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // 启用滚动位置保持
  useScrollRestoration('netflixgc');

  // 筛选状态
  const [channel, setChannel] = useState("电影");
  const [genre, setGenre] = useState("全部");
  const [region, setRegion] = useState("全部");
  const [year, setYear] = useState("全部");
  const [language, setLanguage] = useState("全部");
  const [letter, setLetter] = useState("全部");
  const [sort, setSort] = useState("latest");

  const filtersVisible = useScrollHide();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  /** 加载视频列表 */
  const fetchVideos = useCallback(async (pageNum: number, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      // 构建筛选参数 - 使用原站 API 的参数名
      const params = new URLSearchParams({
        type: CHANNEL_TYPE_MAP[channel] || "1",
        page: String(pageNum),
        by: sort === "latest" ? "time" : sort === "hot" ? "hits" : "score",
      });

      // 类型筛选 (class 参数)
      if (genre !== "全部") params.append("class", genre);
      // 地区筛选 (area 参数)
      if (region !== "全部") params.append("area", region);
      // 年份筛选
      if (year !== "全部") params.append("year", year);
      // 语言筛选 (lang 参数)
      if (language !== "全部") params.append("lang", language);
      // 字母筛选
      if (letter !== "全部") params.append("letter", letter);

      const res = await fetch(`/api/netflixgc/search?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        const newVideos = data.results || [];
        if (append) {
          // 去重：合并时移除重复的 id
          setVideos((prev) => {
            const existingIds = new Set(prev.map((v: any) => v.id));
            const uniqueNew = newVideos.filter((v: any) => !existingIds.has(v.id));
            return [...prev, ...uniqueNew];
          });
        } else {
          setVideos(newVideos);
        }
        setHasMore(newVideos.length >= 20);
      }
    } catch (err) {
      console.error("加载失败:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [channel, genre, region, year, language, letter, sort]);

  /** 筛选变化时重置 */
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchVideos(1, false);
  }, [fetchVideos]);

  /** 无限滚动 */
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
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
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [page, hasMore, loading, loadingMore, fetchVideos]);

  /** 批量获取豆瓣评分 */
  const fetchRatings = useCallback(async (videoList: VideoItem[]) => {
    // 筛选没有评分的电影（doubanScore为"0"或"0.0"）
    const moviesNeedingRating = videoList
      .filter(v => !v.doubanScore || v.doubanScore === '0' || v.doubanScore === '0.0')
      .slice(0, 20); // 限制批量大小

    if (moviesNeedingRating.length === 0) return;

    try {
      const res = await fetch('/api/netflixgc/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movies: moviesNeedingRating.map(v => ({
            id: v.id,
            title: v.title,
          })),
        }),
      });

      const data = await res.json();

      if (data.success && data.ratings) {
        // 更新电影列表中的评分
        setVideos(prev => prev.map(v => {
          const ratingData = data.ratings.find((r: any) => r.id === v.id);
          if (ratingData && ratingData.rating > 0) {
            return { ...v, doubanScore: String(ratingData.rating) };
          }
          return v;
        }));
      }
    } catch (error) {
      console.error('获取评分失败:', error);
    }
  }, []);

  // 当视频列表变化时获取评分
  useEffect(() => {
    if (videos.length > 0) {
      fetchRatings(videos);
    }
  }, [videos, fetchRatings]);

  /** 清除所有筛选 */
  const clearFilters = () => {
    setChannel("电影");
    setGenre("全部");
    setRegion("全部");
    setYear("全部");
    setLanguage("全部");
    setLetter("全部");
    setSort("latest");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header visible={filtersVisible} />

      {/* 奈飞工厂风格筛选区 - 玻璃虚化效果 */}
      <div
        className={`fixed top-16 left-0 right-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20 transition-transform duration-300 ease-in-out ${
          filtersVisible ? "translate-y-0" : "-translate-y-[120%]"
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          {/* 频道 */}
          <FilterRow
            label="频道"
            options={CHANNELS}
            selected={channel}
            onSelect={setChannel}
            isTag
          />

          {/* 类型 */}
          <FilterRow
            label="类型"
            options={GENRES}
            selected={genre}
            onSelect={setGenre}
          />

          {/* 地区 */}
          <FilterRow
            label="地区"
            options={REGIONS}
            selected={region}
            onSelect={setRegion}
          />

          {/* 年份 */}
          <FilterRow
            label="年份"
            options={YEARS}
            selected={year}
            onSelect={setYear}
          />

          {/* 语言 */}
          <FilterRow
            label="语言"
            options={LANGUAGES}
            selected={language}
            onSelect={setLanguage}
          />

          {/* 字母 */}
          <FilterRow
            label="字母"
            options={LETTERS}
            selected={letter}
            onSelect={setLetter}
          />
        </div>
      </div>

      {/* 排序栏 + 列表 - 增加 top padding 避免被菜单挡住 */}
      <div className="max-w-[1600px] mx-auto px-6 pt-[340px] pb-12">
        {/* 排序选项 - 分散布局 */}
        <div className="grid grid-cols-3 gap-4 mb-8 border-b border-white/10 pb-4">
          {[
            { key: "latest", label: "按最新" },
            { key: "hot", label: "按最热" },
            { key: "rating", label: "按评分" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setSort(item.key)}
              className={`relative text-center font-medium transition-all pb-2 ${
                sort === item.key ? "text-red-500" : "text-gray-400 hover:text-white"
              }`}
            >
              {item.label}
              {sort === item.key && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-red-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* 视频网格 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
              <div className="absolute inset-0 border-2 border-transparent border-t-red-500 rounded-full animate-spin" />
            </div>
            <p className="text-gray-500 text-sm mt-4">加载中...</p>
          </div>
        ) : videos.length > 0 ? (
          <>
            {/* 电影卡片网格 - 与首页一致的尺寸 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
              {videos.map((video, index) => (
                <FollowingGlow
                  key={`${video.id}-${index}`}
                  className="rounded-xl"
                  glowColor="#e50914"
                  glowSize={200}
                >
                  <Link
                    href={`/netflixgc/play?id=${video.id}&title=${encodeURIComponent(video.title)}`}
                    className="group block"
                    scroll={false}
                  >
                    {/* 海报 */}
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-gray-800">
                      {video.poster ? (
                        <img
                          src={video.poster}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                          <Film className="w-12 h-12 text-gray-500" />
                        </div>
                      )}

                      {/* 类型标签 - 右上角 */}
                      {video.status && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500/90 text-white text-[10px] rounded z-10">
                          {video.status}
                        </div>
                      )}

                      {/* 播放按钮覆盖 - 奈飞风格 */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-all duration-300 shadow-lg">
                          <Play className="w-6 h-6 text-black ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                    </div>

                    {/* 只保留标题，删除简介 */}
                    <div className="mt-2">
                      <h3 className="text-sm text-white truncate group-hover:text-red-400 transition-colors">
                        {video.title}
                      </h3>
                    </div>
                  </Link>
                </FollowingGlow>
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
        ) : (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Film className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-500 text-lg">暂无匹配的内容</p>
            <button onClick={clearFilters} className="mt-4 text-red-500 hover:text-red-400 text-sm">
              清除筛选条件
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 筛选行组件 - 奈飞工厂风格
 *
 * 做什么: 渲染一行筛选选项，支持标签样式和普通样式
 * 参数:
 *   - label: 行标签（如"频道"、"类型"）
 *   - options: 选项数组
 *   - selected: 当前选中值
 *   - onSelect: 选中回调
 *   - isTag: 是否使用标签样式（频道行使用）
 */
function FilterRow({
  label,
  options,
  selected,
  onSelect,
  isTag = false,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  isTag?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 mb-3 last:mb-0">
      <span className="text-gray-400 text-sm w-10 flex-shrink-0 pt-1.5">{label}</span>
      <div className="flex flex-wrap gap-2 flex-1">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`px-3 py-1.5 text-sm rounded transition-all ${
              isTag
                ? // 频道标签样式
                  selected === option
                    ? "bg-red-500 text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                : // 普通筛选样式
                  selected === option
                    ? "bg-red-500/20 text-red-400 border border-red-500/50"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
