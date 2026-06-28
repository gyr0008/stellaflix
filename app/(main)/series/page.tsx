/**
 * 连续剧列表页 - 现代科技感设计
 *
 * 设计理念：
 * - 大气的全屏布局
 * - 现代科技感交互
 * - 简洁的频道导航
 * - 沉浸式卡片体验
 */

"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import MovieCardV2 from "@/components/ui/MovieCardV2";
import type { Movie } from "@/lib/types";
import { Search, SlidersHorizontal, X, Grid3X3, LayoutList } from "lucide-react";

/**
 * 频道选项 - 纯文字无图标
 */
const CHANNELS = [
  { id: "movie", label: "电影" },
  { id: "series", label: "连续剧" },
  { id: "documentary", label: "纪录片" },
  { id: "anime", label: "动漫" },
  { id: "variety", label: "综艺" },
];

/**
 * 筛选选项
 */
const GENRES = ["国产剧", "美剧", "韩剧", "日剧", "港台剧", "泰剧", "英剧", "喜剧", "爱情", "悬疑", "科幻", "家庭", "战争", "古装"];
const REGIONS = ["中国", "大陆", "香港", "台湾", "美国", "韩国", "日本", "泰国", "英国", "法国", "其它"];
const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i);

export default function SeriesPage() {
  const [activeChannel, setActiveChannel] = useState("series");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [filters, setFilters] = useState({
    genre: "",
    region: "",
    year: "",
    sort: "latest",
  });

  // 计算激活的筛选数量
  const activeFilterCount = [filters.genre, filters.region, filters.year].filter(Boolean).length;

  useEffect(() => {
    fetchMovies();
  }, [activeChannel, filters]);

  const fetchMovies = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: activeChannel,
        limit: "50",
      });
      if (filters.genre) params.append("genre", filters.genre);
      if (filters.region) params.append("region", filters.region);
      if (filters.year) {
        params.append("yearMin", filters.year);
        params.append("yearMax", filters.year);
      }
      if (filters.sort) params.append("sort", filters.sort);

      const response = await fetch(`/api/movies/list?${params.toString()}`);
      const data = await response.json();
      setMovies(data.movies || []);
    } catch (error) {
      console.error("获取连续剧列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({ genre: "", region: "", year: "", sort: "latest" });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header />

      <div className="pt-20">
        {/* 顶部区域：频道 + 操作栏 */}
        <div className="sticky top-16 z-40 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-[1600px] mx-auto px-6">
            {/* 频道导航 + 操作按钮 */}
            <div className="flex items-center justify-between h-16">
              {/* 频道标签 */}
              <div className="flex items-center gap-1">
                {CHANNELS.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannel(channel.id)}
                    className={`relative px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                      activeChannel === channel.id
                        ? "text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {channel.label}
                    {/* 激活指示器 */}
                    {activeChannel === channel.id && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
                    )}
                  </button>
                ))}
              </div>

              {/* 右侧操作按钮 */}
              <div className="flex items-center gap-3">
                {/* 筛选按钮 */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all duration-300 ${
                    showFilters || activeFilterCount > 0
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  筛选
                  {activeFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* 视图切换 */}
                <div className="flex items-center bg-white/5 rounded-full p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2 rounded-full transition-all ${
                      viewMode === "grid" ? "bg-white/10 text-white" : "text-gray-500"
                    }`}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2 rounded-full transition-all ${
                      viewMode === "list" ? "bg-white/10 text-white" : "text-gray-500"
                    }`}
                  >
                    <LayoutList className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 筛选面板 - 可折叠 */}
            {showFilters && (
              <div className="pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                {/* 类型筛选 */}
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 text-xs w-8">类型</span>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip
                      label="全部"
                      active={!filters.genre}
                      onClick={() => setFilters((p) => ({ ...p, genre: "" }))}
                    />
                    {GENRES.slice(0, 10).map((g) => (
                      <FilterChip
                        key={g}
                        label={g}
                        active={filters.genre === g}
                        onClick={() => setFilters((p) => ({ ...p, genre: g }))}
                      />
                    ))}
                  </div>
                </div>

                {/* 地区筛选 */}
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 text-xs w-8">地区</span>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip
                      label="全部"
                      active={!filters.region}
                      onClick={() => setFilters((p) => ({ ...p, region: "" }))}
                    />
                    {REGIONS.map((r) => (
                      <FilterChip
                        key={r}
                        label={r}
                        active={filters.region === r}
                        onClick={() => setFilters((p) => ({ ...p, region: r }))}
                      />
                    ))}
                  </div>
                </div>

                {/* 年份筛选 */}
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 text-xs w-8">年份</span>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip
                      label="全部"
                      active={!filters.year}
                      onClick={() => setFilters((p) => ({ ...p, year: "" }))}
                    />
                    {YEARS.slice(0, 15).map((y) => (
                      <FilterChip
                        key={y}
                        label={String(y)}
                        active={filters.year === String(y)}
                        onClick={() => setFilters((p) => ({ ...p, year: String(y) }))}
                      />
                    ))}
                  </div>
                </div>

                {/* 清除按钮 */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    清除全部筛选
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 排序标签 */}
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center gap-8">
            {[
              { key: "latest", label: "最新" },
              { key: "hot", label: "最热" },
              { key: "rating", label: "评分" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilters((p) => ({ ...p, sort: item.key }))}
                className={`relative text-sm font-medium transition-all duration-300 pb-1 ${
                  filters.sort === item.key ? "text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {item.label}
                {filters.sort === item.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 连续剧列表 */}
        <div className="max-w-[1600px] mx-auto px-6 pb-12">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
                <div className="absolute inset-0 border-2 border-transparent border-t-red-500 rounded-full animate-spin" />
              </div>
              <p className="text-gray-500 text-sm mt-4">加载中...</p>
            </div>
          ) : movies.length > 0 ? (
            <div className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5"
                : "grid grid-cols-1 md:grid-cols-2 gap-4"
            }>
              {movies.map((movie) => (
                <MovieCardV2 key={movie.id} movie={movie} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-10 h-10 text-gray-600" />
              </div>
              <p className="text-gray-500 text-lg">暂无匹配的内容</p>
              <button
                onClick={clearFilters}
                className="mt-4 text-red-500 hover:text-red-400 text-sm transition-colors"
              >
                清除筛选条件
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 筛选标签组件
 */
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
        active
          ? "bg-white text-black"
          : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
