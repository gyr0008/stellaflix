/**
 * 筛选侧边栏组件
 *
 * 功能：
 * - 类型筛选
 * - 地区筛选
 * - 年份范围筛选
 * - 语言筛选
 * - 字母索引
 * - 排序选项
 * - 重置按钮
 */

"use client";

import { RotateCcw } from "lucide-react";

interface FilterOptions {
  genres: string[];
  regions: string[];
  languages: string[];
  yearRange: { min: number; max: number };
  firstLetters: string[];
}

interface FilterSidebarProps {
  filterOptions: FilterOptions;
  filters: {
    genre: string;
    region: string;
    language: string;
    yearMin: number;
    yearMax: number;
    firstLetter: string;
    sort: string;
  };
  onFilterChange: (key: string, value: string | number) => void;
  onReset: () => void;
}

export default function FilterSidebar({
  filterOptions,
  filters,
  onFilterChange,
  onReset,
}: FilterSidebarProps) {
  // 生成年份选项
  const yearOptions = [];
  if (filterOptions.yearRange.max >= filterOptions.yearRange.min) {
    for (
      let year = filterOptions.yearRange.max;
      year >= filterOptions.yearRange.min;
      year -= 10
    ) {
      yearOptions.push(year);
    }
  }

  return (
    <div className="fixed left-0 top-20 w-64 h-[calc(100vh-80px)] bg-[#1a1a1a] border-r border-[#2a2a2a] overflow-y-auto">
      <div className="p-4">
        {/* 标题和重置按钮 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">筛选</h2>
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <RotateCcw size={14} />
            重置
          </button>
        </div>

        {/* 排序 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">排序</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "rating", label: "评分" },
              { value: "year", label: "年份" },
              { value: "title", label: "名称" },
              { value: "heat", label: "热度" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => onFilterChange("sort", option.value)}
                className={`px-3 py-2 rounded text-sm transition-colors ${
                  filters.sort === option.value
                    ? "bg-white text-black"
                    : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 字母索引 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">首字母</h3>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => onFilterChange("firstLetter", "")}
              className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                filters.firstLetter === ""
                  ? "bg-white text-black"
                  : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
              }`}
            >
              全部
            </button>
            {filterOptions.firstLetters.map((letter) => (
              <button
                key={letter}
                onClick={() => onFilterChange("firstLetter", letter)}
                className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                  filters.firstLetter === letter
                    ? "bg-white text-black"
                    : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        {/* 类型 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">类型</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onFilterChange("genre", "")}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                filters.genre === ""
                  ? "bg-white text-black"
                  : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
              }`}
            >
              全部
            </button>
            {filterOptions.genres.map((genre) => (
              <button
                key={genre}
                onClick={() => onFilterChange("genre", genre)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.genre === genre
                    ? "bg-white text-black"
                    : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* 地区 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">地区</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onFilterChange("region", "")}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                filters.region === ""
                  ? "bg-white text-black"
                  : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
              }`}
            >
              全部
            </button>
            {filterOptions.regions.map((region) => (
              <button
                key={region}
                onClick={() => onFilterChange("region", region)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.region === region
                    ? "bg-white text-black"
                    : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
                }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>

        {/* 语言 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">语言</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onFilterChange("language", "")}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                filters.language === ""
                  ? "bg-white text-black"
                  : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
              }`}
            >
              全部
            </button>
            {filterOptions.languages.map((language) => (
              <button
                key={language}
                onClick={() => onFilterChange("language", language)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.language === language
                    ? "bg-white text-black"
                    : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
                }`}
              >
                {language}
              </button>
            ))}
          </div>
        </div>

        {/* 年份 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">年份</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                onFilterChange("yearMin", 0);
                onFilterChange("yearMax", 0);
              }}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                filters.yearMin === 0 && filters.yearMax === 0
                  ? "bg-white text-black"
                  : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
              }`}
            >
              全部
            </button>
            {yearOptions.map((year) => (
              <button
                key={year}
                onClick={() => {
                  onFilterChange("yearMin", year);
                  onFilterChange("yearMax", year + 9);
                }}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.yearMin === year
                    ? "bg-white text-black"
                    : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a]"
                }`}
              >
                {year}s
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
