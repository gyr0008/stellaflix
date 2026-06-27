/**
 * CMS 视频源统一配置
 *
 * 所有 API 端点共享此配置，避免重复定义
 * 按优先级排序（数字越小越优先）
 */

/** CMS 源配置类型 */
export interface CmsSource {
  /** 源名称 */
  name: string;
  /** API 地址 */
  api: string;
  /** 优先级（数字越小越优先） */
  priority: number;
  /** 权重（用于多源聚合评分，越高越好） */
  weight: number;
  /** 支持的地区 */
  regions: string[];
  /** 支持的分类 */
  categories: string[];
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 所有 CMS 视频源配置
 * 按优先级排序
 */
export const CMS_SOURCES: CmsSource[] = [
  {
    name: '非凡资源',
    api: 'http://cj.ffzyapi.com/api.php/provide/vod',
    priority: 1,
    weight: 90,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺', '纪录片'],
    enabled: true,
  },
  {
    name: '量子资源',
    api: 'https://cj.lziapi.com/api.php/provide/vod',
    priority: 2,
    weight: 85,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺', '纪录片'],
    enabled: true,
  },
  {
    name: '暴风影视',
    api: 'https://bfzyapi.com/api.php/provide/vod',
    priority: 3,
    weight: 85,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺', '纪录片', 'AI漫剧'],
    enabled: true,
  },
  {
    name: '光速资源',
    api: 'https://api.guangsuapi.com/api.php/provide/vod',
    priority: 4,
    weight: 80,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺'],
    enabled: true,
  },
  {
    name: '红牛资源',
    api: 'https://www.hongniuzy2.com/api.php/provide/vod',
    priority: 5,
    weight: 80,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺'],
    enabled: true,
  },
  {
    name: '恋单资源',
    api: 'https://www.lovedan.net/api.php/provide/vod',
    priority: 6,
    weight: 75,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺'],
    enabled: true,
  },
  {
    name: '瑞诚资源',
    api: 'https://cj.rycjapi.com/api.php/provide/vod',
    priority: 7,
    weight: 75,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺'],
    enabled: true,
  },
  {
    name: '360资源',
    api: 'https://360zy.com/api.php/provide/vod',
    priority: 8,
    weight: 70,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺'],
    enabled: true,
  },
  {
    name: '佳影资源',
    api: 'https://jyzyapi.com/provide/vod',
    priority: 9,
    weight: 70,
    regions: ['全球'],
    categories: ['电影', '电视剧', '动漫', '综艺'],
    enabled: true,
  },
];

/**
 * 获取所有启用的源
 * @returns 按优先级排序的源列表
 */
export function getEnabledSources(): CmsSource[] {
  return CMS_SOURCES.filter(s => s.enabled).sort((a, b) => a.priority - b.priority);
}

/**
 * 根据名称获取源
 * @param name 源名称
 * @returns 找到的源或 undefined
 */
export function getSourceByName(name: string): CmsSource | undefined {
  return CMS_SOURCES.find(s => s.name === name);
}

/**
 * 获取源的搜索 URL
 * @param source 源配置
 * @param keyword 搜索关键词
 * @returns 完整的搜索 URL
 */
export function getSearchUrl(source: CmsSource, keyword: string): string {
  return `${source.api}?ac=detail&wd=${encodeURIComponent(keyword)}`;
}

/**
 * 获取源的详情 URL
 * @param source 源配置
 * @param vodId 视频 ID
 * @returns 完整的详情 URL
 */
export function getDetailUrl(source: CmsSource, vodId: number | string): string {
  return `${source.api}?ac=detail&ids=${vodId}`;
}

/**
 * 获取源的列表 URL
 * @param source 源配置
 * @param page 页码
 * @param pageSize 每页数量
 * @returns 完整的列表 URL
 */
export function getListUrl(source: CmsSource, page: number = 1, pageSize: number = 20): string {
  return `${source.api}?ac=list&pg=${page}&pagesize=${pageSize}`;
}
