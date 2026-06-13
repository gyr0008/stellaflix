"use client";

import { useState, useEffect } from "react";
import { Heart } from "lucide-react";

interface FavoriteButtonProps {
  movieId: string;
}

export default function FavoriteButton({ movieId }: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/favorites")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setIsFavorite(data.some((f: { movie_id: string }) => f.movie_id === movieId));
        }
      })
      .finally(() => setLoading(false));
  }, [movieId]);

  const toggle = async () => {
    const method = isFavorite ? "DELETE" : "POST";
    const res = await fetch("/api/favorites", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movie_id: movieId }),
    });

    if (res.ok) {
      setIsFavorite(!isFavorite);
    }
  };

  if (loading) {
    return <div className="w-10 h-10 rounded-full bg-gray-800 animate-pulse" />;
  }

  return (
    <button
      onClick={toggle}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
        isFavorite
          ? "bg-red-600 text-white"
          : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
      }`}
      aria-label={isFavorite ? "取消收藏" : "收藏"}
    >
      <Heart className="w-5 h-5" fill={isFavorite ? "currentColor" : "none"} />
    </button>
  );
}
