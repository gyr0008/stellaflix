"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { Film, Loader2, CheckCircle, AlertCircle, Plus, Trash2, Link as LinkIcon } from "lucide-react";

interface Movie {
  id: string;
  title: string;
  type: string;
}

interface VideoSource {
  id: string;
  name: string;
  url: string;
  quality: string;
}

export default function AdminUploadPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState("");
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [newSource, setNewSource] = useState({ name: "", url: "", quality: "720p" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load movies
  useEffect(() => {
    fetch("/api/movies?limit=100")
      .then((res) => res.json())
      .then((data) => setMovies(data.movies || []));
  }, []);

  // Load sources when movie selected
  useEffect(() => {
    if (!selectedMovie) {
      setSources([]);
      return;
    }
    fetch(`/api/video-sources?movie_id=${selectedMovie}`)
      .then((res) => res.json())
      .then((data) => setSources(Array.isArray(data) ? data : []));
  }, [selectedMovie]);

  const handleAddSource = async () => {
    if (!selectedMovie || !newSource.name || !newSource.url) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/video-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movie_id: selectedMovie,
          name: newSource.name,
          url: newSource.url,
          quality: newSource.quality,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSources([data, ...sources]);
        setNewSource({ name: "", url: "", quality: "720p" });
        setResult({ success: true, message: "视频源添加成功！" });
      } else {
        const err = await res.json();
        setResult({ success: false, message: err.error || "添加失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      const res = await fetch("/api/video-sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        setSources(sources.filter((s) => s.id !== id));
      }
    } catch {
      // ignore
    }
  };

  const selectedMovieInfo = movies.find((m) => m.id === selectedMovie);

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <Film className="w-8 h-8 text-red-600" />
          <h1 className="text-3xl font-bold text-white">视频源管理</h1>
        </div>

        <p className="text-gray-400 mb-6">
          为电影添加在线视频源链接。支持直接链接（.mp4/.m3u8）或视频页面链接（自动解析）。
        </p>

        {result && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              result.success
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {result.success ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {result.message}
          </div>
        )}

        {/* Select Movie */}
        <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">1. 选择电影</h2>
          <select
            value={selectedMovie}
            onChange={(e) => setSelectedMovie(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500"
          >
            <option value="">-- 选择一部电影 --</option>
            {movies.map((movie) => (
              <option key={movie.id} value={movie.id}>
                {movie.title} ({movie.type === "documentary" ? "纪录片" : "电影"})
              </option>
            ))}
          </select>
        </div>

        {/* Add Source */}
        {selectedMovie && (
          <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-8 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              2. 添加视频源 {selectedMovieInfo && `— ${selectedMovieInfo.title}`}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">来源名称</label>
                  <input
                    type="text"
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                    placeholder="如：在线播放、B站"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">画质</label>
                  <select
                    value={newSource.quality}
                    onChange={(e) => setNewSource({ ...newSource, quality: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="360p">360p</option>
                    <option value="480p">480p</option>
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="4K">4K</option>
                    <option value="unknown">未知</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddSource}
                    disabled={loading || !newSource.name || !newSource.url}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    添加
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">视频链接</label>
                <input
                  type="url"
                  value={newSource.url}
                  onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  placeholder="https://example.com/video.mp4 或视频页面链接"
                />
                <p className="text-gray-500 text-xs mt-1">
                  直接链接（.mp4/.m3u8）可直接播放，页面链接会自动尝试解析
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Existing Sources */}
        {selectedMovie && sources.length > 0 && (
          <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-8">
            <h2 className="text-xl font-semibold text-white mb-4">已添加的视频源</h2>

            <div className="space-y-3">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <LinkIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white font-medium">{source.name}</p>
                      <p className="text-gray-500 text-sm truncate">{source.url}</p>
                    </div>
                    <span className="text-gray-600 text-xs bg-gray-700 px-2 py-1 rounded flex-shrink-0">
                      {source.quality}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteSource(source.id)}
                    className="text-gray-500 hover:text-red-400 transition ml-4"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedMovie && sources.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <LinkIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>该电影还没有视频源</p>
          </div>
        )}
      </div>
    </div>
  );
}
