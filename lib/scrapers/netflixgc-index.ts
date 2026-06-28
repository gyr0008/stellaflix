/**
 * NetflixGC 视频索引
 *
 * 用于快速搜索和匹配视频
 * 从 NetflixGC API 获取所有视频，建立本地索引
 */

import { getList, type NetflixGCSearchResult } from './netflixgc';

/** 索引条目 */
export interface IndexEntry {
  id: number;
  title: string;
  titleLower: string;    // 小写标题，用于快速匹配
  poster: string;
  description: string;
  actors: string;
  actorsLower: string;   // 小写演员，用于快速匹配
  doubanScore: string;
  keywords: string[];     // 分词后的关键词
}

/** 索引缓存 */
let indexCache: IndexEntry[] = [];
let lastUpdateTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

/**
 * 分词函数
 * 将标题拆分为关键词
 */
function tokenize(text: string): string[] {
  const words: string[] = [];

  // 按空格、标点、特殊字符分割
  const parts = text
    .replace(/[，。！？、；：""''（）【】《》\s]+/g, ' ')
    .split(' ')
    .filter(p => p.length > 0);

  for (const part of parts) {
    words.push(part.toLowerCase());

    // 如果是中文，逐字分割
    if (/[一-龥]/.test(part)) {
      for (const char of part) {
        if (/[一-龥]/.test(char)) {
          words.push(char);
        }
      }
    }
  }

  return [...new Set(words)];
}

/**
 * 构建索引
 *
 * 从 NetflixGC API 获取视频，建立搜索索引
 */
export async function buildIndex(): Promise<IndexEntry[]> {
  console.log('开始构建 NetflixGC 索引...');

  const entries: IndexEntry[] = [];
  const seenIds = new Set<number>();

  // 获取多个页面的数据
  for (let page = 1; page <= 10; page++) {
    try {
      const results = await getList(page, 40);

      for (const item of results) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const titleLower = item.title.toLowerCase();
        const actorsLower = item.actors.toLowerCase();

        entries.push({
          id: item.id,
          title: item.title,
          titleLower,
          poster: item.poster,
          description: item.description,
          actors: item.actors,
          actorsLower,
          doubanScore: item.doubanScore,
          keywords: tokenize(item.title + ' ' + item.actors),
        });
      }

      console.log(`已索引 ${entries.length} 个视频...`);
    } catch (error) {
      console.error(`索引第 ${page} 页失败:`, error);
    }
  }

  indexCache = entries;
  lastUpdateTime = Date.now();

  console.log(`NetflixGC 索引构建完成: ${entries.length} 个视频`);
  return entries;
}

/**
 * 获取索引（如果过期则重新构建）
 */
export async function getIndex(): Promise<IndexEntry[]> {
  const now = Date.now();
  if (indexCache.length === 0 || now - lastUpdateTime > CACHE_TTL) {
    await buildIndex();
  }
  return indexCache;
}

/**
 * 搜索视频
 *
 * 支持多种匹配方式：
 * 1. 标题精确匹配
 * 2. 标题包含匹配
 * 3. 演员匹配
 * 4. 关键词匹配
 */
export async function searchIndex(keyword: string): Promise<IndexEntry[]> {
  const index = await getIndex();
  const lowerKeyword = keyword.toLowerCase();

  const results: Array<{ entry: IndexEntry; score: number }> = [];

  for (const entry of index) {
    let score = 0;

    // 1. 标题精确匹配（最高分）
    if (entry.titleLower === lowerKeyword) {
      score = 100;
    }
    // 2. 标题包含关键词
    else if (entry.titleLower.includes(lowerKeyword)) {
      score = 80;
    }
    // 3. 关键词在标题中
    else if (entry.titleLower.includes(lowerKeyword.replace(/\s/g, ''))) {
      score = 70;
    }
    // 4. 演员匹配
    else if (entry.actorsLower.includes(lowerKeyword)) {
      score = 60;
    }
    // 5. 关键词匹配
    else {
      const keywordTokens = tokenize(keyword);
      const matchCount = keywordTokens.filter(t =>
        entry.keywords.includes(t)
      ).length;

      if (matchCount > 0) {
        score = Math.floor((matchCount / keywordTokens.length) * 50);
      }
    }

    if (score > 0) {
      results.push({ entry, score });
    }
  }

  // 按分数排序
  results.sort((a, b) => b.score - a.score);

  // 返回前 20 个结果
  return results.slice(0, 20).map(r => r.entry);
}

/**
 * 获取所有视频（用于浏览）
 */
export async function getAllVideos(): Promise<IndexEntry[]> {
  return getIndex();
}

/**
 * 获取统计信息
 */
export async function getStats(): Promise<{
  total: number;
  lastUpdate: string;
  isStale: boolean;
}> {
  const index = await getIndex();
  return {
    total: index.length,
    lastUpdate: new Date(lastUpdateTime).toISOString(),
    isStale: Date.now() - lastUpdateTime > CACHE_TTL,
  };
}
