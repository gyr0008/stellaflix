/**
 * 猫眼电影 API 模块
 *
 * 功能：
 * - 获取正在热映电影
 * - 获取即将上映电影
 * - 支持数据格式转换（猫眼格式 → 标准格式）
 *
 * 数据源：猫眼移动端 API（公开接口）
 * 注意：该接口可能随时变化，需要关注维护
 */

import { cache, CacheKeys } from './cache';

/**
 * User-Agent 轮换池
 */
const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Mobile Safari/537.36',
];

/**
 * 随机获取 User-Agent
 */
function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 猫眼电影数据结构（API 原始格式）
 */
interface MaoyanRawMovie {
  /** 电影 ID */
  id?: number;
  /** 电影 ID（备选字段） */
  movieId?: number;
  /** 电影名称 */
  nm?: string;
  /** 电影名称（备选） */
  name?: string;
  /** 英文名称 */
  enm?: string;
  /** 评分 */
  sc?: number;
  /** 评分（备选） */
  score?: number;
  /** 海报 URL */
  img?: string;
  /** 导演 */
  dir?: string;
  /** 演员（逗号分隔） */
  star?: string;
  /** 类型（逗号分隔） */
  cat?: string;
  /** 上映日期 */
  rt?: string;
  /** 想看人数 */
  wish?: number;
  /** 时长 */
  dur?: number;
  /** 地区 */
  from?: string;
}

/**
 * 标准化的电影数据
 */
export interface MaoyanMovie {
  /** 来源标识 */
  source: 'maoyan';
  /** 电影 ID */
  id: number;
  /** 电影名称 */
  title: string;
  /** 英文名称 */
  originalTitle: string;
  /** 评分 */
  rating: number;
  /** 评分人数（模拟） */
  ratingCount: number;
  /** 海报 URL */
  posterUrl: string;
  /** 导演 */
  directors: string[];
  /** 演员 */
  actors: string[];
  /** 类型 */
  genres: string[];
  /** 上映日期 */
  releaseDate: string;
  /** 年份 */
  year: string;
  /** 时长（分钟） */
  runtime: number;
  /** 地区 */
  country: string;
}

/**
 * 猫眼 API 端点
 */
const MAOYAN_API = {
  /** 正在热映 */
  hot: 'https://api.maoyan.com/mmdb/movie/v3/list/hot.json',
  /** 即将上映 */
  coming: 'https://api.maoyan.com/mmdb/movie/v3/list/coming.json',
};

/**
 * 从猫眼 API 获取电影数据
 * @param type - 类型：hot（热映）| coming（即将上映）
 * @returns 原始电影数据数组
 */
async function fetchMaoyanRaw(type: 'hot' | 'coming'): Promise<MaoyanRawMovie[]> {
  const url = type === 'coming' ? MAOYAN_API.coming : MAOYAN_API.hot;

  const response = await fetch(url, {
    headers: {
      'User-Agent': getRandomUA(),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://m.maoyan.com/',
      'Origin': 'https://m.maoyan.com',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`猫眼 API 请求失败: ${response.status}`);
  }

  const json = await response.json();

  // 解析数据（猫眼 API 返回格式可能变化）
  if (json.data?.hot) {
    return json.data.hot;
  } else if (json.data?.coming) {
    return json.data.coming;
  } else if (json.data?.movieList) {
    return json.data.movieList;
  }

  throw new Error('猫眼 API 返回数据格式异常');
}

/**
 * 将猫眼原始数据转换为标准格式
 * @param rawMovies - 猫眼原始数据
 * @param type - 类型
 * @returns 标准化的电影数据数组
 */
function convertToStandardFormat(rawMovies: MaoyanRawMovie[], type: 'hot' | 'coming'): MaoyanMovie[] {
  return rawMovies.map((movie) => {
    // 提取 ID
    const id = movie.id || movie.movieId || Math.floor(Math.random() * 1000000);

    // 提取名称
    const title = movie.nm || movie.name || '未知电影';
    const originalTitle = movie.enm || title;

    // 提取评分（猫眼是 10 分制）
    const rating = movie.sc || movie.score || 0;

    // 提取海报
    let posterUrl = movie.img || '';
    // 转换为高清海报
    if (posterUrl && posterUrl.includes('w.h')) {
      posterUrl = posterUrl.replace('w.h', '464.664');
    }

    // 提取导演
    const directors = movie.dir
      ? movie.dir.split(',').map((d) => d.trim()).filter(Boolean)
      : ['未知'];

    // 提取演员（最多 5 位）
    const actors = movie.star
      ? movie.star.split(',').slice(0, 5).map((a) => a.trim()).filter(Boolean)
      : [];

    // 提取类型
    const genres = movie.cat
      ? movie.cat.split(',').map((g) => g.trim()).filter(Boolean)
      : ['剧情'];

    // 提取日期
    const releaseDate = movie.rt || '';
    const year = releaseDate ? releaseDate.substring(0, 4) : String(new Date().getFullYear());

    // 地区
    const country = movie.from || '中国大陆';

    // 时长
    const runtime = movie.dur || 0;

    return {
      source: 'maoyan' as const,
      id,
      title,
      originalTitle,
      rating,
      ratingCount: movie.wish || Math.floor(Math.random() * 100000) + 10000,
      posterUrl,
      directors,
      actors,
      genres,
      releaseDate,
      year,
      runtime,
      country,
    };
  });
}

/**
 * 获取正在热映电影
 * @param useCache - 是否使用缓存（默认 true）
 * @returns 电影列表
 */
export async function getHotMovies(useCache: boolean = true): Promise<MaoyanMovie[]> {
  const cacheKey = CacheKeys.maoyanHot();

  // 检查缓存
  if (useCache) {
    const cached = cache.get<MaoyanMovie[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const rawMovies = await fetchMaoyanRaw('hot');
    const movies = convertToStandardFormat(rawMovies, 'hot');

    // 缓存 10 分钟
    cache.set(cacheKey, movies, 10 * 60 * 1000);

    console.log(`猫眼热映：获取 ${movies.length} 部电影`);
    return movies;
  } catch (error) {
    console.error('获取猫眼热映失败:', error);
    return [];
  }
}

/**
 * 获取即将上映电影
 * @param useCache - 是否使用缓存（默认 true）
 * @returns 电影列表
 */
export async function getComingMovies(useCache: boolean = true): Promise<MaoyanMovie[]> {
  const cacheKey = CacheKeys.maoyanComing();

  // 检查缓存
  if (useCache) {
    const cached = cache.get<MaoyanMovie[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const rawMovies = await fetchMaoyanRaw('coming');
    const movies = convertToStandardFormat(rawMovies, 'coming');

    // 缓存 10 分钟
    cache.set(cacheKey, movies, 10 * 60 * 1000);

    console.log(`猫眼即将上映：获取 ${movies.length} 部电影`);
    return movies;
  } catch (error) {
    console.error('获取猫眼即将上映失败:', error);
    return [];
  }
}

export default {
  getHotMovies,
  getComingMovies,
};
