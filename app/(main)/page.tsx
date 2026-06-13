import { createClient } from "@/lib/supabase/server";
import MovieCard from "@/components/MovieCard";
import Header from "@/components/Header";
import { Flame, TrendingUp, Sparkles } from "lucide-react";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: trending } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre")
    .eq("is_published", true)
    .order("rating", { ascending: false })
    .limit(10);

  const { data: latest } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: premium } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre")
    .eq("is_published", true)
    .eq("is_premium", true)
    .order("rating", { ascending: false })
    .limit(10);

  return (
    <div className="min-h-screen bg-black">
      <Header />

      {/* Hero */}
      <section className="relative h-[70vh] flex items-center pt-16">
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 leading-tight">
            无限电影<br />
            <span className="text-red-600">随时观看</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-xl">
            海量高清电影，随时随地畅享。从经典佳作到最新大片，尽在 CineStream。
          </p>
          <div className="flex gap-4">
            <a
              href="/pricing"
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-lg transition text-lg"
            >
              开始观看
            </a>
            <a
              href="#trending"
              className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-lg transition text-lg"
            >
              浏览影片
            </a>
          </div>
        </div>
      </section>

      {/* Trending */}
      <section id="trending" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-3 mb-6">
          <Flame className="w-6 h-6 text-red-500" />
          <h2 className="text-2xl font-bold text-white">热门推荐</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {trending?.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </section>

      {/* Latest */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-6 h-6 text-yellow-400" />
          <h2 className="text-2xl font-bold text-white">最新上线</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {latest?.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </section>

      {/* Premium */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">会员专属</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {premium?.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} CineStream. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
