/**
 * 多源视频系统 - 统一导出
 *
 * 导出所有公共类型和函数
 */

// 类型
export type {
  VideoSourceType,
  VideoSourceStatus,
  VideoSourceConfig,
  VideoType,
  VideoDetail,
  Episode,
  PlayUrl,
  SearchResult,
  SearchParams,
  SearchResponse,
  SourceError,
  VideoSourceParser,
  LogAction,
  SourceLog,
} from './types';

// 解析器
export { BaseParser } from './parser-base';
export { CmsParser } from './parser-cms';
export { createParser, getSupportedTypes } from './parser-factory';

// 聚合器
export { Aggregator, aggregator } from './aggregator';
