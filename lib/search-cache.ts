/**
 * 搜索结果缓存
 *
 * 功能：
 * 1. 缓存搜索结果到 sessionStorage
 * 2. 避免重复搜索
 * 3. 支持设置过期时间
 */

/** 缓存条目 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/** 缓存配置 */
const CACHE_CONFIG = {
  /** 缓存过期时间（毫秒）- 默认 10 分钟 */
  DEFAULT_EXPIRY: 10 * 60 * 1000,
  /** 最大缓存条目数 */
  MAX_ENTRIES: 50,
  /** sessionStorage 前缀 */
  STORAGE_PREFIX: 'stellaflix_search_',
};

/**
 * 生成缓存键
 */
function getCacheKey(key: string): string {
  return `${CACHE_CONFIG.STORAGE_PREFIX}${key}`;
}

/**
 * 设置缓存
 *
 * @param key 缓存键
 * @param data 要缓存的数据
 * @param expiryMs 过期时间（毫秒）
 */
export function setCache<T>(key: string, data: T, expiryMs: number = CACHE_CONFIG.DEFAULT_EXPIRY): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + expiryMs,
    };

    // 检查缓存数量限制
    cleanupOldEntries();

    sessionStorage.setItem(getCacheKey(key), JSON.stringify(entry));
  } catch (error) {
    console.warn('设置缓存失败:', error);
  }
}

/**
 * 获取缓存
 *
 * @param key 缓存键
 * @returns 缓存的数据，如果过期或不存在则返回 null
 */
export function getCache<T>(key: string): T | null {
  try {
    const item = sessionStorage.getItem(getCacheKey(key));
    if (!item) return null;

    const entry: CacheEntry<T> = JSON.parse(item);

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      sessionStorage.removeItem(getCacheKey(key));
      return null;
    }

    return entry.data;
  } catch (error) {
    console.warn('获取缓存失败:', error);
    return null;
  }
}

/**
 * 删除缓存
 *
 * @param key 缓存键
 */
export function removeCache(key: string): void {
  try {
    sessionStorage.removeItem(getCacheKey(key));
  } catch (error) {
    console.warn('删除缓存失败:', error);
  }
}

/**
 * 清空所有搜索缓存
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_CONFIG.STORAGE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('清空缓存失败:', error);
  }
}

/**
 * 清理过期的缓存条目
 */
function cleanupOldEntries(): void {
  try {
    const keys = Object.keys(sessionStorage);
    const searchKeys = keys.filter(key => key.startsWith(CACHE_CONFIG.STORAGE_PREFIX));

    // 如果超过最大数量，删除最旧的
    if (searchKeys.length >= CACHE_CONFIG.MAX_ENTRIES) {
      const entries: { key: string; timestamp: number }[] = [];

      searchKeys.forEach(key => {
        try {
          const item = sessionStorage.getItem(key);
          if (item) {
            const entry: CacheEntry<any> = JSON.parse(item);
            entries.push({ key, timestamp: entry.timestamp });
          }
        } catch {}
      });

      // 按时间排序，删除最旧的
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const toDelete = entries.slice(0, entries.length - CACHE_CONFIG.MAX_ENTRIES + 1);
      toDelete.forEach(({ key }) => sessionStorage.removeItem(key));
    }
  } catch (error) {
    console.warn('清理缓存失败:', error);
  }
}

/**
 * 生成搜索缓存键
 *
 * @param query 搜索关键词
 * @param filters 筛选条件
 * @returns 缓存键
 */
export function generateSearchKey(query: string, filters?: Record<string, string>): string {
  let key = `search_${query}`;
  if (filters) {
    const filterStr = Object.entries(filters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    key += `_${filterStr}`;
  }
  return key;
}
