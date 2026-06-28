import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import FavoriteButton from "@/components/FavoriteButton";
import VideoSourceSearch from "@/components/VideoSourceSearch";
import { Play, Star, Clock, Calendar, Film, Search } from "lucide-react";

// CMS视频源配置
const CMS_API = "https://bfzyapi.com/api.php/provide/vod/";

/**
 * 清理 HTML 标签和实体
 * @param html - 包含 HTML 标签的文本
 * @returns 清理后的纯文本
 */
function cleanHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "") // 移除所有 HTML 标签
    .replace(/&nbsp;/g, " ") // 移除 &nbsp;
    .replace(/&amp;/g, "&") // 移除 &amp;
    .replace(/&lt;/g, "<") // 移除 &lt;
    .replace(/&gt;/g, ">") // 移除 &gt;
    .replace(/&quot;/g, '"') // 移除 &quot;
    .replace(/&#39;/g, "'") // 移除 &#39;
    .replace(/\s+/g, " ") // 合并多个空格
    .trim();
}

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let movie: any = null;

  // 如果是CMS电影ID
  if (id.startsWith("cms_")) {
    const cmsId = id.replace("cms_", "");
    try {
      const response = await fetch(`${CMS_API}?ac=detail&ids=${cmsId}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 3600 },
      });
      const data = await response.json();

      if (data.list && data.list.length > 0) {
        const vod = data.list[0];
        movie = {
          id: id,
          title: vod.vod_name || "未知",
          poster_url: vod.vod_pic || "",
          backdrop_url: vod.vod_pic || "",
          rating: 0,
          rating_count: 0,
          year: parseInt(vod.vod_year) || 0,
          genre: vod.vod_class ? vod.vod_class.split(",") : [],
          description: vod.vod_content || vod.vod_blurb || "",
          type: "movie",
          country: vod.vod_area || "",
          director: vod.vod_director || "",
          cast_members: vod.vod_actor ? vod.vod_actor.split(",").slice(0, 5) : [],
          source: "cms",
        };
      }
    } catch (e) {
      console.error("获取CMS电影失败:", e);
    }
  } else {
    // 本地数据库查询
    const supabase = await createClient();
    const { data } = await supabase
      .from("movies")
      .select("*")
      .eq("id", id)
      .eq("is_published", true)
      .single();
    movie = data;
  }

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
          <img
            src={movie.backdrop_url}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover"
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
              <img
                src={movie.poster_url}
                alt={movie.title}
                className="rounded-xl shadow-2xl object-cover w-64 h-96"
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
              {cleanHtml(movie.description)}
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
            <div className="flex flex-wrap gap-4 items-center">
              {/* 如果有本地视频，显示"立即观看"按钮 */}
              {movie.video_url && (
                <Link
                  href={`/watch/${movie.id}`}
                  className="inline-flex items-center gap-2 bg-white text-black font-semibold px-8 py-3 rounded-lg transition text-lg hover:bg-gray-200"
                >
                  <Play className="w-5 h-5" fill="black" />
                  立即观看
                </Link>
              )}

              {/* 视频源搜索按钮 */}
              <VideoSourceSearch
                movieTitle={movie.title}
                movieYear={movie.year}
                movieId={movie.id}
              />

              <FavoriteButton movieId={movie.id} />

              {movie.trailer_url && (
                <a
                  href={movie.trailer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-lg transition text-lg"
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
