"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shuffle, Loader2 } from "lucide-react";

export default function RandomPlayButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRandom = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/movies/random");
      const data = await res.json();
      if (data.id) {
        router.push(`/watch/${data.id}`);
      }
    } catch {
      console.error("Random play failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRandom}
      disabled={loading}
      className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-lg transition text-lg disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Shuffle className="w-5 h-5" />
      )}
      随机播放
    </button>
  );
}
