"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import VideoPlayer from "@/components/VideoPlayer";
import Header from "@/components/Header";
import { Loader2, AlertCircle } from "lucide-react";

interface Movie {
  id: string;
  title: string;
  description: string;
  poster_url: string;
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?redirect=/watch/${id}`);
      return;
    }

    const loadMovie = async () => {
      try {
        const movieRes = await fetch(`/api/movies/${id}`);
        if (!movieRes.ok) throw new Error("Movie not found");
        const movieData = await movieRes.json();
        setMovie(movieData);

        const streamRes = await fetch(`/api/movies/${id}/stream`);
        if (!streamRes.ok) {
          const err = await streamRes.json();
          throw new Error(err.error || "Failed to get stream URL");
        }
        const { url } = await streamRes.json();
        setStreamUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadMovie();
  }, [id, user, authLoading, router]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Header />
      <div className="pt-16">
        <VideoPlayer
          src={streamUrl!}
          poster={movie?.poster_url}
          onReady={(player) => {
            // 恢复进度
            fetch(`/api/watch-progress?movie_id=${id}`)
              .then((res) => res.json())
              .then((data) => {
                if (data.position_seconds > 0 && !data.completed) {
                  player.currentTime(data.position_seconds);
                }
              });

            // 定期保存进度（每 10 秒）
            saveIntervalRef.current = setInterval(() => {
              if (player.paused()) return;
              fetch("/api/watch-progress", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  movie_id: id,
                  position_seconds: player.currentTime(),
                  duration_seconds: player.duration(),
                }),
              });
            }, 10000);

            // 播放结束标记完成
            player.on("ended", () => {
              if (saveIntervalRef.current) {
                clearInterval(saveIntervalRef.current);
              }
              fetch("/api/watch-progress", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  movie_id: id,
                  position_seconds: player.duration(),
                  duration_seconds: player.duration(),
                  completed: true,
                }),
              });
            });

            // 页面离开时保存
            const handleBeforeUnload = () => {
              fetch("/api/watch-progress", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  movie_id: id,
                  position_seconds: player.currentTime(),
                  duration_seconds: player.duration(),
                }),
              });
            };
            window.addEventListener("beforeunload", handleBeforeUnload);
          }}
        />
        <div className="max-w-5xl mx-auto px-4 mt-6">
          <h1 className="text-2xl font-bold text-white">{movie?.title}</h1>
          <p className="text-gray-400 mt-2">{movie?.description}</p>
        </div>
      </div>
    </div>
  );
}
