"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Upload, Film, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface UploadForm {
  title: string;
  description: string;
  year: string;
  genre: string;
  director: string;
  cast: string;
  isPremium: boolean;
}

export default function AdminUploadPage() {
  const router = useRouter();
  const [form, setForm] = useState<UploadForm>({
    title: "",
    description: "",
    year: "",
    genre: "",
    director: "",
    cast: "",
    isPremium: false,
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || !posterFile) {
      setResult({ success: false, message: "请选择视频和海报文件" });
      return;
    }

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("poster", posterFile);
    formData.append("title", form.title);
    formData.append("description", form.description);
    formData.append("year", form.year);
    formData.append("genre", form.genre);
    formData.append("director", form.director);
    formData.append("cast", form.cast);
    formData.append("isPremium", String(form.isPremium));

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: "上传成功！" });
        setForm({ title: "", description: "", year: "", genre: "", director: "", cast: "", isPremium: false });
        setVideoFile(null);
        setPosterFile(null);
      } else {
        setResult({ success: false, message: data.error || "上传失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <Film className="w-8 h-8 text-red-600" />
          <h1 className="text-3xl font-bold text-white">上传电影</h1>
        </div>

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

        <form onSubmit={handleSubmit} className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">视频文件 *</label>
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-red-500 transition">
              <Upload className="w-8 h-8 text-gray-500 mb-2" />
              <span className="text-gray-400 text-sm">
                {videoFile ? videoFile.name : "点击选择视频文件 (MP4)"}
              </span>
              <input
                type="file"
                accept="video/mp4,video/webm"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">海报图片 *</label>
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-red-500 transition">
              <Upload className="w-8 h-8 text-gray-500 mb-2" />
              <span className="text-gray-400 text-sm">
                {posterFile ? posterFile.name : "点击选择海报图片 (JPG/PNG)"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPosterFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">电影标题 *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                placeholder="电影名称"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">年份</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                placeholder="2024"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">简介</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 h-28 resize-none"
              placeholder="电影简介..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">类型（逗号分隔）</label>
              <input
                type="text"
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                placeholder="动作, 科幻, 冒险"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">导演</label>
              <input
                type="text"
                value={form.director}
                onChange={(e) => setForm({ ...form, director: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                placeholder="导演姓名"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">演员（逗号分隔）</label>
            <input
              type="text"
              value={form.cast}
              onChange={(e) => setForm({ ...form, cast: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              placeholder="演员1, 演员2, 演员3"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPremium}
              onChange={(e) => setForm({ ...form, isPremium: e.target.checked })}
              className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-red-600 focus:ring-red-500"
            />
            <span className="text-gray-300">设为会员专享内容</span>
          </label>

          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {uploading ? "上传中..." : "上传电影"}
          </button>
        </form>
      </div>
    </div>
  );
}
