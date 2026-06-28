"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/Header";
import MovieCard from "@/components/MovieCard";
import { User, Mail, Calendar, Heart, Loader2 } from "lucide-react";
import Link from "next/link";

interface Profile {
  full_name: string;
  created_at: string;
}

interface FavoriteMovie {
  id: string;
  title: string;
  poster_url: string;
  rating: number;
  year: number;
  genre: string[];
  type: "movie" | "documentary";
}

export default function MyPage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [favorites, setFavorites] = useState<FavoriteMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, created_at")
        .eq("id", user.id)
        .single();
      setProfile(profileData);

      const { data: favData } = await supabase
        .from("favorites")
        .select("movie:movies(id, title, poster_url, rating, year, genre, type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (favData) {
        const movies = favData
          .map((f) => f.movie)
          .filter(Boolean) as unknown as FavoriteMovie[];
        setFavorites(movies);
      }

      setLoading(false);
    };

    loadData();
  }, [user, supabase]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black">
        <Header />
        <div className="pt-24 text-center">
          <p className="text-gray-400 text-lg mb-4">请先登录</p>
          <Link
            href="/login?redirect=/my"
            className="bg-white text-black px-6 py-2 rounded-lg font-medium"
          >
            登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="pt-24 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 个人信息 */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {profile?.full_name || "用户"}
            </h1>
            <div className="flex items-center gap-4 text-gray-500 text-sm mt-1">
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" /> {user.email}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("zh-CN")
                  : ""}
              </span>
            </div>
          </div>
        </div>

        {/* 收藏夹 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-semibold text-white">我的收藏</h2>
          </div>

          {favorites.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {favorites.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-900/40 rounded-xl">
              <Heart className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">还没有收藏</p>
              <Link href="/movies" className="text-red-400 hover:text-red-300 text-sm mt-2 inline-block">
                去发现影片
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
