/**
 * ChannelTabs - 频道导航组件
 *
 * Netflix风格的横向频道切换
 * 支持横向滚动，移动端友好
 */

"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface Channel {
  id: string;
  label: string;
  icon?: string;
}

interface ChannelTabsProps {
  channels: Channel[];
  activeChannel: string;
  onChannelChange: (channelId: string) => void;
}

export default function ChannelTabs({
  channels,
  activeChannel,
  onChannelChange,
}: ChannelTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  // 检查是否需要显示滚动箭头
  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    setShowLeftArrow(el.scrollLeft > 0);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);
    }
    return () => {
      if (el) {
        el.removeEventListener("scroll", checkScroll);
      }
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  // 滚动到左侧
  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -200, behavior: "smooth" });
  };

  // 滚动到右侧
  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 200, behavior: "smooth" });
  };

  return (
    <div className="relative flex items-center">
      {/* 左侧滚动箭头 */}
      {showLeftArrow && (
        <button
          onClick={scrollLeft}
          className="absolute left-0 z-10 w-8 h-8 flex items-center justify-center bg-gradient-to-r from-[#181818] to-transparent"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}

      {/* 频道列表 */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-2 px-1"
      >
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onChannelChange(channel.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeChannel === channel.id
                ? "bg-red-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
            }`}
          >
            {channel.icon && <span>{channel.icon}</span>}
            {channel.label}
          </button>
        ))}
      </div>

      {/* 右侧滚动箭头 */}
      {showRightArrow && (
        <button
          onClick={scrollRight}
          className="absolute right-0 z-10 w-8 h-8 flex items-center justify-center bg-gradient-to-l from-[#181818] to-transparent"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
}
