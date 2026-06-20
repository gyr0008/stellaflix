/**
 * 刮削器工厂
 *
 * 根据配置创建对应的刮削器实例
 */

import { TMDBScraper, createTMDBScraper } from './scraper-tmdb';
import type { ScraperConfig } from './types';

/** 支持的刮削器类型 */
export type ScraperType = 'tmdb';

/**
 * 创建刮削器实例
 * @param type - 刮削器类型
 * @param config - 配置
 * @returns 刮削器实例
 */
export function createScraper(
  type: ScraperType,
  config: Record<string, any>
): TMDBScraper {
  switch (type) {
    case 'tmdb':
      if (!config.api_key) {
        throw new Error('TMDB scraper requires api_key');
      }
      return createTMDBScraper(config.api_key, config.language);

    default:
      throw new Error(`Unknown scraper type: ${type}`);
  }
}

/**
 * 获取支持的刮削器列表
 */
export function getSupportedScrapers(): Array<{
  type: ScraperType;
  name: string;
  description: string;
  required_config: string[];
}> {
  return [
    {
      type: 'tmdb',
      name: 'The Movie Database (TMDB)',
      description: '全球最大的开放电影数据库，提供丰富的元数据',
      required_config: ['api_key'],
    },
  ];
}
