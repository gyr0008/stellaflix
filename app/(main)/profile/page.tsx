/**
 * 个人中心页面
 *
 * 功能：
 * - 用户信息展示（头像、昵称）
 * - 观看时长统计
 * - 观看历史统计
 * - 收藏统计
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  User,
  Clock,
  Heart,
  Film,
  Calendar,
  BarChart3,
  Settings,
  ChevronRight,
  Camera,
} from "lucide-react";
import Header from "@/components/Header";

interface UserProfile {
  nickname: string;
  avatar: string;
  joinDate: string;
}

interface WatchStats {
  totalMovies: number;
  totalDocumentaries: number;
  totalWatchTime: number; // 分钟
  recentWatched: { title: string; poster_url: string; time: number }[];
}

export default function ProfilePage() {
  // 用户信息
  const [profile, setProfile] = useState<UserProfile>({
    nickname: "影迷用户",
    avatar: "",
    joinDate: new Date().toISOString(),
  });

  // 统计数据
  const [stats, setStats] = useState<WatchStats>({
    totalMovies: 0,
    totalDocumentaries: 0,
    totalWatchTime: 0,
    recentWatched: [],
  });

  // 收藏数量
  const [favoritesCount, setFavoritesCount] = useState(0);

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  // 加载本地数据
  const loadData = () => {
    // 加载用户信息
    const savedProfile = localStorage.getItem("stellaflix_profile");
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile));
    }

    // 加载观看历史
    const history = JSON.parse(localStorage.getItem("stellaflix_history") || "[]");

    // 加载实际观看时长记录
    const watchTimeLog = JSON.parse(localStorage.getItem("stellaflix_watch_time") || "[]");

    // 计算统计数据
    const movies = history.filter((h: any) => !h.type || h.type === "movie");
    const docs = history.filter((h: any) => h.type === "documentary");

    // 计算实际观看时长（秒转分钟，四舍五入）
    const totalWatchTimeSeconds = watchTimeLog.reduce(
      (sum: number, log: any) => sum + (log.duration || 0), 0
    );
    const totalWatchTime = Math.round(totalWatchTimeSeconds / 60);

    // 最近观看
    const recentWatched = history.slice(0, 4).map((h: any) => ({
      title: h.title,
      poster_url: h.poster_url,
      time: h.watchedAt,
    }));

    setStats({
      totalMovies: movies.length,
      totalDocumentaries: docs.length,
      totalWatchTime,
      recentWatched,
    });

    // 加载收藏数量
    const favorites = JSON.parse(localStorage.getItem("stellaflix_favorites") || "[]");
    setFavoritesCount(favorites.length);
  };

  // 保存用户信息
  const saveProfile = (updates: Partial<UserProfile>) => {
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);
    localStorage.setItem("stellaflix_profile", JSON.stringify(newProfile));
  };

  // 格式化观看时长
  const formatWatchTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-[#181818]">
      <Header />

      <div className="pt-24 pb-16 max-w-[1000px] mx-auto px-4">
        {/* 用户信息卡片 */}
        <div className="bg-[#1a1a1a] rounded-xl p-6 mb-6">
          <div className="flex items-center gap-6">
            {/* 头像 */}
            <div className="relative group">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center overflow-hidden">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.nickname}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-white" />
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-4 h-4 text-gray-800" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        saveProfile({ avatar: event.target?.result as string });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>

            {/* 用户信息 */}
            <div className="flex-1">
              <input
                type="text"
                value={profile.nickname}
                onChange={(e) => saveProfile({ nickname: e.target.value })}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    saveProfile({ nickname: "影迷用户" });
                  }
                }}
                className="text-2xl font-bold text-white bg-transparent border-none outline-none focus:ring-0 p-0"
                placeholder="输入昵称"
              />
              <p className="text-gray-500 text-sm mt-1">
                加入时间：{new Date(profile.joinDate).toLocaleDateString("zh-CN")}
              </p>
            </div>
          </div>
        </div>

        {/* 观看统计 */}
        <div className="bg-[#1a1a1a] rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-500" />
            观看统计
          </h2>

          <div className="grid grid-cols-3 gap-4">
            {/* 总观看时长 */}
            <div className="bg-[#2a2a2a] rounded-lg p-4 text-center">
              <Clock className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">
                {formatWatchTime(stats.totalWatchTime)}
              </p>
              <p className="text-gray-500 text-sm">总观看时长</p>
            </div>

            {/* 电影数量 */}
            <div className="bg-[#2a2a2a] rounded-lg p-4 text-center">
              <Film className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats.totalMovies}</p>
              <p className="text-gray-500 text-sm">观看电影</p>
            </div>

            {/* 纪录片数量 */}
            <div className="bg-[#2a2a2a] rounded-lg p-4 text-center">
              <Film className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats.totalDocumentaries}</p>
              <p className="text-gray-500 text-sm">观看纪录片</p>
            </div>
          </div>
        </div>

        {/* 最近观看 */}
        {stats.recentWatched.length > 0 && (
          <div className="bg-[#1a1a1a] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-red-500" />
              最近观看
            </h2>

            <div className="grid grid-cols-4 gap-3">
              {stats.recentWatched.map((item, index) => (
                <Link
                  key={index}
                  href={`/search?q=${encodeURIComponent(item.title)}`}
                  className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 hover:scale-105 transition-transform"
                >
                  {item.poster_url ? (
                    <img
                      src={item.poster_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-8 h-8 text-gray-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs truncate">{item.title}</p>
                    <p className="text-gray-400 text-xs">{formatTime(item.time)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 快捷入口 */}
        <div className="bg-[#1a1a1a] rounded-xl overflow-hidden">
          {/* 收藏 */}
          <Link
            href="/favorites"
            className="flex items-center justify-between px-6 py-4 hover:bg-[#2a2a2a] transition-colors border-b border-[#2a2a2a]"
          >
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-red-500" />
              <span className="text-white">我的收藏</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{favoritesCount} 部</span>
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </div>
          </Link>

          {/* 观看历史 */}
          <Link
            href="/history"
            className="flex items-center justify-between px-6 py-4 hover:bg-[#2a2a2a] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-500" />
              <span className="text-white">观看历史</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{stats.totalMovies + stats.totalDocumentaries} 部</span>
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
