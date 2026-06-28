/**
 * CollapsibleFilters - 可折叠筛选组件
 *
 * Netflix风格的紧凑筛选设计
 * - 核心筛选始终显示（类型、地区、年份）
 * - 更多筛选可展开
 * - 一键清除所有筛选
 */

"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

export interface FilterOption {
  label: string;
  value: string;
}

interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
}

interface CollapsibleFiltersProps {
  filterGroups: FilterGroup[];
  selectedFilters: Record<string, string>;
  onFilterChange: (groupId: string, value: string) => void;
  onClearAll: () => void;
  /** 始终显示的筛选组ID（不超过3个） */
  alwaysVisible?: string[];
}

export default function CollapsibleFilters({
  filterGroups,
  selectedFilters,
  onFilterChange,
  onClearAll,
  alwaysVisible = [],
}: CollapsibleFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 计算已选中的筛选数量
  const activeFilterCount = Object.values(selectedFilters).filter(Boolean).length;

  // 分离始终显示的和可折叠的筛选组
  const alwaysShowGroups = filterGroups.filter((g) =>
    alwaysVisible.includes(g.id)
  );
  const collapsibleGroups = filterGroups.filter(
    (g) => !alwaysVisible.includes(g.id)
  );

  return (
    <div className="space-y-3">
      {/* 始终显示的筛选组 */}
      <div className="space-y-2">
        {alwaysShowGroups.map((group) => (
          <FilterRow
            key={group.id}
            group={group}
            selected={selectedFilters[group.id] || ""}
            onSelect={(value) => onFilterChange(group.id, value)}
          />
        ))}
      </div>

      {/* 展开/收起按钮 */}
      {collapsibleGroups.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                收起筛选
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                更多筛选
              </>
            )}
          </button>

          {/* 清除所有筛选 */}
          {activeFilterCount > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1 text-sm text-red-500 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
              清除全部 ({activeFilterCount})
            </button>
          )}
        </div>
      )}

      {/* 可折叠的筛选组 */}
      {isExpanded && (
        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
          {collapsibleGroups.map((group) => (
            <FilterRow
              key={group.id}
              group={group}
              selected={selectedFilters[group.id] || ""}
              onSelect={(value) => onFilterChange(group.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 筛选行组件
 */
function FilterRow({
  group,
  selected,
  onSelect,
}: {
  group: FilterGroup;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayOptions = showAll ? group.options : group.options.slice(0, 12);
  const hasMore = group.options.length > 12;

  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-500 text-sm w-12 pt-2 flex-shrink-0">
        {group.label}
      </span>
      <div className="flex flex-wrap gap-2 flex-1">
        {/* 全部按钮 */}
        <button
          onClick={() => onSelect("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            selected === ""
              ? "bg-red-600 text-white"
              : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a] hover:text-white"
          }`}
        >
          全部
        </button>

        {/* 选项按钮 */}
        {displayOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              selected === option.value
                ? "bg-red-600 text-white"
                : "bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a] hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}

        {/* 展开/收起按钮 */}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-3 py-1.5 rounded-full text-xs text-gray-500 hover:text-white transition-colors"
          >
            {showAll ? "收起" : `更多 ${group.options.length - 12}+`}
          </button>
        )}
      </div>
    </div>
  );
}
