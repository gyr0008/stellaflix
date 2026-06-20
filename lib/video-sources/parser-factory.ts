/**
 * 解析器工厂
 *
 * 根据视频源配置创建对应的解析器实例
 */

import type { VideoSourceConfig, VideoSourceParser, VideoSourceType } from './types';
import { CmsParser } from './parser-cms';
// 未来可以添加其他解析器
// import { ApiParser } from './parser-api';
// import { ScrapeParser } from './parser-scrape';

/**
 * 创建解析器实例
 * @param config - 视频源配置
 * @returns 解析器实例
 */
export function createParser(config: VideoSourceConfig): VideoSourceParser {
  switch (config.type) {
    case 'cms':
      return new CmsParser(config);

    case 'api':
      // TODO: 实现 API 解析器
      throw new Error(`API parser not implemented yet`);

    case 'scrape':
      // TODO: 实现网页抓取解析器
      throw new Error(`Scrape parser not implemented yet`);

    case 'direct':
      // 直接链接不需要解析器
      throw new Error(`Direct type does not need parser`);

    default:
      throw new Error(`Unknown parser type: ${config.type}`);
  }
}

/**
 * 获取所有支持的解析器类型
 * @returns 解析器类型列表
 */
export function getSupportedTypes(): VideoSourceType[] {
  return ['cms']; // 目前只支持 CMS
}
