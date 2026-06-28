/**
 * CMS 视频源解析器
 * 用途：解析通用 CMS 格式的视频源
 * 支持：光速影视、牛牛影视、年少影视等
 */

// ============================================
// 类型定义
// ============================================

/** CMS 视频源配置 */
export interface CmsSourceConfig {
  name: string;           // 源名称（如 "GZYS"）
  api: string;            // API 地址（如 "https://api.example.com"）
  searchPath: string;     // 搜索路径（如 "/api.php/provide/vod/"）
  detailPath: string;     // 详情路径
  playUrl: string;        // 播放地址前缀
}

/** 搜索结果 */
export interface CmsSearchResult {
  vod_id: number;
  vod_name: string;
  vod_year: string;
  vod_area: string;
  vod_pic: string;
  vod_play_from: string;
  vod_play_url: string;
}

/** 搜索响应 */
export interface CmsSearchResponse {
  code: number;
  msg: string;
  list: CmsSearchResult[];
}

/** 解析后的播放地址 */
export interface ParsedPlayUrl {
  name: string;           // 集数名称
  url: string;            // 播放地址
  from: string;           // 来源
}

// ============================================
// CMS 解析器
// ============================================

export class CmsParser {
  private config: CmsSourceConfig;

  constructor(config: CmsSourceConfig) {
    this.config = config;
  }

  /**
   * 搜索视频
   * @param keyword 关键词
   * @returns 搜索结果列表
   */
  async search(keyword: string): Promise<CmsSearchResult[]> {
    try {
      const url = `${this.config.api}${this.config.searchPath}?ac=detail&wd=${encodeURIComponent(keyword)}`;

      // 注意：需要通过后端 API 代理请求，避免 CORS 问题
      const response = await fetch(`/api/proxy/cms?url=${encodeURIComponent(url)}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: CmsSearchResponse = await response.json();

      if (data.code !== 1 || !data.list) {
        return [];
      }

      return data.list;
    } catch (error) {
      console.error(`搜索失败 [${this.config.name}]:`, error);
      return [];
    }
  }

  /**
   * 获取视频详情
   * @param vodId 视频 ID
   * @returns 视频详情
   */
  async getDetail(vodId: number): Promise<CmsSearchResult | null> {
    try {
      const url = `${this.config.api}${this.config.detailPath}?ac=detail&ids=${vodId}`;

      const response = await fetch(`/api/proxy/cms?url=${encodeURIComponent(url)}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: CmsSearchResponse = await response.json();

      if (data.code !== 1 || !data.list || data.list.length === 0) {
        return null;
      }

      return data.list[0];
    } catch (error) {
      console.error(`获取详情失败 [${this.config.name}]:`, error);
      return null;
    }
  }

  /**
   * 解析播放地址
   * @param vodPlayUrl 播放地址字符串
   * @param vodPlayFrom 来源名称
   * @returns 解析后的播放地址列表
   */
  parsePlayUrls(vodPlayUrl: string, vodPlayFrom: string): ParsedPlayUrl[] {
    const urls: ParsedPlayUrl[] = [];

    // 格式：https://url1.m3u8#https://url2.m3u8
    // 或：第1集$url1#第2集$url2
    const parts = vodPlayUrl.split('#');

    parts.forEach((part, index) => {
      const [name, url] = part.split('$');

      if (url) {
        urls.push({
          name: name || `第${index + 1}集`,
          url: url,
          from: vodPlayFrom,
        });
      } else {
        // 没有名称，只有 URL
        urls.push({
          name: `第${index + 1}集`,
          url: name,
          from: vodPlayFrom,
        });
      }
    });

    return urls;
  }
}

// ============================================
// 预定义的视频源
// ============================================

export const CMS_SOURCES: CmsSourceConfig[] = [
  {
    name: 'GZYS',
    api: 'https://api.gzys.cyou',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://svip.gzys.cyou/player/',
  },
  {
    name: 'NBY',
    api: 'https://api.nby.icu',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://player.nby.icu/player/',
  },
  {
    name: 'NSYS',
    api: 'https://api.nsys.app',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://player.nsys.app/player/',
  },
  {
    name: 'JPYS',
    api: 'https://api.jpys.me',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://player.jpys.me/player/',
  },
  {
    name: 'GSYS',
    api: 'https://api.guangsuapi.com',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://api.guangsuapi.com/player/',
  },
  {
    name: 'HNNY',
    api: 'https://www.hongniuzy2.com',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://www.hongniuzy2.com/player/',
  },
  {
    name: 'LOVEDAN',
    api: 'https://www.lovedan.net',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://www.lovedan.net/player/',
  },
  {
    name: 'RYCJ',
    api: 'https://cj.rycjapi.com',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://cj.rycjapi.com/player/',
  },
  {
    name: '360ZY',
    api: 'https://360zy.com',
    searchPath: '/api.php/provide/vod/',
    detailPath: '/api.php/provide/vod/',
    playUrl: 'https://360zy.com/player/',
  },
  {
    name: 'JYZY',
    api: 'https://jyzyapi.com',
    searchPath: '/provide/vod/',
    detailPath: '/provide/vod/',
    playUrl: 'https://jyzyapi.com/player/',
  },
];
