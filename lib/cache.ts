/**
 * 通用内存缓存工具
 *
 * 功能：
 * - 支持 TTL（Time To Live）过期机制
 * - 支持 get/set/has/delete/clear 操作
 * - 支持自定义过期时间
 * - 自动清理过期数据
 *
 * 使用示例：
 *   import { cache } from '@/lib/cache';
 *   cache.set('key', data, 30 * 60 * 1000); // 30分钟
 *   const data = cache.get('key');
 */

/**
 * 缓存条目类型
 */
interface CacheEntry<T> {
  /** 缓存的数据 */
  data: T;
  /** 过期时间戳 */
  expiresAt: number;
}

/**
 * 缓存配置选项
 */
interface CacheOptions {
  /** 默认 TTL（毫秒），默认 30 分钟 */
  defaultTTL?: number;
  /** 最大缓存条目数，默认 1000 */
  maxSize?: number;
  /** 是否启用自动清理，默认 true */
  autoCleanup?: boolean;
  /** 自动清理间隔（毫秒），默认 5 分钟 */
  cleanupInterval?: number;
}

/**
 * 内存缓存类
 */
class MemoryCache {
  /** 缓存存储 */
  private store: Map<string, CacheEntry<unknown>> = new Map();

  /** 默认 TTL（毫秒） */
  private defaultTTL: number;

  /** 最大缓存条目数 */
  private maxSize: number;

  /** 自动清理定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * 构造函数
   * @param options - 缓存配置选项
   */
  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.defaultTTL ?? 30 * 60 * 1000; // 默认 30 分钟
    this.maxSize = options.maxSize ?? 1000;

    // 启动自动清理
    if (options.autoCleanup !== false) {
      this.startCleanup(options.cleanupInterval ?? 5 * 60 * 1000);
    }
  }

  /**
   * 获取缓存数据
   * @param key - 缓存键
   * @returns 缓存的数据，如果不存在或已过期则返回 null
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);

    // 不存在
    if (!entry) {
      return null;
    }

    // 已过期，删除并返回 null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * 设置缓存数据
   * @param key - 缓存键
   * @param data - 要缓存的数据
   * @param ttl - 过期时间（毫秒），不传则使用默认 TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // 如果缓存已满，删除最旧的条目
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.deleteOldest();
    }

    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);

    this.store.set(key, {
      data,
      expiresAt,
    });
  }

  /**
   * 检查缓存键是否存在且未过期
   * @param key - 缓存键
   * @returns 是否存在有效缓存
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * 删除指定缓存条目
   * @param key - 缓存键
   * @returns 是否删除成功
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * 获取缓存条目数量
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * 删除最旧的缓存条目（当缓存满时）
   */
  private deleteOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  /**
   * 清理过期条目
   */
  cleanup(): number {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * 启动自动清理定时器
   * @param interval - 清理间隔（毫秒）
   */
  private startCleanup(interval: number): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, interval);

    // 防止定时器阻止进程退出
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止自动清理定时器
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

/**
 * 全局缓存实例（默认 30 分钟过期）
 *
 * @example
 * // 设置缓存
 * cache.set('movie:123', movieData, 30 * 60 * 1000);
 *
 * // 获取缓存
 * const movie = cache.get<MovieData>('movie:123');
 */
export const cache = new MemoryCache({
  defaultTTL: 30 * 60 * 1000, // 30 分钟
  maxSize: 1000,
  autoCleanup: true,
  cleanupInterval: 5 * 60 * 1000, // 5 分钟清理一次
});

/**
 * 缓存键生成工具
 */
export const CacheKeys = {
  /** 豆瓣电影详情 */
  doubanMovie: (id: string) => `douban:movie:${id}`,
  /** 猫眼热映 */
  maoyanHot: () => 'maoyan:hot',
  /** 猫眼即将上映 */
  maoyanComing: () => 'maoyan:coming',
  /** 电影详情（通用） */
  movieDetail: (query: string) => `movie:detail:${query}`,
  /** 搜索建议 */
  searchSuggest: (query: string) => `suggest:${query.toLowerCase()}`,
};

export default cache;
