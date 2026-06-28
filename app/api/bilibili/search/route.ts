/**
 * B站视频搜索 API
 * 调用B站官方接口搜索视频内容
 * 包含wbi签名和cookie处理以绕过风控
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ============================================
// WBI 签名相关
// ============================================

/** wbi签名密钥缓存 */
let wbiKeys: { img_key: string; sub_key: string; expires: number } | null = null;

/** wbi签名混淆表 */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

/**
 * 获取wbi签名密钥
 * 从B站nav接口获取img_key和sub_key
 */
async function getWbiKeys(): Promise<{ img_key: string; sub_key: string }> {
  // 缓存有效则直接返回（有效期5分钟）
  if (wbiKeys && Date.now() < wbiKeys.expires) {
    return { img_key: wbiKeys.img_key, sub_key: wbiKeys.sub_key };
  }

  try {
    const response = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com",
      },
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();

    if (data.code === 0 && data.data?.wbi_img) {
      const imgUrl = data.data.wbi_img.img_url;
      const subUrl = data.data.wbi_img.sub_url;

      // 从URL中提取key（取文件名去掉扩展名）
      const img_key = imgUrl.split("/").pop()?.split(".")[0] || "";
      const sub_key = subUrl.split("/").pop()?.split(".")[0] || "";

      wbiKeys = {
        img_key,
        sub_key,
        expires: Date.now() + 5 * 60 * 1000, // 缓存5分钟
      };

      return { img_key, sub_key };
    }
  } catch (error) {
    console.error("获取wbi密钥失败:", error);
  }

  // 返回空密钥，让请求不带签名（可能仍能工作）
  return { img_key: "", sub_key: "" };
}

/**
 * 生成wbi签名
 * @param params 请求参数
 * @param img_key 图片密钥
 * @param sub_key 子密钥
 * @returns 签名后的参数
 */
function getWbiSign(
  params: Record<string, string>,
  img_key: string,
  sub_key: string
): string {
  const mixin_key = (img_key + sub_key)
    .split("")
    .map((_, i) => (img_key + sub_key)[MIXIN_KEY_ENC_TAB[i]])
    .join("")
    .slice(0, 32);

  const curr_time = Math.round(Date.now() / 1000);
  params.wts = curr_time.toString();

  // 按key排序，过滤特殊字符
  const query = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key]
        .replace(/[!'()*]/g, "")
        .replace(/%20/g, "+");
      return `${key}=${value}`;
    })
    .join("&");

  // MD5签名
  const w_rid = crypto.createHash("md5").update(query + mixin_key).digest("hex");

  return query + "&w_rid=" + w_rid;
}

// ============================================
// Cookie 管理
// ============================================

/** 缓存的cookie */
let cachedCookie: string | null = null;
let cookieExpires = 0;

/**
 * 获取B站访问cookie
 * 通过访问B站首页获取必要的cookie
 */
async function getBilibiliCookie(): Promise<string> {
  if (cachedCookie && Date.now() < cookieExpires) {
    return cachedCookie;
  }

  try {
    const response = await fetch("https://www.bilibili.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

    // 从Set-Cookie中提取cookie
    const setCookies = response.headers.getSetCookie?.() || [];
    const cookies = setCookies
      .map((c) => c.split(";")[0])
      .filter((c) => c.includes("buvid3") || c.includes("buvid4") || c.includes("b_nut") || c.includes("_uuid"))
      .join("; ");

    if (cookies) {
      cachedCookie = cookies;
      cookieExpires = Date.now() + 30 * 60 * 1000; // 缓存30分钟
      return cookies;
    }
  } catch (error) {
    console.error("获取cookie失败:", error);
  }

  return "";
}

// ============================================
// 搜索类型定义
// ============================================

/** B站搜索结果类型 */
interface BilibiliSearchItem {
  bvid: string;
  title: string;
  description: string;
  duration: string;
  pic: string;
  author: string;
  play: number;
  danmaku: number;
  pubdate: number;
}

/** B站搜索API响应 */
interface BilibiliApiResponse {
  code: number;
  message: string;
  data: {
    result?: BilibiliSearchItem[];
    numResults?: number;
    numPages?: number;
  };
}

/**
 * 清理B站标题中的HTML标签
 */
function cleanHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

// ============================================
// API 路由
// ============================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("wd");
  const page = parseInt(searchParams.get("page") || "1");
  const userCookie = searchParams.get("cookie") || "";

  if (!keyword) {
    return NextResponse.json({ error: "Missing wd parameter" }, { status: 400 });
  }

  try {
    // 并行获取wbi密钥和cookie
    const [wbiKeysResult, autoCookie] = await Promise.all([
      getWbiKeys(),
      getBilibiliCookie(),
    ]);

    // 优先使用用户提供的cookie
    const cookie = userCookie || autoCookie;

    // 构建搜索参数
    const params: Record<string, string> = {
      search_type: "video",
      keyword,
      page: page.toString(),
      order: "totalrank",
    };

    // 生成带wbi签名的查询字符串
    const queryString = getWbiSign(
      params,
      wbiKeysResult.img_key,
      wbiKeysResult.sub_key
    );

    const url = `https://api.bilibili.com/x/web-interface/search/type?${queryString}`;

    // 构建请求头
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://search.bilibili.com",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Origin: "https://search.bilibili.com",
    };

    if (cookie) {
      headers.Cookie = cookie;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 412) {
      // 被风控，清除cookie缓存重试
      cachedCookie = null;
      return NextResponse.json({
        success: false,
        error: "B站安全风控，请稍后重试",
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: BilibiliApiResponse = await response.json();

    if (data.code !== 0) {
      return NextResponse.json({
        success: false,
        error: data.message || "B站API返回错误",
      });
    }

    // 格式化搜索结果
    const results = (data.data.result || []).map((item) => ({
      bvid: item.bvid,
      title: cleanHtml(item.title),
      description: cleanHtml(item.description),
      duration: item.duration,
      pic: item.pic.startsWith("//") ? `https:${item.pic}` : item.pic,
      author: item.author,
      play: item.play,
      danmaku: item.danmaku,
      pubdate: item.pubdate,
    }));

    return NextResponse.json({
      success: true,
      source: "bilibili",
      total: data.data.numResults || results.length,
      page,
      pageNums: data.data.numPages || 1,
      results,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error).substring(0, 200),
    });
  }
}
