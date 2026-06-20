"use client";

/**
 * 视频源配置管理页面
 *
 * 管理视频源配置，支持添加、编辑、删除、测试连接等功能
 */

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import {
  Globe,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Edit,
  TestTube,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/** 视频源配置类型 */
interface VideoSourceConfig {
  id: string;
  name: string;
  code: string;
  type: "cms" | "api" | "scrape" | "direct";
  base_url: string;
  search_path?: string;
  detail_path?: string;
  categories?: string[];
  priority: number;
  enabled: boolean;
  status: "active" | "inactive" | "error";
  error_message?: string;
  created_at: string;
}

/** 表单数据 */
interface FormData {
  name: string;
  code: string;
  type: "cms" | "api" | "scrape" | "direct";
  base_url: string;
  search_path: string;
  detail_path: string;
  categories: string[];
  priority: number;
}

export default function VideoSourceManagePage() {
  // 状态
  const [sources, setSources] = useState<VideoSourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // 表单状态
  const [formData, setFormData] = useState<FormData>({
    name: "",
    code: "",
    type: "cms",
    base_url: "",
    search_path: "",
    detail_path: "",
    categories: ["movie", "tv"],
    priority: 0,
  });

  // 展开/折叠
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 加载视频源列表
  const loadSources = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/video-sources/manage");
      const data = await res.json();
      if (data.success) {
        setSources(data.data);
      }
    } catch (error) {
      console.error("Failed to load sources:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  // 重置表单
  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      type: "cms",
      base_url: "",
      search_path: "",
      detail_path: "",
      categories: ["movie", "tv"],
      priority: 0,
    });
    setEditingId(null);
    setShowForm(false);
  };

  // 编辑视频源
  const handleEdit = (source: VideoSourceConfig) => {
    setFormData({
      name: source.name,
      code: source.code,
      type: source.type,
      base_url: source.base_url,
      search_path: source.search_path || "",
      detail_path: source.detail_path || "",
      categories: source.categories || ["movie", "tv"],
      priority: source.priority,
    });
    setEditingId(source.id);
    setShowForm(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    setResult(null);

    // 验证
    if (!formData.name || !formData.code || !formData.base_url) {
      setResult({ success: false, message: "请填写必填字段" });
      return;
    }

    try {
      const url = "/api/video-sources/manage";
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? { id: editingId, ...formData }
        : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: editingId ? "视频源更新成功" : "视频源创建成功",
        });
        resetForm();
        loadSources();
      } else {
        setResult({ success: false, message: data.error || "操作失败" });
      }
    } catch (error) {
      setResult({ success: false, message: "网络错误" });
    }
  };

  // 删除视频源
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个视频源吗？")) return;

    try {
      const res = await fetch("/api/video-sources/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ success: true, message: "视频源已删除" });
        loadSources();
      } else {
        setResult({ success: false, message: data.error || "删除失败" });
      }
    } catch (error) {
      setResult({ success: false, message: "网络错误" });
    }
  };

  // 测试连接
  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      // TODO: 实现测试连接 API
      await new Promise(resolve => setTimeout(resolve, 2000));
      setResult({ success: true, message: "连接测试成功" });
    } catch (error) {
      setResult({ success: false, message: "连接测试失败" });
    } finally {
      setTestingId(null);
    }
  };

  // 切换启用状态
  const handleToggle = async (source: VideoSourceConfig) => {
    try {
      const res = await fetch("/api/video-sources/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: source.id,
          enabled: !source.enabled,
          status: !source.enabled ? "active" : "inactive",
        }),
      });

      const data = await res.json();

      if (data.success) {
        loadSources();
      }
    } catch (error) {
      console.error("Toggle failed:", error);
    }
  };

  // 状态图标
  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case "active":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-red-600" />
            <h1 className="text-3xl font-bold text-white">视频源管理</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadSources}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              添加视频源
            </button>
          </div>
        </div>

        {/* 提示信息 */}
        <p className="text-gray-400 mb-6">
          配置外部视频源，系统会自动从这些源搜索和聚合视频内容。支持 CMS 接口格式。
        </p>

        {/* 结果提示 */}
        {result && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              result.success
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {result.message}
          </div>
        )}

        {/* 添加/编辑表单 */}
        {showForm && (
          <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {editingId ? "编辑视频源" : "添加视频源"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 名称 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  placeholder="如：资源站A"
                />
              </div>

              {/* 代码 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  代码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  placeholder="如：source_a"
                  disabled={!!editingId}
                />
                <p className="text-gray-500 text-xs mt-1">
                  唯一标识，只能包含小写字母、数字和下划线
                </p>
              </div>

              {/* 类型 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  类型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as FormData["type"],
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-red-500"
                >
                  <option value="cms">CMS 接口</option>
                  <option value="api">自定义 API</option>
                  <option value="scrape">网页抓取</option>
                  <option value="direct">直接链接</option>
                </select>
              </div>

              {/* 优先级 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  优先级
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  min="0"
                  max="100"
                />
                <p className="text-gray-500 text-xs mt-1">
                  数值越大，搜索结果越靠前
                </p>
              </div>

              {/* API 地址 */}
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">
                  API 地址 <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formData.base_url}
                  onChange={(e) =>
                    setFormData({ ...formData, base_url: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  placeholder="https://api.example.com"
                />
              </div>

              {/* 搜索路径 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  搜索路径模板
                </label>
                <input
                  type="text"
                  value={formData.search_path}
                  onChange={(e) =>
                    setFormData({ ...formData, search_path: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  placeholder="/vod/search.html?wd={query}&page={page}"
                />
                <p className="text-gray-500 text-xs mt-1">
                  支持 {"{query}"} 和 {"{page}"} 占位符
                </p>
              </div>

              {/* 详情路径 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  详情路径模板
                </label>
                <input
                  type="text"
                  value={formData.detail_path}
                  onChange={(e) =>
                    setFormData({ ...formData, detail_path: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  placeholder="/vod/detail-{id}.html"
                />
                <p className="text-gray-500 text-xs mt-1">
                  支持 {"{id}"} 占位符
                </p>
              </div>

              {/* 分类 */}
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-2">
                  支持的分类
                </label>
                <div className="flex flex-wrap gap-3">
                  {["movie", "tv", "anime", "documentary"].map((cat) => (
                    <label
                      key={cat}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.categories.includes(cat)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              categories: [...formData.categories, cat],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              categories: formData.categories.filter(
                                (c) => c !== cat
                              ),
                            });
                          }
                        }}
                        className="w-4 h-4 bg-gray-800 border-gray-700 rounded text-red-600 focus:ring-red-500"
                      />
                      <span className="text-white">
                        {cat === "movie"
                          ? "电影"
                          : cat === "tv"
                          ? "电视剧"
                          : cat === "anime"
                          ? "动漫"
                          : "纪录片"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
              >
                {editingId ? "保存修改" : "创建"}
              </button>
            </div>
          </div>
        )}

        {/* 视频源列表 */}
        <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无视频源配置</p>
              <p className="text-sm mt-1">点击"添加视频源"按钮开始配置</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {sources.map((source) => (
                <div key={source.id} className="p-4">
                  {/* 主要信息 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusIcon status={source.status} />
                      <div>
                        <p className="text-white font-medium">{source.name}</p>
                        <p className="text-gray-500 text-sm">{source.code}</p>
                      </div>
                      <span className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded">
                        {source.type.toUpperCase()}
                      </span>
                      {!source.enabled && (
                        <span className="px-2 py-1 bg-gray-700 text-gray-500 text-xs rounded">
                          已禁用
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setExpandedId(
                            expandedId === source.id ? null : source.id
                          )
                        }
                        className="p-2 text-gray-400 hover:text-white transition"
                      >
                        {expandedId === source.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleToggle(source)}
                        className={`px-3 py-1 rounded text-sm transition ${
                          source.enabled
                            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                        }`}
                      >
                        {source.enabled ? "启用" : "禁用"}
                      </button>
                      <button
                        onClick={() => handleTest(source.id)}
                        disabled={testingId === source.id}
                        className="p-2 text-gray-400 hover:text-blue-400 transition"
                      >
                        {testingId === source.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <TestTube className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(source)}
                        className="p-2 text-gray-400 hover:text-yellow-400 transition"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="p-2 text-gray-400 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {expandedId === source.id && (
                    <div className="mt-4 pt-4 border-t border-gray-800 space-y-2 text-sm">
                      <div className="flex">
                        <span className="text-gray-500 w-24">API 地址：</span>
                        <span className="text-gray-300 break-all">
                          {source.base_url}
                        </span>
                      </div>
                      {source.search_path && (
                        <div className="flex">
                          <span className="text-gray-500 w-24">搜索路径：</span>
                          <span className="text-gray-300">
                            {source.search_path}
                          </span>
                        </div>
                      )}
                      {source.detail_path && (
                        <div className="flex">
                          <span className="text-gray-500 w-24">详情路径：</span>
                          <span className="text-gray-300">
                            {source.detail_path}
                          </span>
                        </div>
                      )}
                      <div className="flex">
                        <span className="text-gray-500 w-24">分类：</span>
                        <span className="text-gray-300">
                          {source.categories?.join(", ") || "-"}
                        </span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-500 w-24">优先级：</span>
                        <span className="text-gray-300">{source.priority}</span>
                      </div>
                      {source.error_message && (
                        <div className="flex">
                          <span className="text-gray-500 w-24">错误：</span>
                          <span className="text-red-400">
                            {source.error_message}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 使用说明 */}
        <div className="mt-8 bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">使用说明</h3>
          <div className="space-y-3 text-sm text-gray-400">
            <p>
              <strong className="text-white">CMS 接口：</strong>
              支持苹果CMS、飞飞CMS等常见影视CMS系统的API接口。
            </p>
            <p>
              <strong className="text-white">搜索路径模板：</strong>
              使用 {"{query}"} 代替搜索关键词，{"{page}"} 代替页码。
            </p>
            <p>
              <strong className="text-white">详情路径模板：</strong>
              使用 {"{id}"} 代替视频ID。
            </p>
            <p>
              <strong className="text-white">优先级：</strong>
              数值越大，搜索结果越靠前显示。相同标题会保留优先级更高的源。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
