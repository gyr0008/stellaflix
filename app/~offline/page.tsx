"use client";

/**
 * 离线页面
 * 当用户没有网络连接时显示此页面
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-red-600">StellaFlix</h1>
      </div>

      {/* 离线图标 */}
      <div className="mb-8">
        <svg
          className="w-24 h-24 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      </div>

      {/* 提示信息 */}
      <h2 className="text-2xl font-semibold text-white mb-4">
        网络连接已断开
      </h2>
      <p className="text-gray-400 text-center max-w-md mb-8">
        请检查您的网络连接，然后重试。
        <br />
        您可以查看已下载的内容（如果有）。
      </p>

      {/* 重试按钮 */}
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
      >
        重新连接
      </button>

      {/* 返回首页 */}
      <a
        href="/"
        className="mt-4 text-gray-400 hover:text-white transition-colors"
      >
        返回首页
      </a>
    </div>
  );
}
