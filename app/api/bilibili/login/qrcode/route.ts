/**
 * B站扫码登录 - 获取二维码
 * 返回二维码URL和qrcode_key，用于轮询登录状态
 */

import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://passport.bilibili.com",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await response.json();

    if (data.code === 0 && data.data) {
      return NextResponse.json({
        success: true,
        url: data.data.url,           // 二维码内容URL
        qrcode_key: data.data.qrcode_key, // 用于轮询的key
        img_url: data.data.url,        // 二维码图片可直接用URL生成
      });
    }

    return NextResponse.json({
      success: false,
      error: data.message || "获取二维码失败",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error).substring(0, 200),
    });
  }
}
