/**
 * NetflixGC 爬虫
 *
 * 抓取 https://www.netflixgc.org 的视频内容
 * 使用内部 API：/index.php/ds_api/vod
 *
 * 网站特点：
 * - 苹果 CMS 系统
 * - 提供蓝光、1080P、4K 资源
 * - 总共 88000+ 视频
 */

// ============================================
// 常量配置
// ============================================

/** 网站基础 URL */
const BASE_URL = 'https://www.netflixgc.org';

/** 内部 API URL */
const API_URL = `${BASE_URL}/index.php/ds_api/vod`;

/** 解析接口 URL */
const PARSE_API = 'https://cjbfq.netflixgc.tv/player/ec.php';

/** 请求头 */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': BASE_URL,
  'Content-Type': 'application/x-www-form-urlencoded',
  'X-Requested-With': 'XMLHttpRequest',
};

/** 分类 ID 映射 */
export const CATEGORIES = {
  MOVIE: 1,        // 电影
  TV: 2,           // 连续剧
  DOCUMENTARY: 24, // 纪录片
  COMIC: 3,        // 漫剧
  VARIETY: 23,     // 综艺
  LIVE: 57,        // 直播
};

/** 播放源映射 */
const PLAY_SOURCES: Record<string, string> = {
  'bfzym3u8': '蓝光',
  'ffm3u8': '1080P-1',
  '1080zyk': '1080P-2',
  'xiguam3u8': '蓝光-5',
  'wsym3u8': '蓝光-3',
  'NBY': '蓝光-1',
  'ntflixzx': '蓝光-2',
  'dm295': '蓝光-6',
  'anfun2': '蓝光-8',
  'lzm3u8': '1080P-3',
  'dyttm3u8': '1080P-4',
  'zxskplayer': '4K-独享',
  'zxlgplayer': '蓝光-独享',
};

// ============================================
// 类型定义
// ============================================

/** API 返回的视频项 */
export interface NetflixGCApiItem {
  url: string;
  vod_id: number;
  vod_name: string;
  vod_pic: string;
  vod_pic_thumb: string;
  vod_actor: string;
  vod_tag: string;
  vod_score: string | null;
  vod_douban_score: string;
  vod_remarks: string;
  vod_serial: string;
  vod_blurb: string;
}

/** 搜索结果 */
export interface NetflixGCSearchResult {
  /** 视频 ID */
  id: number;
  /** 标题 */
  title: string;
  /** 海报 URL */
  poster: string;
  /** 简介 */
  description: string;
  /** 状态（完结/更新至XX集） */
  status: string;
  /** 演员 */
  actors: string;
  /** 豆瓣评分 */
  doubanScore: string;
  /** 播放链接 */
  detailUrl: string;
}

/** 播放源 */
export interface PlaySource {
  /** 源标识 */
  key: string;
  /** 显示名称（蓝光、1080P等） */
  name: string;
  /** 画质等级 */
  quality: '4K' | '蓝光' | '1080P' | '720P' | '未知';
  /** 解析接口 URL */
  parseUrl: string;
}

/** 播放结果 */
export interface PlayResult {
  /** m3u8 地址 */
  m3u8Url: string;
  /** 使用的源 */
  sourceKey: string;
  /** 源名称 */
  sourceName: string;
}

// ============================================
// 爬虫核心函数
// ============================================

/**
 * 发送 API 请求（使用原站正确的参数格式）
 *
 * @param params 请求参数
 * @returns API 响应数据
 */
async function fetchApi(params: Record<string, string>): Promise<NetflixGCApiItem[]> {
  // 使用原站的完整参数格式
  const fullParams = {
    class: '',
    area: '',
    year: '',
    lang: '',
    version: '',
    state: '',
    letter: '',
    time: '',
    level: '0',
    weekday: '',
    by: 'time',
    page: '1',
    ...params,
  };

  const body = new URLSearchParams(fullParams).toString();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: HEADERS,
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 1 || !data.list) {
    throw new Error('API 返回数据格式错误');
  }

  return data.list;
}

/**
 * 获取视频列表（全部）
 *
 * @param page 页码（默认 1）
 * @param limit 每页数量（默认 20）
 * @returns 视频列表
 */
export async function getList(
  page: number = 1,
  limit: number = 20
): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    page: String(page),
  });

  // API 不支持 limit 参数，客户端截取
  return items.slice(0, limit).map(formatApiItem);
}

/**
 * 带筛选条件的视频列表
 *
 * @param params 筛选参数
 * @returns 视频列表
 */
export async function getFilteredList(params: {
  type?: string;
  class?: string;
  area?: string;
  year?: string;
  lang?: string;
  letter?: string;
  by?: string;
  page?: number;
}): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    type: params.type || '1',
    class: params.class || '',
    area: params.area || '',
    year: params.year || '',
    lang: params.lang || '',
    letter: params.letter || '',
    by: params.by || 'time',
    page: String(params.page || 1),
  });

  return items.map(formatApiItem);
}

/**
 * 获取视频列表（电影）
 *
 * @param page 页码
 * @returns 电影列表
 */
export async function getMovieList(page: number = 1): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    type: '1', // 电影分类 ID
    page: String(page),
  });

  return items.map(formatApiItem);
}

/**
 * 获取视频列表（连续剧）
 *
 * @param page 页码
 * @returns 连续剧列表
 */
export async function getTvList(page: number = 1): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    type: '2', // 连续剧分类 ID
    page: String(page),
  });

  return items.map(formatApiItem);
}

/**
 * 获取视频列表（纪录片）
 *
 * @param page 页码
 * @returns 纪录片列表
 */
export async function getDocumentaryList(page: number = 1): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    type: '24', // 纪录片分类 ID
    page: String(page),
  });

  return items.map(formatApiItem);
}

/**
 * 获取视频列表（漫剧）
 *
 * @param page 页码
 * @returns 漫剧列表
 */
export async function getComicList(page: number = 1): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    type: '3', // 漫剧分类 ID
    page: String(page),
  });

  return items.map(formatApiItem);
}

/**
 * 获取视频列表（综艺）
 *
 * @param page 页码
 * @returns 综艺列表
 */
export async function getVarietyList(page: number = 1): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    type: '23', // 综艺分类 ID
    page: String(page),
  });

  return items.map(formatApiItem);
}

/**
 * 获取视频列表（直播）
 *
 * @param page 页码
 * @returns 直播列表
 */
export async function getLiveList(page: number = 1): Promise<NetflixGCSearchResult[]> {
  const items = await fetchApi({
    type: '57', // 直播分类 ID
    page: String(page),
  });

  return items.map(formatApiItem);
}

/**
 * 格式化 API 返回的数据
 */
/**
 * 检查URL是否为有效的海报链接
 *
 * @param url 要检查的URL
 * @returns 是否有效
 */
function isValidPosterUrl(url: string | undefined | null): boolean {
  if (!url) return false;

  // 必须是http/https开头
  if (!url.startsWith('http')) return false;

  // 过滤百度代理URL（这些URL通常无法直接访问）
  if (url.includes('image.baidu.com')) return false;

  // 过滤已知无效的域名
  const invalidDomains = ['example.com', 'placeholder.com', 'via.placeholder.com'];
  if (invalidDomains.some(domain => url.includes(domain))) return false;

  return true;
}

/**
 * 格式化API返回的视频项
 *
 * 优先使用vod_pic_thumb（CDN缩略图直链），次选vod_pic
 * 过滤无效URL，确保海报可访问
 *
 * @param item API返回的原始视频数据
 * @returns 格式化后的搜索结果
 */
function formatApiItem(item: NetflixGCApiItem): NetflixGCSearchResult {
  // 优先使用缩略图URL，它是CDN直链更可靠
  // 如果缩略图无效，则尝试使用海报URL
  let posterUrl = item.vod_pic_thumb || item.vod_pic;

  // URL有效性检查和清理
  if (isValidPosterUrl(posterUrl)) {
    // 确保URL以https开头（混合内容问题）
    if (posterUrl.startsWith('http://')) {
      posterUrl = posterUrl.replace('http://', 'https://');
    }
  } else if (isValidPosterUrl(item.vod_pic_thumb)) {
    // 如果主海报无效，尝试缩略图
    posterUrl = item.vod_pic_thumb;
  } else if (isValidPosterUrl(item.vod_pic)) {
    // 如果缩略图无效，尝试原始海报
    posterUrl = item.vod_pic;
  } else {
    // 都无效，使用空字符串（前端会显示占位图）
    posterUrl = '';
  }

  return {
    id: item.vod_id,
    title: item.vod_name,
    poster: posterUrl,
    description: item.vod_blurb || '',
    status: item.vod_remarks || '',
    actors: item.vod_actor || '',
    doubanScore: item.vod_douban_score || '0',
    detailUrl: item.url,
  };
}

/**
 * 构建播放页面 URL
 *
 * @param id 视频 ID
 * @param source 源索引（默认 1）
 * @param episode 集数索引（默认 1）
 * @returns 播放页面 URL
 */
export function buildPlayUrl(id: number, source: number = 1, episode: number = 1): string {
  return `${BASE_URL}/play/${id}-${source}-${episode}.html`;
}

/**
 * 构建详情页面 URL
 *
 * @param id 视频 ID
 * @returns 详情页面 URL
 */
export function buildDetailUrl(id: number): string {
  return `${BASE_URL}/detail/${id}.html`;
}

/**
 * 获取所有可用的播放源
 *
 * @returns 播放源列表
 */
export function getPlaySources(): PlaySource[] {
  return [
    { key: 'zxskplayer', name: '4K-独享', quality: '4K', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'zxlgplayer', name: '蓝光-独享', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'NBY', name: '蓝光-1', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'ntflixzx', name: '蓝光-2', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'wsym3u8', name: '蓝光-3', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'bfzym3u8', name: '蓝光-4', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'xiguam3u8', name: '蓝光-5', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'dm295', name: '蓝光-6', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'anfun2', name: '蓝光-8', quality: '蓝光', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'ffm3u8', name: '1080P-1', quality: '1080P', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: '1080zyk', name: '1080P-2', quality: '1080P', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'lzm3u8', name: '1080P-3', quality: '1080P', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
    { key: 'dyttm3u8', name: '1080P-4', quality: '1080P', parseUrl: `${PARSE_API}?code=netflix&if=1&url=` },
  ];
}

/**
 * 根据源标识获取播放源
 *
 * @param key 源标识
 * @returns 播放源配置
 */
export function getSourceByKey(key: string): PlaySource | undefined {
  return getPlaySources().find(s => s.key === key);
}

/**
 * 获取视频的所有可用播放源（从播放页面提取）
 *
 * @param id 视频 ID
 * @param episode 集数索引
 * @returns 该视频实际可用的播放源列表
 */
export async function getAvailableSources(
  id: number,
  episode: number = 1
): Promise<PlaySource[]> {
  try {
    const playPageUrl = `${BASE_URL}/play/${id}-1-${episode}.html`;
    const response = await fetch(playPageUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return getPlaySources().slice(0, 3); // 返回前3个默认源
    }

    const html = await response.text();

    // 提取 player_aaaa 数据
    const playerMatch = html.match(/player_aaaa=(\{[\s\S]*?\})<\/script>/);
    if (!playerMatch) {
      return getPlaySources().slice(0, 3);
    }

    const playerData = JSON.parse(playerMatch[1]);
    const currentSource = playerData.from; // 当前使用的源

    // 获取所有可用源（从配置中）
    const allSources = getPlaySources();

    // 将当前源排在前面
    const sorted = allSources.sort((a, b) => {
      if (a.key === currentSource) return -1;
      if (b.key === currentSource) return 1;
      return 0;
    });

    return sorted;
  } catch (error) {
    console.error('获取可用源失败:', error);
    return getPlaySources().slice(0, 3);
  }
}

/**
 * 获取视频的真实 m3u8 播放地址
 *
 * 使用 Puppeteer 浏览器拦截网络请求获取真实地址
 *
 * @param id 视频 ID
 * @param source 源索引（默认 1）
 * @param episode 集数索引（默认 1）
 * @returns 真实的 m3u8 地址
 */
/**
 * Base64 解码函数
 *
 * 做什么: 解码 Base64 编码的字符串
 * 参数: str - Base64 编码的字符串
 * 返回: 解码后的原始字符串
 */
function base64Decode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup: Record<string, number> = {};
  for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;

  let result = '';
  for (let i = 0; i < str.length; i += 4) {
    const c1 = lookup[str[i]] || 0;
    const c2 = lookup[str[i + 1]] || 0;
    const c3 = lookup[str[i + 2]] || 0;
    const c4 = lookup[str[i + 3]] || 0;

    result += String.fromCharCode((c1 << 2) | (c2 >> 4));
    if (str[i + 2] !== '=') {
      result += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
    }
    if (str[i + 3] !== '=') {
      result += String.fromCharCode(((c3 & 3) << 6) | c4);
    }
  }
  return result;
}

/**
 * 解密 NetflixGC 编码的 URL
 *
 * 做什么: 解密 player_aaaa 中 encrypt=2 的编码 URL
 * 解密流程:
 *   1. Base64 解码
 *   2. 处理 %uXXXX Unicode 转义序列（如中文路径）
 *   3. 处理 %XX URL 编码
 *
 * 参数: encodedUrl - 编码的 URL 字符串
 * 返回: 解密后的原始 URL (通常是 m3u8 地址)
 */
function decryptUrl(encodedUrl: string): string {
  // Step 1: Base64 解码
  const base64Decoded = base64Decode(encodedUrl);

  // Step 2: 处理 %uXXXX Unicode 转义序列
  // 例如: %u7B2C → 第, %u96C6 → 集
  let result = base64Decoded.replace(/%u([0-9a-fA-F]{4})/gi, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  // Step 3: 处理 %XX URL 编码（只处理可打印 ASCII 字符）
  // 例如: %68 → h, %74 → t, %73 → s
  result = result.replace(/%([0-9a-fA-F]{2})/gi, (_match, hex) => {
    const code = parseInt(hex, 16);
    // 只转换可打印 ASCII 字符 (32-126)
    if (code >= 32 && code < 127) {
      return String.fromCharCode(code);
    }
    return _match; // 保留原始编码
  });

  return result;
}

/**
 * 获取视频的 m3u8 播放地址
 *
 * 做什么: 从 NetflixGC 播放页面提取并解密 m3u8 地址
 * 流程: 访问播放页面 → 提取 player_aaaa → 解密 URL
 *
 * 参数:
 *   - id: 视频 ID
 *   - source: 源索引（默认 1）
 *   - episode: 集数索引（默认 1）
 *
 * 返回: m3u8 播放地址
 */
export async function getPlayUrl(
  id: number,
  source: number = 1,
  episode: number = 1
): Promise<string> {
  const playUrl = `${BASE_URL}/play/${id}-${source}-${episode}.html`;

  try {
    const response = await fetch(playUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    const html = await response.text();

    // 提取 player_aaaa 中的 url 字段
    // HTML 中格式: \"url\":\"编码的URL\" (带转义引号)
    // 先移除反斜杠，然后匹配
    const cleanHtml = html.replace(/\\/g, '');

    // 匹配 "url":"编码的URL"
    const urlMatch = cleanHtml.match(/"url":"([^"]+)"/g);
    // 取最后一个匹配（player_aaaa 中的 url）
    const lastMatch = urlMatch ? urlMatch[urlMatch.length - 1] : '';
    const encodedUrl = lastMatch.replace(/"url":"/, '').replace(/"$/, '');

    if (!encodedUrl || encodedUrl.includes('netflixgc.com')) {
      throw new Error('无法从播放页面提取编码 URL');
    }

    // 提取 encrypt 字段
    const encryptMatch = cleanHtml.match(/"encrypt":(\d+)/);
    const encrypt = encryptMatch ? parseInt(encryptMatch[1]) : 1;

    let m3u8Url: string;

    if (encrypt === 2) {
      // encrypt=2: Base64 + URL 编码
      m3u8Url = decryptUrl(encodedUrl);
    } else {
      // 其他情况: 直接 URL 解码
      m3u8Url = decodeURIComponent(encodedUrl);
    }

    // 验证 URL 格式
    if (!m3u8Url.startsWith('http')) {
      throw new Error('解密后的 URL 格式无效');
    }

    return m3u8Url;
  } catch (error) {
    console.error('获取播放地址失败:', error);
    throw error;
  }
}

/**
 * 通过浏览器获取视频的 m3u8 播放地址（备用方案）
 *
 * 注意：需要 Puppeteer，仅在服务端使用
 *
 * @param id 视频 ID
 * @param source 源索引
 * @param episode 集数索引
 * @returns 真实的 m3u8 地址
 */
export async function getPlayUrlViaBrowser(
  id: number,
  source: number = 1,
  episode: number = 1
): Promise<string> {
  // 动态导入 puppeteer-core（仅在 Node.js 环境）
  const puppeteer = await import('puppeteer-core');

  const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

  const browser = await puppeteer.default.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // 监听网络请求，捕获 m3u8
    const m3u8Urls: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('.m3u8') && !url.includes('ec.php')) {
        m3u8Urls.push(url);
      }
    });

    // 访问播放页面
    const playUrl = `${BASE_URL}/play/${id}-${source}-${episode}.html`;
    await page.goto(playUrl, { waitUntil: 'networkidle0' });

    // 等待播放器加载
    await new Promise(r => setTimeout(r, 8000));

    // 返回第一个 m3u8 地址
    if (m3u8Urls.length > 0) {
      return m3u8Urls[0];
    }

    throw new Error('未捕获到 m3u8 地址');
  } finally {
    await browser.close();
  }
}
