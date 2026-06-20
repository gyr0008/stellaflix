/**
 * CMS 视频源解析器
 *
 * 支持常见的 CMS 系统（苹果CMS、飞飞CMS 等）的 API 接口
 * 这类接口通常返回 JSON 格式数据
 */

import type { VideoSourceConfig, SearchResult, VideoDetail, PlayUrl, SearchParams } from './types';
import { BaseParser } from './parser-base';

/** CMS API 响应格式 */
interface CmsApiResponse {
  code: number;
  msg?: string;
  list?: any[];
  page?: number;
  pagecount?: number;
  limit?: number;
  total?: number;
}

/** CMS 视频详情格式 */
interface CmsVideoDetail {
  vod_id: number;
  vod_name: string;
  vod_content?: string;
  vod_pic?: string;
  vod_year?: string;
  vod_area?: string;
  vod_lang?: string;
  vod_class?: string;
  vod_director?: string;
  vod_actor?: string;
  vod_remarks?: string;
  vod_play_url?: string;
  vod_play_from?: string;
  type_id?: number;
  type_name?: string;
}

export class CmsParser extends BaseParser {
  constructor(config: VideoSourceConfig) {
    super(config);
    // CMS 解析器默认超时时间
    this.requestTimeout = 15000;
  }

  /**
   * 搜索视频
   * @param params - 搜索参数
   * @returns 搜索结果列表
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const { query, page = 1 } = params;
    const url = this.buildSearchUrl(query, page);

    const startTime = Date.now();
    const data = await this.fetchJson<CmsApiResponse>(url);
    const responseTime = Date.now() - startTime;

    await this.log('search', url, 200, responseTime);

    // 解析响应
    if (!data.list || !Array.isArray(data.list)) {
      return [];
    }

    return data.list.map((item: CmsVideoDetail) => this.parseSearchItem(item));
  }

  /**
   * 解析搜索结果项
   * @param item - CMS 返回的视频数据
   * @returns 标准化的搜索结果
   */
  private parseSearchItem(item: CmsVideoDetail): SearchResult {
    return {
      id: String(item.vod_id),
      title: item.vod_name || '未知标题',
      cover: this.formatCoverUrl(item.vod_pic),
      year: item.vod_year ? parseInt(item.vod_year) : undefined,
      type: this.guessVideoType(item),
      source: this.config.code,
      source_name: this.config.name,
      url: String(item.vod_id),
      extra_data: {
        remarks: item.vod_remarks,
        type_name: item.type_name,
      },
    };
  }

  /**
   * 获取视频详情
   * @param id - 视频ID
   * @returns 视频详情
   */
  async getDetail(id: string): Promise<VideoDetail> {
    const url = this.buildDetailUrl(id);

    const startTime = Date.now();
    const data = await this.fetchJson<{ list: CmsVideoDetail[] }>(url);
    const responseTime = Date.now() - startTime;

    await this.log('detail', url, 200, responseTime);

    if (!data.list || data.list.length === 0) {
      throw new Error('Video not found');
    }

    const item = data.list[0];
    return this.parseDetail(item);
  }

  /**
   * 解析视频详情
   * @param item - CMS 返回的视频数据
   * @returns 标准化的视频详情
   */
  private parseDetail(item: CmsVideoDetail): VideoDetail {
    return {
      id: String(item.vod_id),
      title: item.vod_name || '未知标题',
      description: this.cleanHtml(item.vod_content || ''),
      cover: this.formatCoverUrl(item.vod_pic),
      poster: this.formatCoverUrl(item.vod_pic),
      year: item.vod_year ? parseInt(item.vod_year) : undefined,
      genre: item.vod_class ? item.vod_class.split(',').map(s => s.trim()) : [],
      director: item.vod_director ? item.vod_director.split(',').map(s => s.trim()) : [],
      actors: item.vod_actor ? item.vod_actor.split(',').map(s => s.trim()) : [],
      area: item.vod_area,
      language: item.vod_lang,
      episodes: this.parsePlayUrls(item.vod_play_url, item.vod_play_from),
      source_url: this.buildDetailUrl(String(item.vod_id)),
    };
  }

  /**
   * 解析播放地址
   * @param playUrlStr - 播放地址字符串
   * @param playFromStr - 播放来源字符串
   * @returns 剧集列表
   */
  private parsePlayUrls(playUrlStr?: string, playFromStr?: string): VideoDetail['episodes'] {
    if (!playUrlStr) {
      return [];
    }

    const episodes: VideoDetail['episodes'] = [];
    const sources = playFromStr ? playFromStr.split('$$$') : ['默认线路'];
    const urlGroups = playUrlStr.split('$$$');

    sources.forEach((sourceName, groupIndex) => {
      const urls = urlGroups[groupIndex] || '';
      const urlList = urls.split('#');

      urlList.forEach((urlItem, index) => {
        const [episodeName, episodeUrl] = urlItem.split('$');

        if (episodeUrl) {
          episodes.push({
            id: `${groupIndex}-${index}`,
            title: episodeName || `第${index + 1}集`,
            url: episodeUrl,
            episode_number: index + 1,
            season_number: groupIndex + 1,
          });
        }
      });
    });

    return episodes;
  }

  /**
   * 获取播放地址
   * @param url - 播放链接（可能是直接链接或需要解析）
   * @returns 播放地址列表
   */
  async getPlayUrl(url: string): Promise<PlayUrl[]> {
    // 如果是直接链接
    if (url.startsWith('http')) {
      const format = this.guessFormat(url);
      return [{
        url,
        type: format,
        name: '默认线路',
      }];
    }

    // 如果是ID，需要获取详情
    try {
      const detail = await this.getDetail(url);
      if (!detail.episodes || detail.episodes.length === 0) {
        return [];
      }

      return detail.episodes.map(ep => ({
        url: ep.url,
        type: this.guessFormat(ep.url),
        name: ep.title,
      }));
    } catch (error) {
      console.error('Failed to get play url:', error);
      return [];
    }
  }

  /**
   * 测试连接
   * @returns 是否成功
   */
  async testConnection(): Promise<boolean> {
    const url = this.buildUrl('/');
    const startTime = Date.now();
    await this.fetchJson(url);
    const responseTime = Date.now() - startTime;

    await this.log('test', url, 200, responseTime);
    return true;
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 格式化封面图 URL
   * @param url - 原始 URL
   * @returns 格式化后的 URL
   */
  private formatCoverUrl(url?: string): string | undefined {
    if (!url) return undefined;

    // 如果是相对路径，补全为完整 URL
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    if (url.startsWith('/')) {
      return `${this.config.base_url}${url}`;
    }
    return url;
  }

  /**
   * 清理 HTML 标签
   * @param html - HTML 字符串
   * @returns 纯文本
   */
  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }

  /**
   * 猜测视频类型
   * @param item - 视频数据
   * @returns 视频类型
   */
  private guessVideoType(item: CmsVideoDetail): SearchResult['type'] {
    const typeName = item.type_name || item.vod_class || '';
    if (typeName.includes('电影') || typeName.includes('movie')) {
      return 'movie';
    }
    if (typeName.includes('电视剧') || typeName.includes('tv')) {
      return 'tv';
    }
    if (typeName.includes('动漫') || typeName.includes('anime')) {
      return 'anime';
    }
    if (typeName.includes('纪录片') || typeName.includes('documentary')) {
      return 'documentary';
    }
    return 'movie';
  }

  /**
   * 猜测视频格式
   * @param url - 视频 URL
   * @returns 视频格式
   */
  private guessFormat(url: string): PlayUrl['type'] {
    if (url.includes('.m3u8') || url.includes('m3u8')) {
      return 'm3u8';
    }
    if (url.includes('.flv') || url.includes('flv')) {
      return 'flv';
    }
    if (url.includes('.mpd') || url.includes('dash')) {
      return 'mpd';
    }
    return 'mp4';
  }
}
