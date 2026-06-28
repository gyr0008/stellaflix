/**
 * CMS同步管理页面
 *
 * 通过后端代理获取CMS数据，避免CORS问题
 * 支持短剧/微短剧过滤和删除
 */

"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { RefreshCw, Database, CheckCircle, XCircle, Loader2, Trash2, Filter, Image } from "lucide-react";

// CMS源配置（全部9个源）
const CMS_SOURCES = [
  { name: '非凡资源', type: 'movie' },
  { name: '量子资源', type: 'documentary' },
  { name: '暴风影视', type: 'other' },
  { name: '光速资源', type: 'movie' },
  { name: '红牛资源', type: 'movie' },
  { name: '恋单资源', type: 'documentary' },
  { name: '瑞诚资源', type: 'other' },
  { name: '360资源', type: 'movie' },
  { name: '闪电资源', type: 'documentary' },
];

// 短剧过滤关键词
const SHORT_DRAMA_KEYWORDS = [
  '短剧', '微短剧', '竖屏剧', '网络短剧', '迷你剧',
  '穿成', '重生', '逆袭', '甜恋', '甜宠', '爽文',
  '首富', '豪门', '总裁', '契约', '替嫁', '闪婚',
  '离婚', '出轨', '复仇', '打脸', '开挂', '系统',
  '穿越', '穿越重生', '穿越古代', '穿越现代',
  '全集', '完结', '连载', '更新至',
];

export default function SyncPage() {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<any>(null);

  // 从CMS获取数据并存入数据库（使用后端sync-cms API）
  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    setProgress("开始同步...");

    try {
      // 使用后端API进行同步，它会自动处理格式转换和过滤
      const response = await fetch('/api/admin/sync-cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'syncAll' }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.message || `同步完成！共同步 ${data.total || 0} 部新内容`,
          total: data.total || 0,
          details: data.details,
        });
      } else {
        setResult({
          success: false,
          message: data.error || '同步失败',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: String(error),
      });
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  // 删除短剧/微短剧
  const handleDeleteShortDrama = async () => {
    if (!confirm('确定要删除所有短剧/微短剧吗？此操作不可撤销。')) {
      return;
    }

    setDeleting(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/sync-cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteShortDrama' }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          deleted: data.deleted,
        });
      } else {
        setResult({
          success: false,
          message: data.error || '删除失败',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: String(error),
      });
    } finally {
      setDeleting(false);
    }
  };

  // 删除没有封面的视频
  const handleDeleteNoPoster = async () => {
    if (!confirm('确定要删除所有没有封面的视频吗？此操作不可撤销。')) {
      return;
    }

    setDeleting(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/sync-cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteNoPoster' }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          deleted: data.deleted,
        });
      } else {
        setResult({
          success: false,
          message: data.error || '删除失败',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: String(error),
      });
    } finally {
      setDeleting(false);
    }
  };

  // 删除封面无法访问的视频
  const handleDeleteBrokenPoster = async () => {
    if (!confirm('确定要删除所有封面无法访问的视频吗？这可能需要一些时间来检测。\n\n此操作不可撤销。')) {
      return;
    }

    setDeleting(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/sync-cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteBrokenPoster' }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          deleted: data.deleted,
        });
      } else {
        setResult({
          success: false,
          message: data.error || '检测失败',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: String(error),
      });
    } finally {
      setDeleting(false);
    }
  };

  // 一键清理所有无效视频
  const handleCleanupAll = async () => {
    if (!confirm('确定要一键清理所有无效视频吗？\n\n将删除：\n• 短剧/微短剧\n• 无封面视频\n• 封面失效的视频\n\n此操作不可撤销，可能需要几分钟时间。')) {
      return;
    }

    setDeleting(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/sync-cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanupAll' }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          details: data.details,
          deleted: data.deleted,
        });
      } else {
        setResult({
          success: false,
          message: data.error || '清理失败',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: String(error),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative z-10">
      <Header visible={true} />

      <div className="pt-24 pb-16 max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-white mb-8">CMS数据同步</h1>

        {/* 同步按钮 */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">一键同步</h2>
          <p className="text-gray-400 mb-4">
            从9个CMS源同步电影、纪录片和其他内容到数据库
          </p>

          <button
            onClick={handleSync}
            disabled={loading}
            className="flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-4 px-8 rounded-lg transition-colors w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{progress || '同步中...'}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                <span>开始同步</span>
              </>
            )}
          </button>
        </div>

        {/* 删除短剧按钮 */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5 text-orange-500" />
            短剧过滤器
          </h2>
          <p className="text-gray-400 mb-4">
            删除数据库中所有短剧/微短剧内容，并在以后同步时自动过滤
          </p>

          <div className="bg-[#2a2a2a] rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-300 mb-2">过滤关键词：</p>
            <div className="flex flex-wrap gap-2">
              {SHORT_DRAMA_KEYWORDS.slice(0, 10).map((keyword) => (
                <span key={keyword} className="px-2 py-1 bg-[#3a3a3a] rounded text-xs text-gray-400">
                  {keyword}
                </span>
              ))}
              <span className="px-2 py-1 bg-[#3a3a3a] rounded text-xs text-gray-400">
                +{SHORT_DRAMA_KEYWORDS.length - 10} 更多...
              </span>
            </div>
          </div>

          <button
            onClick={handleDeleteShortDrama}
            disabled={deleting}
            className="flex items-center justify-center gap-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-medium py-4 px-8 rounded-lg transition-colors w-full"
          >
            {deleting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>删除中...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                <span>删除所有短剧/微短剧</span>
              </>
            )}
          </button>
        </div>

        {/* 无封面视频过滤器 */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Image className="w-5 h-5 text-blue-500" />
            封面过滤器
          </h2>
          <p className="text-gray-400 mb-4">
            删除没有封面或封面无法访问的视频
          </p>

          <div className="bg-[#2a2a2a] rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-300">过滤规则：</p>
            <ul className="mt-2 text-sm text-gray-400 space-y-1">
              <li>• 封面URL为空或不存在</li>
              <li>• 封面URL格式无效（不是http开头）</li>
              <li>• 封面图片已失效（返回403/404错误）</li>
              <li>• 图片有防盗链，无法正常显示</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleDeleteNoPoster}
              disabled={deleting}
              className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-3 px-6 rounded-lg transition-colors w-full"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>处理中...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  <span>删除无封面视频</span>
                </>
              )}
            </button>

            <button
              onClick={handleDeleteBrokenPoster}
              disabled={deleting}
              className="flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium py-3 px-6 rounded-lg transition-colors w-full"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>检测中...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  <span>删除封面失效的视频</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 一键清理按钮 */}
        <div className="bg-gradient-to-r from-red-900/50 to-orange-900/50 border border-red-500/30 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            一键清理所有无效视频
          </h2>
          <p className="text-gray-300 mb-4">
            自动删除以下所有无效内容：
          </p>
          <ul className="text-sm text-gray-400 mb-4 space-y-1">
            <li>✓ 短剧/微短剧</li>
            <li>✓ 无封面视频</li>
            <li>✓ 封面失效的视频（403/404错误）</li>
          </ul>

          <button
            onClick={handleCleanupAll}
            disabled={deleting}
            className="flex items-center justify-center gap-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium py-4 px-8 rounded-lg transition-all w-full"
          >
            {deleting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>清理中，请稍候...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                <span>开始一键清理</span>
              </>
            )}
          </button>
        </div>

        {/* 数据源信息 */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">数据源</h2>
          <div className="space-y-3">
            {CMS_SOURCES.map((source) => (
              <div key={source.name} className="flex items-center justify-between text-gray-400">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4" />
                  <span>{source.name}</span>
                </div>
                <span className="text-sm">{source.type === 'movie' ? '电影' : source.type === 'documentary' ? '纪录片' : '其他'}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[#3a3a3a]">
            <div className="flex items-center gap-2 text-green-400">
              <Filter className="w-4 h-4" />
              <span className="text-sm">短剧/微短剧过滤器已启用</span>
            </div>
            <div className="flex items-center gap-2 text-blue-400 mt-2">
              <Image className="w-4 h-4" />
              <span className="text-sm">无封面视频过滤器已启用</span>
            </div>
          </div>
        </div>

        {/* 同步结果 */}
        {result && (
          <div
            className={`rounded-lg p-6 ${
              result.success ? "bg-green-900/30 border border-green-600" : "bg-red-900/30 border border-red-600"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              {result.success ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <XCircle className="w-6 h-6 text-red-500" />
              )}
              <h3 className={`text-lg font-semibold ${result.success ? "text-green-400" : "text-red-400"}`}>
                {result.success ? "操作成功" : "操作失败"}
              </h3>
            </div>
            <p className="text-gray-300">{result.message}</p>

            {/* 显示详细清理结果 */}
            {result.details && (
              <div className="mt-4 pt-4 border-t border-green-600/30">
                <p className="text-sm text-gray-400 mb-2">详细统计：</p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-[#2a2a2a] rounded-lg p-3 text-center">
                    <p className="text-orange-400 text-lg font-bold">{result.details.shortDrama || 0}</p>
                    <p className="text-gray-500">短剧/微短剧</p>
                  </div>
                  <div className="bg-[#2a2a2a] rounded-lg p-3 text-center">
                    <p className="text-blue-400 text-lg font-bold">{result.details.noPoster || 0}</p>
                    <p className="text-gray-500">无封面</p>
                  </div>
                  <div className="bg-[#2a2a2a] rounded-lg p-3 text-center">
                    <p className="text-red-400 text-lg font-bold">{result.details.brokenPoster || 0}</p>
                    <p className="text-gray-500">封面失效</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 进度显示 */}
        {loading && progress && (
          <div className="bg-[#1a1a1a] rounded-lg p-4 mt-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-gray-300">{progress}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
