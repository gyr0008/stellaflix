import { createClient } from "@/lib/supabase/server";
import MovieCard from "@/components/MovieCard";
import Header from "@/components/Header";

export default async function MoviesPage() {
  const supabase = await createClient();

  const { data: movies } = await supabase
    .from("movies")
    .select("id, title, poster_url, rating, year, genre, type")
    .eq("is_published", true)
    .eq("type", "movie")
    .order("rating", { ascending: false });

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white mb-8">电影</h1>

        {movies && movies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">暂无电影</p>
          </div>
        )}
      </div>
    </div>
  );
}
