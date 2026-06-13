import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import { Play, Star, Clock, Calendar, Film } from "lucide-react";

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: movie } = await supabase
    .from("movies")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .single();

  if (!movie) return notFound();

  const durationStr = movie.duration
    ? `${Math.floor(movie.duration / 60)}h ${movie.duration % 60}m`
    : "未知";

  return (
    <div className="min-h-screen bg-black">
      <Header />

      {/* Backdrop */}
      <div className="relative h-[50vh] pt-16">
        {movie.backdrop_url && (
          <Image
            src={movie.backdrop_url}
            alt={movie.title}
            fill
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="flex-shrink-0 w-64">
            {movie.poster_url && (
              <Image
                src={movie.poster_url}
                alt={movie.title}
                width={256}
                height={384}
                className="rounded-xl shadow-2xl object-cover"
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 pt-4">
            <h1 className="text-4xl font-bold text-white mb-4">{movie.title}</h1>

            <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-300">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
                <span className="text-yellow-400 font-semibold">{movie.rating?.toFixed(1)}</span>
                <span className="text-gray-500">({movie.rating_count} 评价)</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>{movie.year}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-gray-500" />
                <span>{durationStr}</span>
              </div>
              {movie.is_premium && (
                <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-semibold">
                  会员专享
                </span>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2 mb-6">
              {movie.genre?.map((g: string) => (
                <span
                  key={g}
                  className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full text-sm"
                >
                  {g}
                </span>
              ))}
            </div>

            <p className="text-gray-300 text-lg leading-relaxed mb-8 max-w-2xl">
              {movie.description}
            </p>

            {/* Meta */}
            {movie.director && (
              <p className="text-gray-400 mb-2">
                <span className="text-gray-500">导演：</span>{movie.director}
              </p>
            )}
            {movie.cast_members?.length > 0 && (
              <p className="text-gray-400 mb-8">
                <span className="text-gray-500">主演：</span>
                {movie.cast_members.join(" / ")}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <Link
                href={`/watch/${movie.id}`}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-lg transition text-lg"
              >
                <Play className="w-5 h-5" fill="white" />
                立即观看
              </Link>
              {movie.trailer_url && (
                <a
                  href={movie.trailer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-lg transition text-lg"
                >
                  <Film className="w-5 h-5" />
                  预告片
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="h-24" />
    </div>
  );
}
