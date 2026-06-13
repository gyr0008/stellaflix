"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Film, User, LogOut, Shield } from "lucide-react";
import { useState } from "react";

export default function Header() {
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 w-full z-50 bg-gradient-to-b from-black/90 to-transparent">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Film className="w-8 h-8 text-red-600" />
          <span className="text-2xl font-bold text-white tracking-tight">CineStream</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/" className="text-gray-300 hover:text-white transition text-sm">
            首页
          </Link>

          {loading ? (
            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 text-gray-300 hover:text-white transition"
              >
                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2">
                  <Link
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
                  >
                    <User className="w-4 h-4" /> 个人中心
                  </Link>
                  <Link
                    href="/admin/upload"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
                  >
                    <Shield className="w-4 h-4" /> 管理后台
                  </Link>
                  <hr className="border-gray-700 my-1" />
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-gray-800 w-full"
                  >
                    <LogOut className="w-4 h-4" /> 退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition"
            >
              登录
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
