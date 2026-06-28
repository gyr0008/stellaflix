/**
 * 纪录片列表页 - 滚动隐藏筛选栏设计
 *
 * 功能：
 * - 筛选栏在顶部时显示，滚动时隐藏
 * - 滚回顶部时恢复显示
 * - 与顶部导航栏同步隐藏/显示
 */

"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import MovieCardV2 from "@/components/ui/MovieCardV2";
import type { Movie } from "@/lib/types";
import { Search, SlidersHorizontal, X, Grid3X3, LayoutList } from "lucide-react";
import { useScrollHide } from "@/hooks/useScrollHide";

// 频道选项
const CHANNELS = [
  { id: "documentary", label: "纪录片" },
  { id: "other", label: "其他" },
];

// 筛选选项
const GENRES = ["全部", "传记", "儿童", "冒险", "剧情", "动作", "历史", "古装", "喜剧", "奇幻", "家庭", "恐怖", "悬疑", "战争", "爱情"];
const REGIONS = ["全部", "中国", "大陆", "香港", "台湾", "美国", "韩国", "日本", "泰国", "印度", "英国", "法国", "其它"];
const LANGUAGES = ["全部", "中文", "粤语", "英语", "日语", "韩语", "法语", "俄语", "德语", "泰语"];
const YEARS = ["全部", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015", "2014", "2013", "2012", "2011", "2010"];
const LETTERS = ["全部", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0-9"];

export default function DocumentariesPage() {
  const [activeChannel, setActiveChannel] = useState("documentary");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // 使用共享的滚动隐藏 hook
  const filtersVisible = useScrollHide();

  const [filters, setFilters] = useState({
    genre: "全部",
    region: "全部",
    language: "全部",
    year: "全部",
    letter: "全部",
    sort: "latest",
  });

  const activeFilterCount = [filters.genre, filters.region, filters.language, filters.year, filters.letter].filter(v => v !== "全部").length;

  // 获取数据
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
      if (filters.genre !== "全部") params.append("genre", filters.genre);
      if (filters.region !== "全部") params.append("region", filters.region);
      if (filters.language !== "全部") params.append("language", filters.language);
      if (filters.year !== "全部") {
        params.append("yearMin", filters.year);
        params.append("yearMax", filters.year);
      }
      if (filters.letter !== "全部") params.append("firstLetter", filters.letter === "0-9" ? "#" : filters.letter);
      if (filters.sort) params.append("sort", filters.sort);

      const response = await fetch(`/api/movies/list?${params.toString()}`);
      const data = await response.json();
      setMovies(data.movies || []);
    } catch (error) {
      console.error("获取列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      genre: "全部",
      region: "全部",
      language: "全部",
      year: "全部",
      letter: "全部",
      sort: "latest",
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header visible={filtersVisible} />

      {/* 筛选栏 - 滚动时隐藏/显示 */}
      <div
        className={`fixed top-16 left-0 right-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20 transition-transform duration-300 ease-in-out ${
          filtersVisible ? "translate-y-0" : "-translate-y-[120%]"
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-6">
          {/* 频道导航 + 操作按钮 */}
          <div className="flex items-center justify-between h-14">
            {/* 频道标签 */}
            <div className="flex items-center gap-1">
              {CHANNELS.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={`relative px-5 py-2 text-sm font-medium transition-all duration-300 ${
                    activeChannel === channel.id
                      ? "text-white bg-white/10 rounded-full"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {channel.label}
                </button>
              ))}
            </div>

            {/* 右侧操作按钮 */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all ${
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

              <div className="flex items-center bg-white/5 rounded-full p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-full transition-all ${viewMode === "grid" ? "bg-white/10 text-white" : "text-gray-500"}`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-full transition-all ${viewMode === "list" ? "bg-white/10 text-white" : "text-gray-500"}`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 筛选面板 */}
          {showFilters && (
            <div className="pb-4 space-y-2">
              <FilterRow label="类型" options={GENRES} selected={filters.genre} onSelect={(v) => setFilters((p) => ({ ...p, genre: v }))} />
              <FilterRow label="地区" options={REGIONS} selected={filters.region} onSelect={(v) => setFilters((p) => ({ ...p, region: v }))} />
              <FilterRow label="年份" options={YEARS} selected={filters.year} onSelect={(v) => setFilters((p) => ({ ...p, year: v }))} />
              <FilterRow label="语言" options={LANGUAGES} selected={filters.language} onSelect={(v) => setFilters((p) => ({ ...p, language: v }))} />
              <FilterRow label="字母" options={LETTERS} selected={filters.letter} onSelect={(v) => setFilters((p) => ({ ...p, letter: v }))} />

              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                  <X className="w-3 h-3" />
                  清除全部筛选
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 排序标签 - 添加 margin-top 补偿固定定位的筛选栏 */}
      <div className="max-w-[1600px] mx-auto px-6 pt-24 pb-4">
        <div className="flex items-center gap-8">
          {[
            { key: "latest", label: "按最新" },
            { key: "hot", label: "按最热" },
            { key: "rating", label: "按评分" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilters((p) => ({ ...p, sort: item.key }))}
              className={`relative text-sm font-medium transition-all pb-1 ${
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

      {/* 内容列表 */}
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
 * 筛选行组件
 */
function FilterRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-500 text-sm w-12 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2 flex-1">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${
              selected === option
                ? "bg-red-500 text-white font-medium"
                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
