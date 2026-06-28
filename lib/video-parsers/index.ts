/**
 * 视频源解析器
 * 用途：解析不同类型的视频源，返回可播放的 URL
 * 参考：Kazumi 的多源聚合架构
 */

// ============================================
// 类型定义
// ============================================

/** 视频源类型 */
export enum VideoSourceType {
  YOUTUBE = 'youtube',
  VIMEO = 'vimeo',
  CUSTOM_EMBED = 'custom_embed',
  CUSTOM_URL = 'custom_url',
  LOCAL_FILE = 'local_file',
}

/** 视频源配置 */
export interface VideoSourceConfig {
  id: string;
  name: string;
  source_type: VideoSourceType;
  priority: number;
  regions: string[];
  is_active: boolean;
  config: {
    youtube?: { videoId: string };
    vimeo?: { videoId: string };
    customEmbed?: { embedUrl: string; allowFullscreen: boolean };
    customUrl?: { videoUrl: string; type: 'm3u8' | 'mp4' | 'webm' };
  };
}

/** 解析结果 */
export interface VideoParseResult {
  success: boolean;
  videoUrl?: string;
  title?: string;
  type: 'hls' | 'mp4' | 'embed';
  error?: string;
}

// ============================================
// 解析器接口
// ============================================

interface VideoParser {
  parse(source: VideoSourceConfig): Promise<VideoParseResult>;
}

// ============================================
// YouTube 解析器
// ============================================

class YouTubeParser implements VideoParser {
  async parse(source: VideoSourceConfig): Promise<VideoParseResult> {
    const videoId = source.config.youtube?.videoId;
    if (!videoId) {
      return { success: false, type: 'embed', error: 'Missing YouTube video ID' };
    }

    // YouTube 嵌入 URL
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;

    return {
      success: true,
      videoUrl: embedUrl,
      title: source.name,
      type: 'embed',
    };
  }
}

// ============================================
// Vimeo 解析器
// ============================================

class VimeoParser implements VideoParser {
  async parse(source: VideoSourceConfig): Promise<VideoParseResult> {
    const videoId = source.config.vimeo?.videoId;
    if (!videoId) {
      return { success: false, type: 'embed', error: 'Missing Vimeo video ID' };
    }

    const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=1`;

    return {
      success: true,
      videoUrl: embedUrl,
      title: source.name,
      type: 'embed',
    };
  }
}

// ============================================
// 自定义嵌入解析器
// ============================================

class CustomEmbedParser implements VideoParser {
  async parse(source: VideoSourceConfig): Promise<VideoParseResult> {
    const embedUrl = source.config.customEmbed?.embedUrl;
    if (!embedUrl) {
      return { success: false, type: 'embed', error: 'Missing embed URL' };
    }

    return {
      success: true,
      videoUrl: embedUrl,
      title: source.name,
      type: 'embed',
    };
  }
}

// ============================================
// 自定义 URL 解析器
// ============================================

class CustomUrlParser implements VideoParser {
  async parse(source: VideoSourceConfig): Promise<VideoParseResult> {
    const config = source.config.customUrl;
    if (!config?.videoUrl) {
      return { success: false, type: 'mp4', error: 'Missing video URL' };
    }

    const type = config.type === 'm3u8' ? 'hls' : 'mp4';

    return {
      success: true,
      videoUrl: config.videoUrl,
      title: source.name,
      type,
    };
  }
}

// ============================================
// 视频源管理器（类似 Kazumi）
// ============================================

export class VideoSourceManager {
  private parsers: Map<VideoSourceType, VideoParser>;

  constructor() {
    this.parsers = new Map([
      [VideoSourceType.YOUTUBE, new YouTubeParser()],
      [VideoSourceType.VIMEO, new VimeoParser()],
      [VideoSourceType.CUSTOM_EMBED, new CustomEmbedParser()],
      [VideoSourceType.CUSTOM_URL, new CustomUrlParser()],
    ]);
  }

  /**
   * 解析视频源
   * @param source 视频源配置
   * @returns 解析结果
   */
  async parse(source: VideoSourceConfig): Promise<VideoParseResult> {
    const parser = this.parsers.get(source.source_type);
    if (!parser) {
      return {
        success: false,
        type: 'embed',
        error: `Unsupported source type: ${source.source_type}`,
      };
    }

    try {
      return await parser.parse(source);
    } catch (error) {
      return {
        success: false,
        type: 'embed',
        error: String(error),
      };
    }
  }

  /**
   * 自动切换源（类似 Kazumi 的 fallback 机制）
   * @param sources 视频源列表（已按优先级排序）
   * @returns 第一个可用的解析结果
   */
  async parseWithFallback(sources: VideoSourceConfig[]): Promise<VideoParseResult> {
    for (const source of sources) {
      console.log(`尝试源: ${source.name}`);
      const result = await this.parse(source);

      if (result.success) {
        console.log(`成功: ${source.name}`);
        return result;
      }

      console.log(`失败: ${source.name} - ${result.error}`);
    }

    return {
      success: false,
      type: 'embed',
      error: '所有视频源都不可用',
    };
  }
}
