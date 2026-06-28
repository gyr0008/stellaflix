/**
 * API 服务 - StellaFlix Mobile
 * 复用现有 Next.js 后端 API
 */

import { API_BASE_URL } from '../constants/theme';

// 视频类型
export interface Movie {
  id: string;
  title: string;
  poster: string;
  backdrop: string;
  description: string;
  release_year: number;
  rating: number;
  duration: number;
  genre: string[];
  type: 'movie' | 'documentary' | 'other';
  video_url: string;
  created_at: string;
}

// 分页响应
export interface PaginatedResponse {
  data: Movie[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// 搜索响应
export interface SearchResponse {
  movies: Movie[];
  total: number;
}

/**
 * 获取视频列表
 * @param type - 类型：movie/documentary
 * @param genre - 分类筛选（可选）
 * @param page - 页码
 * @param limit - 每页数量
 * @returns 分页数据
 */
export async function fetchMovies(
  type: 'movie' | 'documentary' = 'movie',
  genre?: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse> {
  const params = new URLSearchParams({
    type,
    page: String(page),
    limit: String(limit),
  });

  if (genre) {
    params.append('genre', genre);
  }

  const response = await fetch(`${API_BASE_URL}/api/movies/list?${params}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

/**
 * 搜索视频
 * @param query - 搜索关键词
 * @param page - 页码
 * @param limit - 每页数量
 * @returns 搜索结果
 */
export async function searchMovies(
  query: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(`${API_BASE_URL}/api/search?${params}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取视频详情
 * @param id - 视频 ID
 * @returns 视频详情
 */
export async function getMovieDetail(id: string): Promise<Movie> {
  const response = await fetch(`${API_BASE_URL}/api/movies/${id}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取所有分类
 * @returns 分类列表
 */
export async function fetchGenres(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/genres`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export default {
  fetchMovies,
  searchMovies,
  getMovieDetail,
  fetchGenres,
};
