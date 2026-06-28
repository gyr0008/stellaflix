/**
 * 观看历史页面
 *
 * 用途: 显示用户观看历史记录，按日期分组展示
 * 依赖:
 *   - Header: 顶部导航栏
 *   - lucide-react: 图标组件
 *   - next/link: 路由链接
 * 架构: 使用 localStorage 存储观看历史
 *
 * 功能:
 * - 按日期分组显示历史记录
 * - 支持删除单条记录
 * - 支持清空全部历史
 * - 显示观看时间
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, Trash2, Film, Calendar, ChevronLeft } from 'lucide-react';
import Header from '@/components/Header';

// ============================================
// 类型定义
// ============================================

/**
 * 历史记录数据结构
 */
interface HistoryRecord {
  /** 记录 ID */
  id: string;
  /** 电影 ID */
  movieId: string;
  /** 电影标题 */
  title: string;
  /** 海报 URL */
  poster_url: string;
  /** 评分 */
  rating: number;
  /** 年份 */
  year: number;
  /** 观看时间戳 */
  watchedAt: number;
}

/**
 * 按日期分组的历史记录
 */
interface GroupedHistory {
  /** 日期字符串 (YYYY-MM-DD) */
  date: string;
  /** 该日期下的记录列表 */
  records: HistoryRecord[];
}

// ============================================
// 常量配置
// ============================================

/** localStorage key */
const STORAGE_KEY = 'stellaflix_history';

// ============================================
// 工具函数
// ============================================

/**
 * 格式化日期显示
 *
 * 做什么: 将日期字符串转换为易读格式
 * 参数:
 *   - dateStr: YYYY-MM-DD 格式的日期字符串
 * 返回值: string - "今天"/"昨天"/"X月X日" 格式
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return '今天';
  if (date.getTime() === yesterday.getTime()) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 格式化时间显示
 *
 * 做什么: 将时间戳转换为 HH:MM 格式
 * 参数:
 *   - timestamp: 时间戳
 * 返回值: string - "HH:MM" 格式的时间
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// ============================================
// 组件实现
// ============================================

/**
 * 观看历史页面组件
 *
 * 做什么: 渲染观看历史列表
 * 返回值: JSX 元素
 */
export default function HistoryPage() {
  /** 历史记录列表 */
  const [history, setHistory] = useState<GroupedHistory[]>([]);

  /** 加载状态 */
  const [loading, setLoading] = useState(true);

  /**
   * 加载历史记录
   * 做什么: 从 localStorage 读取并按日期分组
   */
  const loadHistory = () => {
    const saved = localStorage.getItem(STORAGE_KEY) || '[]';
    const items: HistoryRecord[] = JSON.parse(saved);

    // 按日期分组
    const grouped: { [key: string]: HistoryRecord[] } = {};
    items.forEach((item) => {
      const date = new Date(item.watchedAt).toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(item);
    });

    // 转换为数组并按日期倒序排列
    const groupedArray: GroupedHistory[] = Object.entries(grouped)
      .map(([date, records]) => ({ date, records }))
      .sort((a, b) => b.date.localeCompare(a.date));

    setHistory(groupedArray);
    setLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  /**
   * 清空全部历史
   */
  const clearAll = () => {
    if (confirm('确定要清除所有观看历史吗？')) {
      localStorage.removeItem(STORAGE_KEY);
      setHistory([]);
    }
  };

  /**
   * 删除单条记录
   * 做什么: 从历史中移除指定记录
   * 参数:
   *   - id: 要删除的记录 ID
   */
  const deleteItem = (id: string) => {
    const saved = localStorage.getItem(STORAGE_KEY) || '[]';
    const items: HistoryRecord[] = JSON.parse(saved);
    const newItems = items.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    loadHistory();
  };

  return (
    <div className="min-h-screen bg-[#181818]">
      <Header />

      <div className="pt-24 pb-16 max-w-[1200px] mx-auto px-4 md:px-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Clock className="w-8 h-8 text-red-500" />
              观看历史
            </h1>
          </div>
          {history.length > 0 && (
            <button
              onClick={clearAll}
              className="text-gray-500 hover:text-red-500 transition-colors text-sm"
            >
              清除全部
            </button>
          )}
        </div>

        {/* 内容区域 */}
        {loading ? (
          <LoadingSpinner />
        ) : history.length > 0 ? (
          <HistoryList history={history} onDelete={deleteItem} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// ============================================
// 子组件
// ============================================

/**
 * 加载中组件
 */
function LoadingSpinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
    </div>
  );
}

/**
 * 空状态组件
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Clock className="w-16 h-16 text-gray-600 mb-4" />
      <p className="text-gray-500 text-lg mb-4">暂无观看历史</p>
      <Link
        href="/movies"
        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
      >
        去看电影
      </Link>
    </div>
  );
}

/**
 * 历史记录列表组件
 *
 * 做什么: 渲染按日期分组的历史记录
 * 参数:
 *   - history: 分组后的历史记录数组
 *   - onDelete: 删除记录的回调函数
 */
function HistoryList({ history, onDelete }: { history: GroupedHistory[]; onDelete: (id: string) => void }) {
  return (
    <div className="space-y-10">
      {history.map((group, groupIndex) => (
        <div key={group.date} className="relative">
          {/* 日期标题 */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{formatDate(group.date)}</h2>
              <span className="text-gray-500 text-sm">{group.records.length}部</span>
            </div>
          </div>

          {/* 时间线连接线 */}
          {groupIndex < history.length - 1 && (
            <div className="absolute left-5 top-12 w-0.5 h-[calc(100%+40px)] bg-[#2a2a2a]" />
          )}

          {/* 电影网格 */}
          <div className="ml-[60px] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.records.map((item) => (
              <HistoryCard key={item.id} item={item} onDelete={onDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 历史记录卡片组件
 *
 * 做什么: 渲染单个历史记录卡片
 * 参数:
 *   - item: 历史记录数据
 *   - onDelete: 删除记录的回调函数
 */
function HistoryCard({ item, onDelete }: { item: HistoryRecord; onDelete: (id: string) => void }) {
  return (
    <Link
      href={`/movies/${item.movieId}`}
      className="group relative bg-[#1a1a1a] rounded-lg overflow-hidden hover:bg-[#2a2a2a] transition-all hover:scale-105"
    >
      {/* 海报 */}
      <div className="relative aspect-[2/3] w-full">
        {item.poster_url ? (
          <img
            src={item.poster_url}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <Film className="w-12 h-12 text-gray-600" />
          </div>
        )}

        {/* 渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />

        {/* 播放时间 */}
        <div className="absolute bottom-2 left-2 text-white text-xs bg-black/60 px-2 py-1 rounded">
          {formatTime(item.watchedAt)}
        </div>

        {/* 删除按钮 */}
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete(item.id);
          }}
          className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 电影信息 */}
      <div className="p-3">
        <h3 className="text-white font-medium truncate">{item.title}</h3>
        <p className="text-gray-500 text-sm">{item.year}</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-yellow-400 text-sm">★ {item.rating?.toFixed(1) || 'N/A'}</span>
        </div>
      </div>
    </Link>
  );
}
