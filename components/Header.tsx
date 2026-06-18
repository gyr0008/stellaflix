"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { User, LogOut, Shield } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "首页" },
  { href: "/movies", label: "电影" },
  { href: "/documentaries", label: "纪录片" },
  { href: "/my", label: "我的" },
];

export default function Header() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-gradient-to-b from-black/90 to-transparent">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-2xl font-bold text-white tracking-tight">
          StellaFlix
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition ${
                isActive(link.href)
                  ? "text-white font-semibold"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition"
              >
                <User className="w-4 h-4 text-white" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2">
                  <Link
                    href="/my"
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
              className="bg-white text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-200 transition"
            >
              登录
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
