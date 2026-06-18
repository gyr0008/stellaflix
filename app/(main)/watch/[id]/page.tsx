"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
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
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // Setup video player when streamUrl is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    video.src = streamUrl;

    const handleCanPlay = () => {
      // Restore progress
      fetch(`/api/watch-progress?movie_id=${id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.position_seconds > 0 && !data.completed) {
            video.currentTime = data.position_seconds;
          }
        });

      // Save progress every 10 seconds
      saveIntervalRef.current = setInterval(() => {
        if (video.paused) return;
        fetch("/api/watch-progress", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            movie_id: id,
            position_seconds: video.currentTime,
            duration_seconds: video.duration,
          }),
        });
      }, 10000);
    };

    const handleEnded = () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      fetch("/api/watch-progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movie_id: id,
          position_seconds: video.duration,
          duration_seconds: video.duration,
          completed: true,
        }),
      });
    };

    video.addEventListener("canplay", handleCanPlay, { once: true });
    video.addEventListener("ended", handleEnded);

    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("ended", handleEnded);
    };
  }, [streamUrl, id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
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
        <div className="w-full max-w-5xl mx-auto">
          <video
            ref={videoRef}
            controls
            autoPlay
            className="w-full rounded-lg bg-black"
            style={{ maxHeight: "70vh" }}
            poster={movie?.poster_url}
          >
            Your browser does not support the video tag.
          </video>
        </div>
        <div className="max-w-5xl mx-auto px-4 mt-6">
          <h1 className="text-2xl font-bold text-white">{movie?.title}</h1>
          <p className="text-gray-400 mt-2">{movie?.description}</p>
        </div>
      </div>
    </div>
  );
}
