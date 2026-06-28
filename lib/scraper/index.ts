/**
 * 刮削器系统 - 统一导出
 *
 * 导出所有公共类型和函数
 */

// 类型
export type {
  MovieMetadata,
  ScrapeResult,
  ScrapeSearchResult,
  ScraperConfig,
  Genre,
  Person,
  CastMember,
  CrewMember,
  Language,
  Country,
  Company,
  ExternalIds,
} from './types';

// 基类
export { ScraperBase } from './scraper-base';

// TMDB 刮削器
export { TMDBScraper, createTMDBScraper } from './scraper-tmdb';

// 豆瓣爬虫
export { DoubanScraper, createDoubanScraper } from './scraper-douban';

// 评分聚合服务
export { RatingAggregator, createRatingAggregator } from './rating-aggregator';
export type { RatingSource, AggregatedRating } from './rating-aggregator';

// 工厂
export { createScraper, getSupportedScrapers } from './scraper-factory';
export type { ScraperType } from './scraper-factory';
