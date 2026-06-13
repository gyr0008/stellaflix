import { createClient } from "@/lib/supabase/server";
import MovieCard from "@/components/MovieCard";
import Header from "@/components/Header";
import HorizontalRow from "@/components/HorizontalRow";
import RandomPlayButton from "@/components/RandomPlayButton";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: trending } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .order("rating", { ascending: false })
    .limit(20);

  const { data: latest } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: movies } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .eq("type", "movie")
    .order("rating", { ascending: false })
    .limit(20);

  const { data: documentaries } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .eq("type", "documentary")
    .order("rating", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen bg-black">
      <Header />

      {/* Hero */}
      <section className="relative h-[70vh] flex items-end pb-16 pt-16">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 leading-tight">
            沉浸观影<br />
            <span className="text-gray-400">无限选择</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-xl">
            电影与纪录片，随时随地畅享。
          </p>
          <div className="flex gap-4">
            <RandomPlayButton />
            <Link
              href="/movies"
              className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3 rounded-lg transition text-lg backdrop-blur"
            >
              浏览影片
            </Link>
          </div>
        </div>
      </section>

      {/* Content Rows */}
      <div className="space-y-8 pb-16">
        {trending && trending.length > 0 && (
          <HorizontalRow title="热门推荐">
            {trending.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}

        {latest && latest.length > 0 && (
          <HorizontalRow title="最新上线">
            {latest.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}

        {movies && movies.length > 0 && (
          <HorizontalRow title="电影">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}

        {documentaries && documentaries.length > 0 && (
          <HorizontalRow title="纪录片">
            {documentaries.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </HorizontalRow>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 text-sm">
          <p>&copy; {new Date().getFullYear()} CineStream</p>
        </div>
      </footer>
    </div>
  );
}
