/**
 * B站登录页面
 * 扫码登录获取高清画质权限
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle, RefreshCw, Smartphone, QrCode } from 'lucide-react';
import Link from 'next/link';

/** 登录状态 */
type LoginStatus = 'loading' | 'ready' | 'scanned' | 'confirming' | 'success' | 'expired' | 'error';

export default function BilibiliLoginPage() {
  const router = useRouter();
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrcodeKey, setQrcodeKey] = useState('');
  const [status, setStatus] = useState<LoginStatus>('loading');
  const [message, setMessage] = useState('');
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 获取二维码
   */
  const fetchQrCode = useCallback(async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/bilibili/login/qrcode');
      const data = await response.json();

      if (data.success) {
        setQrCodeUrl(data.url);
        setQrcodeKey(data.qrcode_key);
        setStatus('ready');
        setMessage('请使用B站APP扫描二维码');
      } else {
        setStatus('error');
        setMessage(data.error || '获取二维码失败');
      }
    } catch (err) {
      setStatus('error');
      setMessage('网络错误');
    }
  }, []);

  /**
   * 轮询登录状态
   */
  const pollLoginStatus = useCallback(async (key: string) => {
    try {
      const response = await fetch(`/api/bilibili/login/poll?qrcode_key=${key}`);
      const data = await response.json();

      if (!data.success) {
        return;
      }

      switch (data.code) {
        case 0: // 登录成功
          setStatus('success');
          setMessage('登录成功！');

          // 保存cookie到localStorage
          if (data.cookies) {
            localStorage.setItem('bilibili_cookies', JSON.stringify(data.cookies));
            localStorage.setItem('bilibili_cookie_string', data.cookieString || '');
          }

          // 2秒后跳转回B站页面
          setTimeout(() => {
            router.push('/bilibili');
          }, 2000);
          break;

        case 86090: // 已扫码，等待确认
          setStatus('scanned');
          setMessage('已扫码，请在手机上确认');
          break;

        case 86038: // 二维码失效
          setStatus('expired');
          setMessage('二维码已过期，请刷新');
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          break;

        case 86101: // 未扫码
          // 继续轮询
          break;

        default:
          setMessage(data.message || '未知状态');
      }
    } catch (err) {
      // 网络错误，继续轮询
    }
  }, [router]);

  /**
   * 开始轮询
   */
  useEffect(() => {
    if (!qrcodeKey) return;

    // 清除旧的轮询
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    // 每2秒轮询一次
    pollTimerRef.current = setInterval(() => {
      pollLoginStatus(qrcodeKey);
    }, 2000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [qrcodeKey, pollLoginStatus]);

  /**
   * 初始加载
   */
  useEffect(() => {
    fetchQrCode();
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [fetchQrCode]);

  /**
   * 刷新二维码
   */
  const handleRefresh = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    fetchQrCode();
  };

  /**
   * 生成二维码图片URL（使用第三方API将URL转为二维码图片）
   */
  const getQrCodeImgUrl = (url: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* 顶部导航 */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/bilibili"
              className="text-gray-400 hover:text-white transition"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-xl font-bold text-white">B站登录</h1>
          </div>
        </div>
      </div>

      {/* 内容 */}
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-gray-800 rounded-2xl p-8 text-center">
          {/* 标题 */}
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-[#00a1d6]/10 rounded-full flex items-center justify-center">
              <QrCode className="w-8 h-8 text-[#00a1d6]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">扫码登录</h2>
            <p className="text-gray-400 text-sm">
              登录后可观看1080P+高清视频
            </p>
          </div>

          {/* 二维码区域 */}
          <div className="mb-6">
            {status === 'loading' && (
              <div className="w-[250px] h-[250px] mx-auto bg-gray-700 rounded-lg flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-[#00a1d6] animate-spin" />
              </div>
            )}

            {status === 'error' && (
              <div className="w-[250px] h-[250px] mx-auto bg-gray-700 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <p className="text-red-400 text-sm mb-2">{message}</p>
                  <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-[#00a1d6] hover:bg-[#00b5e5] text-white rounded-lg text-sm transition"
                  >
                    重试
                  </button>
                </div>
              </div>
            )}

            {(status === 'ready' || status === 'scanned') && qrCodeUrl && (
              <div className="relative w-[250px] h-[250px] mx-auto">
                <img
                  src={getQrCodeImgUrl(qrCodeUrl)}
                  alt="B站登录二维码"
                  className="w-full h-full rounded-lg"
                />
                {status === 'scanned' && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-16 h-16 text-green-500" />
                  </div>
                )}
              </div>
            )}

            {status === 'expired' && (
              <div className="w-[250px] h-[250px] mx-auto bg-gray-700 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <p className="text-yellow-400 text-sm mb-2">二维码已过期</p>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2 bg-[#00a1d6] hover:bg-[#00b5e5] text-white rounded-lg text-sm transition mx-auto"
                  >
                    <RefreshCw className="w-4 h-4" />
                    刷新二维码
                  </button>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="w-[250px] h-[250px] mx-auto bg-gray-700 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-2" />
                  <p className="text-green-400 font-medium">登录成功！</p>
                </div>
              </div>
            )}
          </div>

          {/* 状态提示 */}
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-6">
            <Smartphone className="w-4 h-4" />
            <span>
              {status === 'loading' && '正在加载二维码...'}
              {status === 'ready' && '打开B站APP → 扫一扫'}
              {status === 'scanned' && '请在手机上确认登录'}
              {status === 'success' && '正在跳转...'}
              {status === 'expired' && '请点击下方刷新'}
              {status === 'error' && '请检查网络后重试'}
            </span>
          </div>

          {/* 刷新按钮 */}
          {(status === 'ready' || status === 'expired') && (
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              刷新二维码
            </button>
          )}
        </div>

        {/* 说明 */}
        <div className="mt-6 bg-gray-800/50 rounded-xl p-4">
          <h3 className="text-white font-medium mb-3">登录后可享受</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              观看1080P高清视频
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              1080P60高帧率视频（需大会员）
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              4K/HDR/杜比视界（需大会员）
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              无水印原始视频流
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
