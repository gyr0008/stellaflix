/**
 * B站扫码登录 - 轮询登录状态
 * 根据qrcode_key轮询用户是否已扫码确认
 * 返回登录cookie用于后续API调用
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qrcodeKey = searchParams.get("qrcode_key");

  if (!qrcodeKey) {
    return NextResponse.json(
      { error: "Missing qrcode_key parameter" },
      { status: 400 }
    );
  }

  try {
    const url = `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://passport.bilibili.com",
      },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();

    if (data.code !== 0) {
      return NextResponse.json({
        success: false,
        error: data.message || "查询失败",
      });
    }

    const pollData = data.data;

    // 返回状态码说明：
    // 0: 登录成功
    // 86038: 二维码已失效
    // 86090: 已扫码，等待确认
    // 86101: 未扫码
    const result: Record<string, any> = {
      success: true,
      code: pollData.code,
      message: pollData.message,
    };

    // 登录成功，返回cookie信息
    if (pollData.code === 0 && pollData.url) {
      // 从回调URL中提取cookie参数
      const callbackUrl = new URL(pollData.url);
      const cookieStr = callbackUrl.searchParams.get("DedeUserID") ? "" : "";

      // 提取关键cookie
      const cookies: Record<string, string> = {};

      // 从set-cookie获取
      const setCookies = response.headers.getSetCookie?.() || [];
      for (const c of setCookies) {
        const [pair] = c.split(";");
        const [key, ...valueParts] = pair.split("=");
        cookies[key.trim()] = valueParts.join("=");
      }

      // 也从URL参数提取
      for (const [key, value] of callbackUrl.searchParams.entries()) {
        if (value && !cookies[key]) {
          cookies[key] = value;
        }
      }

      result.cookies = {
        SESSDATA: cookies.SESSDATA || "",
        bili_jct: cookies.bili_jct || "",
        DedeUserID: cookies.DedeUserID || "",
        DedeUserID__ckMd5: cookies.DedeUserID__ckMd5 || "",
        buvid3: cookies.buvid3 || "",
      };

      // 构建完整的cookie字符串供API使用
      result.cookieString = Object.entries(result.cookies)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error).substring(0, 200),
    });
  }
}
