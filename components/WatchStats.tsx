"use client";

import { useEffect, useState } from "react";
import { Clock, Film, Tv } from "lucide-react";

interface Stats {
  total_seconds: number;
  movies_watched: number;
  documentaries_watched: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

export default function WatchStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/watch-stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-800/50 rounded-xl p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    {
      icon: Clock,
      label: "总观影时长",
      value: formatDuration(stats.total_seconds),
      color: "text-blue-400",
    },
    {
      icon: Film,
      label: "已看电影",
      value: `${stats.movies_watched} 部`,
      color: "text-red-400",
    },
    {
      icon: Tv,
      label: "已看纪录片",
      value: `${stats.documentaries_watched} 部`,
      color: "text-green-400",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="bg-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </div>
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}
