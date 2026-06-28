/**
 * 综艺列表页 - 现代科技感设计 v4
 *
 * 设计理念：
 * - 大气的全屏布局
 * - 现代科技感交互
 * - 简洁的频道导航（固定在顶部）
 * - 沉浸式卡片体验
 * - 参考奈飞工厂的筛选设计
 */

"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import MovieCardV2 from "@/components/ui/MovieCardV2";
import type { Movie } from "@/lib/types";
import { Search, SlidersHorizontal, X, Grid3X3, LayoutList } from "lucide-react";

/**
 * 频道选项 - 纯文字无图标（删除连续剧）
 */
const CHANNELS = [
  { id: "movie", label: "电影" },
  { id: "documentary", label: "纪录片" },
  { id: "anime", label: "动漫" },
  { id: "variety", label: "综艺" },
];

/**
 * 筛选选项 - 参考奈飞工厂设计
 */
const GENRES = ["全部", "国产综艺", "日韩综艺", "欧美综艺", "港台综艺", "脱口秀", "真人秀", "音乐", "舞蹈", "喜剧", "访谈", "选秀", "美食", "旅行"];
const REGIONS = ["全部", "中国", "大陆", "香港", "台湾", "美国", "韩国", "日本", "英国", "其它"];
const YEARS = ["全部", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015", "2014", "2013", "2012", "2011", "2010", "2009", "2008", "2007", "2006", "2005", "2000", "1995", "1990"];
const LETTERS = ["全部", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0-9"];

export default function VarietyPage() {
  const [activeChannel, setActiveChannel] = useState("variety");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [filters, setFilters] = useState({
    genre: "全部",
    region: "全部",
    year: "全部",
    letter: "全部",
    sort: "latest",
  });

  // 计算激活的筛选数量
  const activeFilterCount = [filters.genre, filters.region, filters.year, filters.letter].filter(v => v !== "全部").length;

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
      console.error("获取综艺列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      genre: "全部",
      region: "全部",
      year: "全部",
      letter: "全部",
      sort: "latest",
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header />

      <div className="pt-20">
        {/* 顶部区域：频道 + 操作栏 - 固定在顶部 */}
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

            {/* 筛选面板 - 参考奈飞工厂设计 */}
            {showFilters && (
              <div className="pb-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                {/* 类型 */}
                <FilterRow
                  label="类型"
                  options={GENRES}
                  selected={filters.genre}
                  onSelect={(value) => setFilters((p) => ({ ...p, genre: value }))}
                />

                {/* 地区 */}
                <FilterRow
                  label="地区"
                  options={REGIONS}
                  selected={filters.region}
                  onSelect={(value) => setFilters((p) => ({ ...p, region: value }))}
                />

                {/* 年份 */}
                <FilterRow
                  label="年份"
                  options={YEARS}
                  selected={filters.year}
                  onSelect={(value) => setFilters((p) => ({ ...p, year: value }))}
                />

                {/* 字母 */}
                <FilterRow
                  label="字母"
                  options={LETTERS}
                  selected={filters.letter}
                  onSelect={(value) => setFilters((p) => ({ ...p, letter: value }))}
                />

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
              { key: "latest", label: "按最新" },
              { key: "hot", label: "按最热" },
              { key: "rating", label: "按评分" },
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

        {/* 综艺列表 */}
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
 * 筛选行组件 - 奈飞工厂风格
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
  const [showAll, setShowAll] = useState(false);
  const displayOptions = showAll ? options : options.slice(0, 15);

  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-500 text-sm w-12 pt-2 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2 flex-1">
        {displayOptions.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${
              selected === option
                ? "bg-red-600 text-white font-medium"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            {option}
          </button>
        ))}

        {/* 展开/收起按钮 */}
        {options.length > 15 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-1.5 rounded-full text-sm text-gray-500 hover:text-white transition-colors"
          >
            {showAll ? "收起" : `更多 ${options.length - 15}+`}
          </button>
        )}
      </div>
    </div>
  );
}
